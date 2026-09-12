/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FindCategoriesDto } from './dto/find-categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent category with id "${dto.parentId}" not found`,
        );
      }
    }

    return this.prisma.category.create({
      data: dto,
    });
  }

  async findAll(dto: FindCategoriesDto) {
    const { skip = 0, take = 20, search } = dto;

    const where = search
      ? { name: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take,
        include: {
          children: {
            select: { id: true, name: true, slug: true },
          },
          _count: { select: { articles: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.category.count({ where }),
    ]);

    return { data, total, skip, take };
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }

    return category;
  }

  async getTree(id: string) {
    const category = await this.findOne(id);
    return this.loadChildrenRecursively(category);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.findOne(id);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new ConflictException('A category cannot be its own parent');
      }

      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent category with id "${dto.parentId}" not found`,
        );
      }

      const isDescendant = await this.isDescendantOf(dto.parentId, id);
      if (isDescendant) {
        throw new ConflictException(
          'A category cannot become a descendant of itself (circular reference detected)',
        );
      }
    }

    return this.prisma.category.update({
      where: { id: category.id },
      data: dto,
    });
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { articles: true } } },
    });

    if (!category) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }

    if (category._count.articles > 0) {
      throw new ConflictException(
        `Cannot delete category "${category.name}": it still has ${category._count.articles} associated article(s)`,
      );
    }

    return this.prisma.category.delete({ where: { id } });
  }

  /**
   * Checks whether `candidateId` is a descendant of `ancestorId`
   * by walking up the parent chain from `candidateId`.
   */
  private async isDescendantOf(
    candidateId: string,
    ancestorId: string,
  ): Promise<boolean> {
    let currentId: string | null = candidateId;

    while (currentId) {
      const current = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });

      if (!current || !current.parentId) {
        return false;
      }

      if (current.parentId === ancestorId) {
        return true;
      }

      currentId = current.parentId;
    }

    return false;
  }

  /**
   * Recursively loads children to build a full subtree.
   */
  private async loadChildrenRecursively(
    category: Record<string, any>,
  ): Promise<Record<string, any>> {
    const children = await this.prisma.category.findMany({
      where: { parentId: category.id },
    });

    const childrenWithDescendants = await Promise.all(
      children.map((child) => this.loadChildrenRecursively(child)),
    );

    return { ...category, children: childrenWithDescendants };
  }
}
