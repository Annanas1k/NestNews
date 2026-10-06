// Importăm ce avem nevoie din NestJS și din bibliotecile externe
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from '@prisma/client-runtime-utils';
import { Response } from 'express';
import { ErrorResponse } from '../interfaces/error-response.interface';

// @Catch() fără argumente înseamnă că acest filtru prinde ORICE eroare
// care nu a fost tratată altundeva în aplicație.
// NestJS îl va apela automat ori de câte ori se aruncă o eroare.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  // Logger-ul NestJS afișează mesaje în consolă cu prefixul clasei.
  // Îl folosim pentru a înregistra erorile grave pe server.
  private readonly logger = new Logger(AllExceptionsFilter.name);

  // Aceasta este metoda principală, apelată de NestJS la fiecare eroare.
  // exception = eroarea aruncată
  // host      = obiect care ne dă acces la request și response HTTP
  catch(exception: unknown, host: ArgumentsHost): void {
    // Obținem obiectul de tip Response din Express ca să putem trimite răspunsul
    const response = host.switchToHttp().getResponse<Response>();

    // Construim răspunsul de eroare
    const errorResponse = this.buildErrorResponse(exception);

    // Trimitem răspunsul JSON cu codul HTTP corespunzător
    response.status(errorResponse.status).json(errorResponse);
  }

  // Această metodă analizează tipul erorii și construiește răspunsul potrivit.
  // Returnează întotdeauna un obiect de tip ErrorResponse.
  private buildErrorResponse(exception: unknown): ErrorResponse {
    // Momentul curent în format ISO (ex: "2026-10-01T17:00:00.000Z")
    const timestamp = new Date().toISOString();

    // ────────────────────────────────────────────────────────
    // CAZUL 1: Erori HTTP (HttpException și subclasele sale)
    // Includ: excepțiile noastre custom, NotFoundException,
    // BadRequestException, ForbiddenException, etc.
    // ────────────────────────────────────────────────────────
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // Extragem mesajul din corpul excepției
      let message: string;

      if (typeof body === 'string') {
        // Corpul este deja un string simplu
        message = body;
      } else if (typeof body === 'object' && body !== null && 'message' in body) {
        // Corpul este un obiect cu câmpul "message"
        const rawMessage = (body as Record<string, unknown>)['message'];

        if (Array.isArray(rawMessage)) {
          // class-validator trimite un array de mesaje la validare eșuată.
          // Le unim într-un singur string, separate prin "; "
          message = rawMessage.join('; ');
        } else {
          message = String(rawMessage);
        }
      } else {
        message = exception.message;
      }

      return {
        status,
        error: this.getStatusText(status),
        message,
        timestamp,
      };
    }

    // ────────────────────────────────────────────────────────
    // CAZUL 2: Erori Prisma cu coduri cunoscute
    // Acestea apar când baza de date refuză o operație
    // (ex: valoare duplicată, record negăsit, cheie externă invalidă)
    // ────────────────────────────────────────────────────────
    if (exception instanceof PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception, timestamp);
    }

    // ────────────────────────────────────────────────────────
    // CAZUL 3: Erori de validare Prisma
    // Apar când trimitem date de tipul greșit către Prisma
    // (ex: string în loc de număr)
    // ────────────────────────────────────────────────────────
    if (exception instanceof PrismaClientValidationError) {
      // Înregistrăm detaliile pe server, dar nu le trimitem clientului
      this.logger.warn(`Eroare validare Prisma: ${exception.message}`);

      return {
        status: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Date invalide trimise către baza de date',
        timestamp,
      };
    }

    // ────────────────────────────────────────────────────────
    // CAZUL 4: Orice altă eroare neprevăzută → 500
    // Nu trimitem detaliile tehnice clientului (risc de securitate).
    // Le înregistrăm pe server cu logger.error().
    // ────────────────────────────────────────────────────────
    const mesajTehnic = exception instanceof Error ? exception.message : String(exception);
    const stackTrace = exception instanceof Error ? exception.stack : undefined;

    this.logger.error(`Eroare neașteptată: ${mesajTehnic}`, stackTrace);

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'A apărut o eroare internă. Vă rugăm să încercați din nou mai târziu.',
      timestamp,
    };
  }

  // Gestionează erorile Prisma cu cod specific.
  // Fiecare cod Prisma corespunde unui tip de problemă cu baza de date.
  private handlePrismaError(
    exception: PrismaClientKnownRequestError,
    timestamp: string,
  ): ErrorResponse {
    // exception.code = codul erorii Prisma (ex: "P2002")
    // exception.meta = informații extra despre eroare (ex: câmpul problematic)

    if (exception.code === 'P2002') {
      // P2002 = Unique constraint violation
      // Cineva a încercat să salveze o valoare care trebuie să fie unică,
      // dar deja există în baza de date.
      const campuri = (exception.meta?.target as string[])?.join(', ') ?? 'câmp necunoscut';
      return {
        status: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: `Există deja o înregistrare cu aceeași valoare pentru: ${campuri}`,
        timestamp,
      };
    }

    if (exception.code === 'P2025') {
      // P2025 = Record not found
      // Prisma a încercat să actualizeze sau să șteargă un record care nu există.
      const cauza = (exception.meta?.cause as string) ?? 'Înregistrarea solicitată nu a fost găsită';
      return {
        status: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: cauza,
        timestamp,
      };
    }

    if (exception.code === 'P2003') {
      // P2003 = Foreign key constraint failed
      // Am referit un ID care nu există în tabela legată
      // (ex: categoryId care nu există în tabela categories).
      const camp = (exception.meta?.field_name as string) ?? 'câmp necunoscut';
      return {
        status: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: `Relație invalidă: ID-ul furnizat pentru câmpul "${camp}" nu există`,
        timestamp,
      };
    }

    if (exception.code === 'P2014') {
      // P2014 = Required relation violation
      // Nu putem efectua operația deoarece există dependențe (alte tabele depind de acest record).
      const relatie = (exception.meta?.relation_name as string) ?? 'relație necunoscută';
      return {
        status: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: `Operațiunea nu poate fi finalizată din cauza dependențelor existente pe "${relatie}"`,
        timestamp,
      };
    }

    // Orice alt cod Prisma pe care nu l-am tratat explicit → 500
    this.logger.error(`Eroare Prisma netrată [${exception.code}]: ${exception.message}`, exception.stack);
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'A apărut o eroare internă. Vă rugăm să încercați din nou mai târziu.',
      timestamp,
    };
  }

  // Convertim codul HTTP numeric în textul standard corespunzător.
  // Exemplu: 404 → "Not Found", 409 → "Conflict"
  private getStatusText(status: number): string {
    const texte: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      500: 'Internal Server Error',
    };

    // Dacă nu găsim codul în map, returnăm "Error" ca fallback
    return texte[status] ?? 'Error';
  }
}
