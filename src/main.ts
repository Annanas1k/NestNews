import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new PrismaExceptionFilter());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API available at http://localhost:${port}/api`);
}
void bootstrap();
