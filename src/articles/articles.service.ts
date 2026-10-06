import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { FindArticlesDto } from './dto/find-articles.dto';
import { ArticleStatus } from '../generated/prisma/client.js';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  ResourceNotFoundException,
  DuplicateResourceException,
} from '../common/exceptions';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateArticleDto, authorId: string) {
    // Verifică că categoria există
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new ResourceNotFoundException('Categoria', dto.categoryId);
    }

    // Verifică unicitatea slug-ului
    const existingArticle = await this.prisma.article.findUnique({
      where: { slug: dto.slug },
    });
    if (existingArticle) {
      throw new DuplicateResourceException('Articolul', 'slug', dto.slug);
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
      throw new ResourceNotFoundException('Articolul', id);
    }

    return article;
  }

  async update(id: string, dto: UpdateArticleDto, currentUser: CurrentUserPayload) {
    const article = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!article) {
      throw new ResourceNotFoundException('Articolul', id);
    }

    // Autorizare: rolul AUTHOR poate actualiza doar articolele proprii
    if (currentUser.role === 'AUTHOR' && article.authorId !== currentUser.id) {
      throw new ForbiddenException(
        'Puteți actualiza doar propriile articole',
      );
    }

    // Dacă se schimbă categoria, verifică că cea nouă există
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new ResourceNotFoundException('Categoria', dto.categoryId);
      }
    }

    // Setează publishedAt la tranziția inițială la PUBLISHED
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
      throw new ResourceNotFoundException('Articolul', id);
    }

    // Autorizare: rolul AUTHOR poate șterge doar articolele proprii
    if (currentUser.role === 'AUTHOR' && article.authorId !== currentUser.id) {
      throw new ForbiddenException(
        'Puteți șterge doar propriile articole',
      );
    }

    await this.prisma.article.delete({ where: { id } });
    return { message: `Articolul cu ID-ul "${id}" a fost șters cu succes` };
  }

  async incrementViews(id: string) {
    // Returnează silențios dacă articolul nu există (nu blocăm findOne)
    return this.prisma.article.update({
      where: { id },
      data: { viewsCount: { increment: 1 } },
    }).catch(() => null);
  }
}
