import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import Tesseract from 'tesseract.js';
import { openRecognizer } from '../src/conversion/ocr.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function fixture(t: TestContext, id = 'worker') {
  const result = {
    jobId: 'recognize',
    data: { blocks: [], hocr: '<div class="ocr_photo">' },
  } as unknown as Tesseract.RecognizeResult;
  const methods = {
    setParameters: t.mock.fn(async () => ({ jobId: 'parameters', data: {} })),
    recognize: t.mock.fn(async () => result),
    terminate: t.mock.fn(async () => ({ jobId: 'terminate', data: {} })),
  };
  return {
    ...methods,
    result,
    worker: { id, ...methods } as unknown as Tesseract.Worker,
  };
}

for (const [model, supportsSimd] of [
  ['fast', true],
  ['fast', false],
  ['best', true],
  ['best', false],
] as const) {
  test(
    `${model} initializes concurrent workers with SIMD support ${supportsSimd}`,
    { timeout: 1000 },
    async (t) => {
      const validate = t.mock.method(
        WebAssembly,
        'validate',
        () => supportsSimd,
      );
      const workers = Array.from({ length: 8 }, (_, i) => fixture(t, `${i}`));
      const pending = workers.map(() => deferred<Tesseract.Worker>());
      let index = 0;
      const create = t.mock.method(
        Tesseract,
        'createWorker',
        () => pending[index++].promise,
      );
      const opening = openRecognizer('eng+deu', workers.length, model);
      await setImmediate();
      assert.equal(validate.mock.callCount(), model === 'best' ? 1 : 0);
      assert.equal(create.mock.callCount(), workers.length);
      for (const {
        arguments: [language, oem, options],
      } of create.mock.calls) {
        assert.equal(language, 'eng+deu');
        assert.equal(oem, Tesseract.OEM.LSTM_ONLY);
        assert.equal(options?.workerPath, undefined);
        assert.equal(options?.workerBlobURL, undefined);
        assert.equal(
          options?.corePath,
          model === 'best'
            ? supportsSimd
              ? 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-simd-lstm.wasm.js'
              : 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-lstm.wasm.js'
            : undefined,
        );
        assert.equal(
          options?.langPath,
          `https://raw.githubusercontent.com/tesseract-ocr/tessdata_${model}/4.1.0`,
        );
        assert.equal(options?.gzip, false);
        assert.equal(options?.cacheMethod, 'none');
      }
      pending.forEach((job, i) => job.resolve(workers[i].worker));
      const ocr = await opening;
      for (const worker of workers) {
        assert.deepEqual(worker.setParameters.mock.calls[0].arguments, [
          {
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,
            user_defined_dpi: '300',
          },
        ]);
        assert.equal(worker.worker.recognize, worker.recognize);
      }
      const png = new Uint8Array([1, 2]);
      assert.deepEqual(await ocr.recognize(png), {
        paragraphs: [],
        illustrations: true,
      });
      assert.deepEqual(
        workers[0].recognize.mock.calls[0].arguments.slice(0, 3),
        [png, {}, { text: false, blocks: true, hocr: true }],
      );
      await Promise.all([ocr.close(), ocr.close()]);
      for (const worker of workers)
        assert.equal(worker.terminate.mock.callCount(), 1);
      await assert.rejects(ocr.recognize(png), { name: 'AbortError' });
    },
  );
}

test('cancellation during SIMD detection creates no workers and closes the scheduler', async (t) => {
  t.mock.method(WebAssembly, 'validate', () => true);
  const scheduler = Tesseract.createScheduler();
  const terminate = t.mock.method(scheduler, 'terminate');
  t.mock.method(Tesseract, 'createScheduler', () => scheduler);
  const create = t.mock.method(Tesseract, 'createWorker');
  const controller = new AbortController();
  const opening = openRecognizer(
    'eng',
    2,
    'best',
    undefined,
    controller.signal,
  );
  controller.abort();
  await assert.rejects(opening, { name: 'AbortError' });
  assert.equal(create.mock.callCount(), 0);
  assert.equal(terminate.mock.callCount(), 1);
});

