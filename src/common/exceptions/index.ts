// Acest fișier exportă toate excepțiile custom dintr-un singur loc.
// Astfel, în orice serviciu putem scrie:
//   import { ResourceNotFoundException, DuplicateResourceException, InvalidDataException } from '../common/exceptions';
// în loc să importăm din 3 fișiere separate.
export { ResourceNotFoundException } from './resource-not-found.exception';
export { DuplicateResourceException } from './duplicate-resource.exception';
export { InvalidDataException } from './invalid-data.exception';
