// Importăm clasa de bază BadRequestException din NestJS.
// Aceasta trimite automat codul HTTP 400 (Bad Request).
import { BadRequestException } from '@nestjs/common';

// Această clasă reprezintă eroarea de "date invalide".
// O folosim când datele trimise de utilizator nu au sens din punct de vedere logic.
// Exemplu: o categorie nu poate fi propria ei categorie părinte.
export class InvalidDataException extends BadRequestException {
  // Constructorul primește un singur argument: mesajul de eroare.
  // Mesajul trebuie să fie clar și specific problemei.
  constructor(message: string) {
    super(message);
  }
}
