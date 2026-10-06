// Importăm clasa de bază ConflictException din NestJS.
// Aceasta trimite automat codul HTTP 409 (Conflict).
import { ConflictException } from '@nestjs/common';

// Această clasă reprezintă eroarea de "duplicat".
// O folosim când cineva încearcă să creeze o resursă cu o valoare
// care trebuie să fie unică, dar deja există în baza de date.
// Exemplu: două articole nu pot avea același slug.
export class DuplicateResourceException extends ConflictException {
  // Constructorul primește trei argumente:
  //   resourceName = numele resursei (ex: "Articolul", "Categoria")
  //   field        = câmpul care trebuie să fie unic (ex: "slug", "email")
  //   value        = valoarea duplicată (ex: "stiri-despre-sport")
  constructor(resourceName: string, field: string, value: string) {
    // Exemplu de mesaj generat: "Articolul cu slug "stiri-despre-sport" există deja"
    super(`${resourceName} cu ${field} "${value}" există deja`);
  }
}
