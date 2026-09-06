import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertPdf } from '../src/convert.js';
import type {
  ConversionAdapter,
  OCRData,
  Progress,
  PreviewEvent,
} from '../src/types.js';
import { config, png } from './fixtures.js';

function adapter(count = 2) {
  const calls = { opens: 0, closes: 0, recognized: 0 };
  const runtime: ConversionAdapter = {
    open: async () => {
      calls.opens++;
      return {
        count,
        close: async () => {
          calls.closes++;
        },
        render: async (number) => ({
          png,
          width: 1,
          height: 1,
          blank: number === 1,
        }),
        recognize: async () => {
          calls.recognized++;
          return { paragraphs: [], illustrations: false };
        },
      };
    },
  };
  return { runtime, calls };
}

test('conversion reports every source page and skips OCR only for white pages', async () => {
  const { runtime, calls } = adapter(3);
  const progress: Progress[] = [];
  const result = await convertPdf(new Uint8Array(), config, runtime, {
    onProgress: (event) => progress.push(event),
  });
  assert.equal(result.report.pageCount, 3);
  assert.deepEqual(
    result.report.pages.map((p) => p.mode),
    ['blank', 'image', 'image'],
  );
  assert.equal(result.report.images, 2);
  assert.equal(result.report.fallbackCount, 2);
  assert.equal(result.report.bytes, result.epub.length);
  assert.equal(result.report.workers, 1);
  assert.ok(
    Object.values(result.report.timings).every(
      (seconds) => Number.isFinite(seconds) && seconds >= 0,
    ),
  );
  assert.deepEqual([...result.epub.slice(0, 2)], [0x50, 0x4b]);
  assert.deepEqual(calls, { opens: 1, closes: 1, recognized: 2 });
  assert.deepEqual(
    progress.filter((event) => event.page === 1).map((event) => event.stage),
    ['render', 'render-complete', 'post-process', 'page-complete'],
  );
  for (const number of [2, 3])
    assert.deepEqual(
      progress
        .filter((event) => event.page === number)
        .map((event) => event.stage),
      ['render', 'render-complete', 'ocr', 'post-process', 'page-complete'],
    );
  assert.deepEqual(
    progress
      .filter((event) => event.stage === 'render-complete')
      .map((event) => event.blank),
    [true, false, false],
  );
  assert.deepEqual(progress.slice(-2), [
    { stage: 'cleanup', total: 3, completed: 3 },
    { stage: 'package', total: 3, completed: 3 },
  ]);
});

test('cancellation before opening and at each processing boundary never yields output', async () => {
  const { runtime, calls } = adapter();
  const early = new AbortController();
  early.abort();
  await assert.rejects(
    convertPdf(new Uint8Array(), config, runtime, { signal: early.signal }),
    { name: 'AbortError' },
  );
  assert.equal(calls.opens, 0);
  for (const stage of [
    'render-complete',
    'ocr',
    'post-process',
    'cleanup',
    'package',
  ]) {
    const controller = new AbortController();
    await assert.rejects(
      convertPdf(new Uint8Array(), config, runtime, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (progress.stage === stage) controller.abort();
        },
      }),
      { name: 'AbortError' },
    );
  }
  assert.deepEqual(calls, { opens: 5, closes: 5, recognized: 2 });
});