test('SIMD detection failure preserves the error and closes the scheduler', async (t) => {
  const failure = Error('Cannot detect SIMD');
  t.mock.method(WebAssembly, 'validate', () => {
    throw failure;
  });
  const scheduler = Tesseract.createScheduler();
  const terminate = t.mock.method(scheduler, 'terminate');
  t.mock.method(Tesseract, 'createScheduler', () => scheduler);
  const create = t.mock.method(Tesseract, 'createWorker');
  await assert.rejects(
    openRecognizer('eng', 2, 'best'),
    (error) => error === failure,
  );
  assert.equal(create.mock.callCount(), 0);
  assert.equal(terminate.mock.callCount(), 1);
});

test(
  'close cancels running and queued recognition without another dispatch',
  { timeout: 1000 },
  async (t) => {
    const f = fixture(t);
    const recognition = deferred<Tesseract.RecognizeResult>();
    f.recognize.mock.mockImplementation(() => recognition.promise);
    t.mock.method(Tesseract, 'createWorker', async () => f.worker);
    const ocr = await openRecognizer('eng', 1, 'fast');
    const running = assert.rejects(ocr.recognize(new Uint8Array([1])), {
      name: 'AbortError',
    });
    const queued = assert.rejects(ocr.recognize(new Uint8Array([2])), {
      name: 'AbortError',
    });
    await ocr.close();
    await Promise.all([running, queued]);
    recognition.resolve(f.result);
    await setImmediate();
    assert.equal(f.recognize.mock.callCount(), 1);
    assert.equal(f.terminate.mock.callCount(), 1);
  },
);

test(
  'cancellation disposes registered and late workers without waiting for initialization',
  { timeout: 1000 },
  async (t) => {
    const ready = fixture(t, 'ready');
    const late = fixture(t, 'late');
    const arriving = deferred<Tesseract.Worker>();
    const configuring = deferred<void>();
    ready.setParameters.mock.mockImplementation(() => {
      configuring.resolve();
      return new Promise(() => {});
    });
    let index = 0;
    t.mock.method(Tesseract, 'createWorker', () =>
      index++ === 0 ? Promise.resolve(ready.worker) : arriving.promise,
    );
    const controller = new AbortController();
    const opening = openRecognizer(
      'eng',
      2,
      'fast',
      undefined,
      controller.signal,
    );
    const rejected = assert.rejects(opening, { name: 'AbortError' });
    await configuring.promise;
    controller.abort();
    await rejected;
    assert.equal(ready.terminate.mock.callCount(), 1);
    arriving.resolve(late.worker);
    await setImmediate();
    assert.equal(late.terminate.mock.callCount(), 1);
    assert.equal(late.setParameters.mock.callCount(), 0);
  },
);

test(
  'an initialization error callback rejects application waits and disposes late workers',
  { timeout: 1000 },
  async (t) => {
    const f = fixture(t);
    const arriving = deferred<Tesseract.Worker>();
    const create = t.mock.method(
      Tesseract,
      'createWorker',
      () => arriving.promise,
    );
    const opening = openRecognizer('eng', 1, 'fast');
    const rejected = assert.rejects(opening, {
      name: 'Error',
      message: 'Model download failed',
    });
    create.mock.calls[0].arguments[2]?.errorHandler?.('Model download failed');
    await rejected;
    arriving.resolve(f.worker);
    await setImmediate();
    assert.equal(f.terminate.mock.callCount(), 1);
    assert.equal(f.setParameters.mock.callCount(), 0);
  },
);

test(
  'parameter setup failure closes registered workers and preserves the error',
  { timeout: 1000 },
  async (t) => {
    const f = fixture(t);
    const failure = Error('Cannot set parameters');
    f.setParameters.mock.mockImplementation(async () => {
      throw failure;
    });
    t.mock.method(Tesseract, 'createWorker', async () => f.worker);
    await assert.rejects(
      openRecognizer('eng', 1, 'fast'),
      (error) => error === failure,
    );
    assert.equal(f.terminate.mock.callCount(), 1);
  },
);

test('invalid worker counts and pre-cancelled calls create no workers', async (t) => {
  const create = t.mock.method(Tesseract, 'createWorker');
  for (const count of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(openRecognizer('eng', count, 'fast'), /workerCount/);
  }
  await assert.rejects(
    openRecognizer('eng', 1, 'fast', undefined, AbortSignal.abort()),
    { name: 'AbortError' },
  );
  assert.equal(create.mock.callCount(), 0);
});
