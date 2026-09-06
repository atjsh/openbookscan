import type { ConversionSession } from '@openbookscan/pdf-to-epub';
import type { PdfSource, PngRecognizer } from './types.js';
import { aborted, wait } from './cancellation.js';

// The capabilities own cancellation. The session only coordinates their cleanup,
// including a recognizer that arrives after opening has failed or been cancelled.
export async function createSession(
  pdf: PdfSource,
  opening: Promise<PngRecognizer>,
  concurrency: number,
  signal?: AbortSignal,
): Promise<ConversionSession> {
  let closed: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closed ??= (async () => {
      await Promise.allSettled([
        Promise.resolve().then(() => pdf.close()),
        opening.then((ocr) => ocr.close()),
      ]);
    })());
  try {
    const ocr = await wait(opening, signal);
    aborted(signal);
    return {
      count: pdf.count,
      concurrency,
      render: pdf.render,
      recognize: ocr.recognize,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
