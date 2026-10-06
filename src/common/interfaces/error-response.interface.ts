// Această interfață definește structura exactă a răspunsului de eroare.
// Orice eroare din API va returna un JSON cu exact aceste câmpuri.
//
// Exemplu de răspuns generat:
// {
//   "status": 404,
//   "error": "Not Found",
//   "message": "Articolul cu ID-ul "abc" nu a fost găsit",
//   "timestamp": "2026-10-01T17:00:00.000Z"
// }
export interface ErrorResponse {
  // Codul HTTP numeric (ex: 400, 404, 409, 500)
  status: number;

  // Textul standard al codului HTTP (ex: "Not Found", "Conflict")
  error: string;

  // Mesajul de eroare citit de utilizator
  message: string;

  // Momentul exact când a apărut eroarea (format ISO 8601)
  timestamp: string;
}