test('errors name the affected page and always close the runtime', async () => {
  const { runtime, calls } = adapter();
  const open = runtime.open;
  runtime.open = async (...args) => {
    const session = await open(...args);
    const render = session.render;
    session.render = async (number) => {
      if (number === 2) throw Error('bad image');
      return render(number);
    };
    return session;
  };
  await assert.rejects(
    convertPdf(new Uint8Array(), config, runtime),
    /Page 2: bad image/,
  );
  assert.equal(calls.closes, 1);
  await assert.rejects(
    convertPdf(new Uint8Array(), { ...config, coverPage: 3 }, runtime),
    /Invalid coverPage/,
  );
  assert.equal(calls.closes, 2);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

function controlledRuntime(
  count: number,
  concurrency?: number,
  blockedRender?: number,
) {
  const calls = {
    rendered: [] as number[],
    recognized: [] as number[],
    closes: 0,
    renderActive: 0,
    renderMax: 0,
    ocrActive: 0,
    ocrMax: 0,
  };
  const jobs = new Map<number, ReturnType<typeof deferred<OCRData>>>();
  const rendering = deferred<void>();
  let signal: AbortSignal | undefined;
  const runtime: ConversionAdapter = {
    open: async (_bytes, _language, internalSignal) => {
      signal = internalSignal;
      const pageNumbers = new Map<Uint8Array, number>();
      const cancel = () => {
        rendering.reject(signal?.reason);
        for (const job of jobs.values()) job.reject(signal?.reason);
      };
      // A render gate is used only in cancellation/error tests; always consume its rejection.
      void rendering.promise.catch(() => {});
      signal?.addEventListener('abort', cancel, { once: true });
      return {
        count,
        ...(concurrency === undefined ? {} : { concurrency }),
        close: async () => {
          calls.closes++;
          signal?.removeEventListener('abort', cancel);
        },
        render: async (number) => {
          calls.rendered.push(number);
          calls.renderActive++;
          calls.renderMax = Math.max(calls.renderMax, calls.renderActive);
          try {
            if (number === blockedRender) await rendering.promise;
            else await Promise.resolve();
            const bytes = new Uint8Array(png);
            pageNumbers.set(bytes, number);
            return { png: bytes, width: 1, height: 1, blank: false };
          } finally {
            calls.renderActive--;
          }
        },
        recognize: async (bytes) => {
          const number = pageNumbers.get(bytes)!;
          calls.recognized.push(number);
          calls.ocrActive++;
          calls.ocrMax = Math.max(calls.ocrMax, calls.ocrActive);
          const job = deferred<OCRData>();
          jobs.set(number, job);
          try {
            return await job.promise;
          } finally {
            calls.ocrActive--;
          }
        },
      };
    },
  };
  return { runtime, calls, jobs, rendering, signal: () => signal };
}

test('bounded pipeline completes OCR out of order with one rendered lookahead and ordered results', async () => {
  const { runtime, calls, jobs } = controlledRuntime(5, 2);
  const progress: Progress[] = [];
  const previews: PreviewEvent[] = [];
  const result = convertPdf(new Uint8Array(), config, runtime, {
    onProgress: (event) => progress.push(event),
    onPreview: (event) => previews.push(event),
  });
  await turn();
  assert.deepEqual(calls.rendered, [1, 2, 3]);
  assert.deepEqual(calls.recognized, [1, 2]);
  assert.deepEqual(
    progress.filter((event) => event.page === 3).map((event) => event.stage),
    ['render', 'render-complete'],
    'lookahead is reported as rendered while both OCR slots are occupied',
  );
  for (const page of [2, 3, 4, 5]) {
    jobs.get(page)!.resolve({ paragraphs: [], illustrations: false });
    await turn();
    assert.ok(
      calls.rendered.length -
        progress.filter((event) => event.stage === 'page-complete').length <=
        3,
    );
  }
  jobs.get(1)!.resolve({ paragraphs: [], illustrations: false });
  const output = await result;
  assert.deepEqual(
    progress
      .filter((event) => event.stage === 'page-complete')
      .map((event) => event.page),
    [2, 3, 4, 5, 1],
  );
  assert.deepEqual(
    progress
      .filter((event) => event.stage === 'page-complete')
      .map((event) => event.completed),
    [1, 2, 3, 4, 5],
  );
  assert.equal(progress.at(-1)!.completed, 5);
  assert.deepEqual(
    output.report.pages.map((page) => page.page),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    previews
      .filter((event) => event.type === 'page')
      .map((event) => event.page),
    [2, 3, 4, 5, 1],
  );
  assert.equal(previews.at(-1)!.type, 'book');
  assert.equal(previews.filter((event) => event.type === 'book').length, 1);
  assert.equal(output.report.workers, 2);
  assert.equal(calls.renderMax, 1);
  assert.equal(calls.ocrMax, 2);
  assert.equal(calls.closes, 1);
});

test('adapters without a capacity preserve sequential rendering and OCR', async () => {
  const { runtime, calls, jobs } = controlledRuntime(2);
  const result = convertPdf(new Uint8Array(), config, runtime);
  await turn();
  assert.deepEqual(calls.rendered, [1]);
  jobs.get(1)!.resolve({ paragraphs: [], illustrations: false });
  await turn();
  assert.deepEqual(calls.rendered, [1, 2]);
  jobs.get(2)!.resolve({ paragraphs: [], illustrations: false });
  assert.equal((await result).report.workers, 1);
  assert.equal(calls.ocrMax, 1);
});

test('a single-worker pipeline overlaps one render without starting a second OCR job', async () => {
  const { runtime, calls, jobs } = controlledRuntime(2, 1);
  const result = convertPdf(new Uint8Array(), config, runtime);
  await turn();
  assert.deepEqual(calls.rendered, [1, 2]);
  assert.deepEqual(calls.recognized, [1]);
  jobs.get(1)!.resolve({ paragraphs: [], illustrations: false });
  await turn();
  jobs.get(2)!.resolve({ paragraphs: [], illustrations: false });
  await result;
  assert.equal(calls.ocrMax, 1);
});

test('OCR failure cancels in-flight lookahead and preserves the first page error', async () => {
  const { runtime, calls, jobs, signal } = controlledRuntime(5, 2, 3);
  const failure = new Error('recognizer failed');
  const progress: Progress[] = [];
  const result = convertPdf(new Uint8Array(), config, runtime, {
    onProgress(event) {
      progress.push(event);
      if (event.stage === 'page-error') throw Error('observer failed');
    },
  });
  const rejected = assert.rejects(result, (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Page 2: recognizer failed');
    assert.equal(error.cause, failure);
    return true;
  });
  await turn();
  jobs.get(2)!.reject(failure);
  await rejected;
  assert.deepEqual(
    progress.filter((event) => event.stage === 'page-error'),
    [{ stage: 'page-error', page: 2, total: 5, completed: 0 }],
  );
  assert.equal(progress.at(-1)!.stage, 'page-error');
  assert.equal(signal()!.aborted, true);
  assert.deepEqual(calls.rendered, [1, 2, 3]);
  assert.deepEqual(calls.recognized, [1, 2]);
  assert.equal(calls.renderActive, 0);
  assert.equal(calls.ocrActive, 0);
  assert.equal(calls.closes, 1);
});

test('lookahead render failure names that page and drains active recognizers', async () => {
  const { runtime, calls, rendering } = controlledRuntime(5, 2, 3);
  const failure = new Error('render failed');
  const progress: Progress[] = [];
  const result = convertPdf(new Uint8Array(), config, runtime, {
    onProgress: (event) => progress.push(event),
  });
  const rejected = assert.rejects(result, (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Page 3: render failed');
    assert.equal(error.cause, failure);
    return true;
  });
  await turn();
  rendering.reject(failure);
  await rejected;
  assert.deepEqual(
    progress.filter((event) => event.stage === 'page-error'),
    [{ stage: 'page-error', page: 3, total: 5, completed: 0 }],
  );
  assert.equal(calls.renderActive, 0);
  assert.equal(calls.ocrActive, 0);
  assert.equal(calls.closes, 1);
});

test('external cancellation aborts all active work and never starts packaging', async () => {
  const { runtime, calls, signal } = controlledRuntime(5, 2, 3);
  const controller = new AbortController();
  const progress: Progress[] = [];
  const result = convertPdf(new Uint8Array(), config, runtime, {
    signal: controller.signal,
    onProgress: (event) => progress.push(event),
  });
  const rejected = assert.rejects(result, { name: 'AbortError' });
  await turn();
  assert.notEqual(
    signal(),
    controller.signal,
    'the runtime receives an internal linked signal',
  );
  controller.abort();
  await rejected;
  assert.equal(calls.renderActive, 0);
  assert.equal(calls.ocrActive, 0);
  assert.equal(calls.closes, 1);
  assert.equal(
    progress.some((event) =>
      ['cleanup', 'package', 'page-error'].includes(event.stage),
    ),
    false,
  );
});
