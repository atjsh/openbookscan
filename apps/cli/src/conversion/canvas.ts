import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

// PDF.js reads these globals while its module initializes.
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
