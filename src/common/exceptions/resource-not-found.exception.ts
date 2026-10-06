// Importăm clasa de bază NotFoundException din NestJS.
// Aceasta trimite automat codul HTTP 404 (Not Found).
import { NotFoundException } from '@nestjs/common';

// Această clasă reprezintă eroarea de "resursă negăsită".
// O folosim când căutăm ceva în baza de date și nu există.
// Exemplu: căutăm articolul cu id "123" și nu există → aruncăm această eroare.
export class ResourceNotFoundException extends NotFoundException {
  // Constructorul primește două argumente:
  //   resourceName = numele resursei (ex: "Articolul", "Categoria")
  //   id           = id-ul căutat (ex: "abc-123")
  constructor(resourceName: string, id: string) {
    // Apelăm constructorul clasei părinte cu un mesaj clar în română.
    // Exemplu de mesaj generat: "Articolul cu ID-ul "abc-123" nu a fost găsit"
    super(`${resourceName} cu ID-ul "${id}" nu a fost găsit`);
  }
}
