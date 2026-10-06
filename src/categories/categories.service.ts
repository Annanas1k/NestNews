/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { FindCategoriesDto } from './dto/find-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  ResourceNotFoundException,
  DuplicateResourceException,
  InvalidDataException,
} from '../common/exceptions';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new ResourceNotFoundException('Categoria părinte', dto.parentId);
      }
    }

    // Verifică unicitatea numelui
    const existingByName = await this.prisma.category.findUnique({
      where: { name: dto.name },
    });
    if (existingByName) {
      throw new DuplicateResourceException('Categoria', 'numele', dto.name);
    }

    // Verifică unicitatea slug-ului
    const existingBySlug = await this.prisma.category.findUnique({
      where: { slug: dto.slug },
    });
    if (existingBySlug) {
      throw new DuplicateResourceException('Categoria', 'slug', dto.slug);
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
      throw new ResourceNotFoundException('Categoria', id);
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
        throw new InvalidDataException(
          'O categorie nu poate fi propria sa categorie părinte',
        );
      }

      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new ResourceNotFoundException('Categoria părinte', dto.parentId);
      }

      const isDescendant = await this.isDescendantOf(dto.parentId, id);
      if (isDescendant) {
        throw new InvalidDataException(
          'O categorie nu poate deveni descendenta sa proprie (referință circulară detectată)',
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
      throw new ResourceNotFoundException('Categoria', id);
    }

    if (category._count.articles > 0) {
      throw new InvalidDataException(
        `Categoria "${category.name}" nu poate fi ștearsă: are ${category._count.articles} articol(e) asociat(e)`,
      );
    }

    await this.prisma.category.delete({ where: { id } });
    return { message: `Categoria "${category.name}" a fost ștearsă cu succes` };
  }

  /**
   * Verifică dacă `candidateId` este un descendent al `ancestorId`
   * parcurgând lanțul de categorii părinte de la `candidateId` în sus.
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
   * Încarcă recursiv copiii pentru a construi un arbore complet.
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
