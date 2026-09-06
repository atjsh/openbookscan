import { assembleEpub } from '@openbookscan/epub';
import { aborted, wait } from './cancellation.js';
import { validateConfig } from './config.js';
import { reconstruct } from './content/chapters.js';
import { previewPage } from './content/preview.js';
import { classifyPage } from './ocr/classify.js';
import { normalizeOCR } from './ocr/normalize.js';
import { conversionReport } from './report.js';
import type {
  ConversionAdapter,
  ConversionConfig,
  ConversionOptions,
  ConversionResult,
  ConversionSession,
  ConversionTimings,
  ProcessedPage,
  RenderedPage,
} from './types.js';

export async function convertPdf(
  bytes: Uint8Array,
  config: ConversionConfig,
  adapter: ConversionAdapter,
  { signal, onProgress = () => {}, onPreview }: ConversionOptions = {},
): Promise<ConversionResult> {
  validateConfig(config);
  aborted(signal);
  const started = performance.now();
  const timings: ConversionTimings = {
    initialize: 0,
    render: 0,
    ocr: 0,
    cleanup: 0,
    package: 0,
  };
  const controller = new AbortController();
  const relayAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', relayAbort, { once: true });
  let session: ConversionSession | undefined;
  let closing: Promise<void> | undefined;
  let failed = false;
  let failure: { page: number; error: unknown } | undefined;
  let completed = 0;
  const pages: ProcessedPage[] = [];
  const active = new Set<Promise<void>>();
  const close = () =>
    (closing ??= Promise.resolve().then(() => session?.close()));
  const measure = async <T>(
    stage: keyof ConversionTimings,
    work: () => T | Promise<T>,
  ): Promise<T> => {
    const start = performance.now();
    try {
      return await work();
    } finally {
      timings[stage] += (performance.now() - start) / 1000;
    }
  };
  const fail = (page: number, error: unknown) => {
    if (!failure && !controller.signal.aborted) {
      failure = { page, error };
      controller.abort(error);
    }
  };
  const check = () => {
    if (failure) throw failure.error;
    aborted(controller.signal);
  };
  try {
    session = await measure('initialize', () =>
      adapter.open(bytes, config.language ?? 'eng', controller.signal),
    );
    check();
    const runtime = session;
    const count = runtime.count;
    if (!Number.isInteger(count) || count < 1)
      throw Error('PDF contains no valid pages');
    if (
      runtime.concurrency !== undefined &&
      (!Number.isInteger(runtime.concurrency) || runtime.concurrency < 1)
    ) {
      throw Error('OCR concurrency must be a positive integer');
    }
    const workers = Math.min(runtime.concurrency ?? 1, count);
    validateConfig(config, count);
    const recognize = async (number: number, raster: RenderedPage) => {
      check();
      if (!raster.blank)
        onProgress({ stage: 'ocr', page: number, total: count, completed });
      check();
      const data = raster.blank
        ? { paragraphs: [], illustrations: false }
        : await measure('ocr', () =>
            wait(runtime.recognize(raster.png), controller.signal),
          );
      check();
      onProgress({
        stage: 'post-process',
        page: number,
        total: count,
        completed,
      });
      check();
      await measure('cleanup', () => {
        const normalized = normalizeOCR(
          data,
          raster.width,
          raster.height,
          number,
          raster.blank,
        );
        const report = classifyPage(
          normalized,
          config.pages?.[number] ?? 'auto',
        );
        const page: ProcessedPage = { ...normalized, report };
        if (report.mode === 'image' || config.coverPage === number)
          page.png = raster.png;
        pages[number - 1] = page;
      });
      check();
      completed++;
      onProgress({
        stage: 'page-complete',
        ...pages[number - 1].report,
        total: count,
        completed,
      });
      check();
      if (onPreview) {
        const preview = await measure('cleanup', () =>
          previewPage(pages[number - 1]),
        );
        check();
        onPreview(preview);
        check();
      }
    };
    try {
      for (let number = 1; number <= count; number++) {
        check();
        let raster: RenderedPage;
        try {
          onProgress({
            stage: 'render',
            page: number,
            total: count,
            completed,
          });
          check();
          raster = await measure('render', () =>
            wait(runtime.render(number), controller.signal),
          );
          check();
          onProgress({
            stage: 'render-complete',
            page: number,
            total: count,
            completed,
            blank: raster.blank,
          });
          check();
        } catch (error) {
          fail(number, error);
          throw error;
        }
        // Only this producer renders. At capacity it holds one rendered page until an OCR slot opens.
        while (active.size >= workers) {
          await Promise.race(active);
          check();
        }
        check();
        const task = recognize(number, raster)
          .catch((error) => fail(number, error))
          .finally(() => active.delete(task));
        active.add(task);
        // Adapters without an explicit concurrency retain their original sequential lifecycle.
        if (runtime.concurrency === undefined) {
          await task;
          check();
        }
      }
    } finally {
      await Promise.allSettled(active);
    }
    check();
    if (completed !== count || pages.length !== count)
      throw Error('PDF conversion did not cover every source page');
    onProgress({ stage: 'cleanup', total: count, completed });
    check();
    const book = await measure('cleanup', () => reconstruct(pages, config));
    await measure('cleanup', close);
    check();
    onProgress({ stage: 'package', total: count, completed });
    await new Promise((resolve) => setTimeout(resolve, 0));
    check();
    const epub = await measure('package', () =>
      assembleEpub(book, { signal: controller.signal }),
    );
    check();
    onPreview?.({ type: 'book', book });
    check();
    return {
      epub,
      report: conversionReport(
        pages,
        book.images.length + (book.cover ? 1 : 0),
        epub.length,
        started,
        workers,
        timings,
      ),
    };
  } catch (error) {
    failed = true;
    aborted(signal);
    const reason = failure?.error ?? error;
    if (failure) {
      try {
        onProgress({
          stage: 'page-error',
          page: failure.page,
          total: session!.count,
          completed,
        });
      } catch {
        // A progress observer must not replace the original page failure.
      }
    }
    throw new Error(
      `${failure ? `Page ${failure.page}: ` : ''}${reason instanceof Error ? reason.message : String(reason)}`,
      // eslint-disable-next-line preserve-caught-error -- Keep the original worker failure as the cause when it precedes the caught error.
      { cause: reason },
    );
  } finally {
    signal?.removeEventListener('abort', relayAbort);
    try {
      await close();
    } catch (error) {
      // eslint-disable-next-line no-unsafe-finally -- Surface cleanup errors only when no conversion error is already propagating.
      if (!failed) throw error;
    }
  }
}
