import type { OCRData, OCRPage } from '../types.js';

export function normalizeOCR(
  data: OCRData,
  width: number,
  height: number,
  page: number,
  blank: boolean,
): OCRPage {
  const paragraphs = data.paragraphs
    .map((paragraph) => ({
      bbox: paragraph.bbox,
      lines: paragraph.lines
        .map((line) => ({
          bbox: line.bbox,
          text: line.text
            // eslint-disable-next-line no-control-regex -- Remove OCR control characters that are invalid in XML.
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
            .trim()
            .replace(/\s+/g, ' '),
          words: line.words.map((word) => ({
            text: word.text,
            confidence: word.confidence,
          })),
        }))
        .filter((line) => line.text),
    }))
    .filter((paragraph) => paragraph.lines.length);
  return {
    page,
    width,
    height,
    blank,
    paragraphs,
    illustrations: data.illustrations,
  };
}
