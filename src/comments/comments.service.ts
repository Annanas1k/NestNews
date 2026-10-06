import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ModerateCommentDto } from './dto/moderate-comment.dto';
import { FindCommentsDto } from './dto/find-comments.dto';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  ResourceNotFoundException,
  InvalidDataException,
} from '../common/exceptions';

export interface CommentWithReplies {
  replies: CommentWithReplies[];
  [key: string]: any;
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCommentDto, authorId: string) {
    // Verifică că articolul există
    const article = await this.prisma.article.findUnique({
      where: { id: dto.articleId },
    });
    if (!article) {
      throw new ResourceNotFoundException('Articolul', dto.articleId);
    }

    // Dacă este furnizat parentId, verifică că comentariul părinte există
    // și aparține aceluiași articol
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new ResourceNotFoundException('Comentariul părinte', dto.parentId);
      }
      if (parent.articleId !== dto.articleId) {
        throw new InvalidDataException(
          'Comentariul părinte nu aparține aceluiași articol',
        );
      }
    }

    // Status-ul este întotdeauna PENDING indiferent de ce trimite clientul
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
    // Verifică că articolul există
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
    });
    if (!article) {
      throw new ResourceNotFoundException('Articolul', articleId);
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
      throw new ResourceNotFoundException('Comentariul', id);
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
      throw new ResourceNotFoundException('Comentariul', id);
    }

    // Utilizatorul poate șterge propriul comentariu; ADMIN/EDITOR pot șterge orice comentariu
    const isOwner = comment.authorId === currentUser.id;
    const isModerator =
      currentUser.role === 'ADMIN' || currentUser.role === 'EDITOR';

    if (!isOwner && !isModerator) {
      throw new ForbiddenException('Puteți șterge doar propriile comentarii');
    }

    await this.prisma.comment.delete({ where: { id } });
    return { message: `Comentariul cu ID-ul "${id}" a fost șters cu succes` };
  }

  /**
   * Transformă o listă plată de comentarii într-o structură arborescentă.
   * Fiecare nod primește un array `replies` cu copiii săi direcți, recursiv.
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
