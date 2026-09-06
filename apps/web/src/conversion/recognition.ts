import type { Box, OCRData, OCRWord } from '@openbookscan/pdf-to-epub';

interface LayoutBlock {
  blocktype?: string | number;
  type?: string;
}
interface RecognitionOutput {
  blocks?:
    | (LayoutBlock & {
        paragraphs?: {
          bbox: Box;
          lines?: { bbox: Box; text: string; words?: OCRWord[] }[];
        }[];
      })[]
    | null;
  layoutBlocks?: LayoutBlock[] | null;
  hocr?: string | null;
}

// Only the fields needed to translate Tesseract output cross this local boundary.
export function recognitionData(data: RecognitionOutput): OCRData {
  const layout: LayoutBlock[] = data.layoutBlocks ?? data.blocks ?? [];
  return {
    paragraphs: (data.blocks ?? []).flatMap((block) =>
      (block.paragraphs ?? []).map((paragraph) => ({
        bbox: paragraph.bbox,
        lines: (paragraph.lines ?? []).map((line) => ({
          bbox: line.bbox,
          text: line.text,
          words: (line.words ?? []).map(({ text, confidence }) => ({
            text,
            confidence,
          })),
        })),
      })),
    ),
    illustrations:
      layout.some(
        (block) =>
          [9, 10, 11].includes(Number(block.blocktype)) ||
          /image/i.test(String(block.blocktype ?? block.type ?? '')),
      ) || /class=['"]ocr_photo['"]/.test(data.hocr ?? ''),
  };
}
