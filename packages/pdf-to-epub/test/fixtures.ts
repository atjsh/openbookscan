import type {
  ConversionConfig,
  OCRParagraph,
  ProcessedPage,
  PageMode,
} from '../src/types.js';
import { classifyPage } from '../src/ocr/classify.js';

export const config: ConversionConfig = {
  metadata: { title: 'Generic & tests', author: 'Test Author', language: 'en' },
};
export const png = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+j4z8AAAAASUVORK5CYII=',
    'base64',
  ),
);
export function paragraph(
  text: string,
  y = 200,
  confidence = 96,
): OCRParagraph {
  return {
    bbox: { x0: 20, y0: y, x1: 500, y1: y + 20 },
    lines: [
      {
        bbox: { x0: 20, y0: y, x1: 500, y1: y + 20 },
        text,
        words: text
          .split(' ')
          .filter(Boolean)
          .map((text) => ({ text, confidence })),
      },
    ],
  };
}
export function page(
  number: number,
  paragraphs = [
    paragraph(
      'Clear body text with enough words for a reliable paragraph. '.repeat(6),
    ),
  ],
  blank = false,
  override: PageMode = 'auto',
): ProcessedPage {
  const value = {
    page: number,
    width: 1000,
    height: 1000,
    blank,
    paragraphs,
    illustrations: false,
  };
  return { ...value, report: classifyPage(value, override) };
}
