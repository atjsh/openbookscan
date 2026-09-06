import { createWorker, PSM } from 'tesseract.js';
import { resolve } from 'node:path';
import type { Box, OCRData, OCRWord } from '@openbookscan/pdf-to-epub';
import type { PngRecognizer } from './types.js';
import { aborted, wait } from './cancellation.js';

export async function openRecognizer(
  language: string,
  languagePath = 'assets/ocr',
  signal?: AbortSignal,
): Promise<PngRecognizer> {
  aborted(signal);
  const controller = new AbortController();
  const pending = Promise.resolve().then(() =>
    createWorker(language, 1, {
      langPath: resolve(languagePath),
      gzip: false,
      cacheMethod: 'none',
      errorHandler: () => {},
    }),
  );
  let closed: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (closed) return closed;
    signal?.removeEventListener('abort', cancel);
    controller.abort(signal?.reason);
    // Initialization exposes the worker only after it settles; await it before disposal.
    closed = pending
      .then(async (worker) => {
        await worker.terminate();
      })
      .catch(() => {});
    return closed;
  };
  const cancel = () => {
    void close();
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const worker = await wait(pending, controller.signal);
    aborted(controller.signal);
    await wait(
      worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        user_defined_dpi: '300',
      }),
      controller.signal,
    );
    aborted(controller.signal);
    return {
      close,
      async recognize(png) {
        aborted(controller.signal);
        const { data } = await wait(
          worker.recognize(
            Buffer.from(png.buffer, png.byteOffset, png.byteLength),
            {},
            { text: false, blocks: true, hocr: true },
          ),
          controller.signal,
        );
        return recognitionData(data);
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

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
