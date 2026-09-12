import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { FindArticlesDto } from './dto/find-articles.dto';
import { ArticleStatus } from '../generated/prisma/client.js';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateArticleDto, authorId: string) {
    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Category with id "${dto.categoryId}" not found`,
      );
    }

    // Verify slug uniqueness
    const existingArticle = await this.prisma.article.findUnique({
      where: { slug: dto.slug },
    });
    if (existingArticle) {
      throw new ConflictException(
        `An article with slug "${dto.slug}" already exists`,
      );
    }

    return this.prisma.article.create({
      data: {
        ...dto,
        authorId,
        publishedAt:
          dto.status === ArticleStatus.PUBLISHED ? new Date() : null,
      },
    });
  }

  async findAll(query: FindArticlesDto) {
    const { skip = 0, take = 20, status, categoryId, search } = query;

    const where: Record<string, any> = {};

    if (status) {
      where.status = status;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' as const } },
        { excerpt: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        skip,
        take,
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          category: {
            select: { id: true, name: true, slug: true },
          },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.article.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async findOne(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        category: {
          select: { id: true, name: true, slug: true },
        },
        comments: {
          where: { status: 'APPROVED' },
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!article) {
      throw new NotFoundException(`Article with id "${id}" not found`);
    }

    return article;
  }

  async update(id: string, dto: UpdateArticleDto, currentUser: CurrentUserPayload) {
    const article = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!article) {
      throw new NotFoundException(`Article with id "${id}" not found`);
    }

    // Authorization: AUTHOR role can only update their own articles
    if (currentUser.role === 'AUTHOR' && article.authorId !== currentUser.id) {
      throw new ForbiddenException(
        'You can only update your own articles',
      );
    }

    // If category is being changed, verify the new one exists
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(
          `Category with id "${dto.categoryId}" not found`,
        );
      }
    }

    // Set publishedAt when transitioning to PUBLISHED for the first time
    const data: Record<string, any> = { ...dto };
    if (
      dto.status === ArticleStatus.PUBLISHED &&
      article.publishedAt === null
    ) {
      data.publishedAt = new Date();
    }

    return this.prisma.article.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, currentUser: CurrentUserPayload) {
    const article = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!article) {
      throw new NotFoundException(`Article with id "${id}" not found`);
    }

    // Authorization: AUTHOR role can only delete their own articles
    if (currentUser.role === 'AUTHOR' && article.authorId !== currentUser.id) {
      throw new ForbiddenException(
        'You can only delete your own articles',
      );
    }

    return this.prisma.article.delete({ where: { id } });
  }

  async incrementViews(id: string) {
    return this.prisma.article.update({
      where: { id },
      data: { viewsCount: { increment: 1 } },
    });
  }
}
