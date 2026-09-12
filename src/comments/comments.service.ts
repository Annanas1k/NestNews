import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ModerateCommentDto } from './dto/moderate-comment.dto';
import { FindCommentsDto } from './dto/find-comments.dto';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

export interface CommentWithReplies {
  replies: CommentWithReplies[];
  [key: string]: any;
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCommentDto, authorId: string) {
    // Verify article exists
    const article = await this.prisma.article.findUnique({
      where: { id: dto.articleId },
    });
    if (!article) {
      throw new NotFoundException(
        `Article with id "${dto.articleId}" not found`,
      );
    }

    // If parentId is provided, verify the parent comment exists
    // and belongs to the same article
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent comment with id "${dto.parentId}" not found`,
        );
      }
      if (parent.articleId !== dto.articleId) {
        throw new BadRequestException(
          'Parent comment does not belong to the same article',
        );
      }
    }

    // Status is always PENDING regardless of what the client sends
    return this.prisma.comment.create({
      data: {
        content: dto.content,
        articleId: dto.articleId,
        parentId: dto.parentId ?? null,
        authorId,
        status: 'PENDING',
      },
    });
  }

  async findApprovedByArticle(articleId: string) {
    // Verify article exists
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
    });
    if (!article) {
      throw new NotFoundException(
        `Article with id "${articleId}" not found`,
      );
    }

    const comments = await this.prisma.comment.findMany({
      where: {
        articleId,
        status: 'APPROVED',
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return this.buildTree(comments);
  }

  async findPending(query: FindCommentsDto) {
    const { skip = 0, take = 20, status } = query;

    const where: Record<string, any> = {
      status: status ?? 'PENDING',
    };

    const [items, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        skip,
        take,
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          article: {
            select: { id: true, title: true, slug: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.comment.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async moderate(id: string, dto: ModerateCommentDto) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
    });
    if (!comment) {
      throw new NotFoundException(`Comment with id "${id}" not found`);
    }

    return this.prisma.comment.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async remove(id: string, currentUser: CurrentUserPayload) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
    });
    if (!comment) {
      throw new NotFoundException(`Comment with id "${id}" not found`);
    }

    // User can delete own comment; ADMIN/EDITOR can delete any comment
    const isOwner = comment.authorId === currentUser.id;
    const isModerator =
      currentUser.role === 'ADMIN' || currentUser.role === 'EDITOR';

    if (!isOwner && !isModerator) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    return this.prisma.comment.delete({ where: { id } });
  }

  /**
   * Transforms a flat list of comments into a nested tree structure.
   * Each node gets a `replies` array containing its direct children, recursively.
   */
  private buildTree(
    comments: Record<string, any>[],
    parentId: string | null = null,
  ): CommentWithReplies[] {
    return comments
      .filter((c) => c.parentId === parentId)
      .map((c) => ({
        ...c,
        replies: this.buildTree(comments, c.id as string),
      }));
  }
}
