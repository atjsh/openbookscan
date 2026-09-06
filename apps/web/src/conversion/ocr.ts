import Tesseract from 'tesseract.js';
import type { ImageLike } from 'tesseract.js';
import { simd } from 'wasm-feature-detect';
import type { OcrModel, PngRecognizer } from './types.js';
import { aborted, wait } from './cancellation.js';
import { recognitionData } from './recognition.js';

export async function openRecognizer(
  language: string,
  workerCount: number,
  model: OcrModel,
  languagePath?: string,
  signal?: AbortSignal,
): Promise<PngRecognizer> {
  aborted(signal);
  if (!Number.isSafeInteger(workerCount) || workerCount < 1)
    throw Error('workerCount must be a positive integer');
  const langPath = languagePath
    ? new URL(languagePath, new URL(import.meta.env.BASE_URL, location.href))
        .href
    : `https://raw.githubusercontent.com/tesseract-ocr/tessdata_${model}/4.1.0`;
  const controller = new AbortController();
  const scheduler = Tesseract.createScheduler();
  let closed: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (closed) return closed;
    signal?.removeEventListener('abort', cancel);
    controller.abort(signal?.reason);
    return (closed = scheduler.terminate());
  };
  const cancel = () => {
    void close();
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    let corePath: string | undefined;
    if (model === 'best' || languagePath) {
      const supportsSimd = await wait(simd(), controller.signal);
      aborted(controller.signal);
      corePath = `https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-${supportsSimd ? 'simd-' : ''}lstm.wasm.js`;
    }
    await wait(
      Promise.all(
        Array.from({ length: workerCount }, async () => {
          const worker = await Tesseract.createWorker(
            language,
            Tesseract.OEM.LSTM_ONLY,
            {
              corePath,
              langPath,
              gzip: false,
              cacheMethod: 'none',
              errorHandler: (error: unknown) =>
                controller.abort(
                  error instanceof Error ? error : new Error(String(error)),
                ),
            },
          );
          if (controller.signal.aborted) {
            await worker.terminate();
            aborted(controller.signal);
          }
          scheduler.addWorker(worker);
          await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,
            user_defined_dpi: '300',
          });
        }),
      ),
      controller.signal,
    );
    aborted(controller.signal);
    return {
      close,
      async recognize(png) {
        aborted(controller.signal);
        // Tesseract accepts PNG bytes at runtime; its ImageLike declaration omits Uint8Array.
        const { data } = await wait(
          scheduler.addJob(
            'recognize',
            png as unknown as ImageLike,
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
