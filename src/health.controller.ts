import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<'yes' | 'no'> {
    return (await this.prisma.isDatabaseAvailable()) ? 'yes' : 'no';
  }
}
