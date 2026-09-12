import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { Request, Response } from 'express';

@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.mapPrismaError(exception);

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private mapPrismaError(exception: PrismaClientKnownRequestError): {
    status: number;
    message: string;
    error: string;
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[])?.join(', ') ?? 'unknown field';
        return {
          status: HttpStatus.CONFLICT,
          message: `Unique constraint violation on: ${target}`,
          error: 'Conflict',
        };
      }

      case 'P2003': {
        const field = (exception.meta?.field_name as string) ?? 'unknown field';
        return {
          status: HttpStatus.BAD_REQUEST,
          message: `Invalid relation: foreign key constraint failed on field "${field}"`,
          error: 'Bad Request',
        };
      }

      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message:
            (exception.meta?.cause as string) ?? 'Record not found',
          error: 'Not Found',
        };

      case 'P2014': {
        const relationName = (exception.meta?.relation_name as string) ?? 'unknown relation';
        return {
          status: HttpStatus.CONFLICT,
          message: `Relation violation: the operation cannot be completed because of existing dependencies on "${relationName}"`,
          error: 'Conflict',
        };
      }

      default:
        this.logger.error(
          `Unhandled Prisma error [${exception.code}]: ${exception.message}`,
          exception.stack,
        );
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: 'Internal Server Error',
        };
    }
  }
}
