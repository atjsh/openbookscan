import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OCRData, RenderedPage } from '@openbookscan/pdf-to-epub';
import { createSession } from '../src/conversion/session.js';
import type { PdfSource, PngRecognizer } from '../src/conversion/types.js';
import { recognitionData } from '../src/conversion/ocr.js';
import { wait } from '../src/conversion/cancellation.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const calls = {
    pdfClosed: 0,
    ocrClosed: 0,
    rendered: [] as number[],
    recognized: [] as Uint8Array[],
  };
  const raster: RenderedPage = {
    width: 1,
    height: 1,
    blank: false,
    png: new Uint8Array([1]),
  };
  const data: OCRData = { paragraphs: [], illustrations: false };
  const pdf: PdfSource = {
    count: 3,
    async render(page) {
      calls.rendered.push(page);
      return raster;
    },
    async close() {
      calls.pdfClosed++;
    },
  };
  const ocr: PngRecognizer = {
    async recognize(png) {
      calls.recognized.push(png);
      return data;
    },
    async close() {
      calls.ocrClosed++;
    },
  };
  const connect = (opening = Promise.resolve(ocr), signal?: AbortSignal) =>
    createSession(pdf, opening, signal);
  return { calls, raster, data, pdf, ocr, connect };
}

test('session delegates only rendering and recognition capabilities', async () => {
  const f = fixture();
  const session = await f.connect();
  assert.equal(session.count, 3);
  assert.equal(session.concurrency, undefined);
  assert.equal(await session.render(2), f.raster);
  assert.equal(await session.recognize(f.raster.png), f.data);
  assert.deepEqual(f.calls.rendered, [2]);
  assert.equal(f.calls.recognized[0], f.raster.png);
  await Promise.all([session.close(), session.close()]);
  assert.equal(f.calls.pdfClosed, 1);
  assert.equal(f.calls.ocrClosed, 1);
});

test('recognizer initialization failure closes the acquired PDF', async () => {
  const f = fixture();
  const failure = Error('initialization failed');
  f.pdf.close = () => {
    f.calls.pdfClosed++;
    throw Error('cleanup failed');
  };
  await assert.rejects(
    f.connect(Promise.reject(failure)),
    (error) => error === failure,
  );
  assert.equal(f.calls.pdfClosed, 1);
});

test('cancellation waits for a late recognizer and its disposal', async () => {
  const f = fixture();
  const arriving = deferred<PngRecognizer>();
  const disposing = deferred<void>();
  const disposalStarted = deferred<void>();
  f.ocr.close = async () => {
    f.calls.ocrClosed++;
    disposalStarted.resolve();
    await disposing.promise;
  };
  const controller = new AbortController();
  let finished = false;
  const opening = f.connect(arriving.promise, controller.signal).finally(() => {
    finished = true;
  });
  const rejected = assert.rejects(opening, { name: 'AbortError' });
  controller.abort();
  arriving.resolve(f.ocr);
  await disposalStarted.promise;
  assert.equal(f.calls.pdfClosed, 1);
  assert.equal(finished, false);
  disposing.resolve();
  await rejected;
  assert.equal(f.calls.ocrClosed, 1);
});

test('an already-cancelled opening still disposes both capabilities', async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.connect(Promise.resolve(f.ocr), controller.signal), {
    name: 'AbortError',
  });
  assert.equal(f.calls.pdfClosed, 1);
  assert.equal(f.calls.ocrClosed, 1);
});

test('session close awaits capability-owned cancellation and PDF encoding cleanup', async () => {
  const f = fixture();
  const encoding = deferred<RenderedPage>();
  const recognition = deferred<OCRData>();
  const pdfController = new AbortController();
  const ocrController = new AbortController();
  f.pdf.render = async () => wait(encoding.promise, pdfController.signal);
  f.ocr.recognize = async () => wait(recognition.promise, ocrController.signal);
  f.pdf.close = async () => {
    pdfController.abort();
    await encoding.promise;
    f.calls.pdfClosed++;
  };
  f.ocr.close = async () => {
    ocrController.abort();
    f.calls.ocrClosed++;
  };
  const session = await f.connect();
  const rendering = assert.rejects(session.render(1), { name: 'AbortError' });
  const recognizing = assert.rejects(session.recognize(f.raster.png), {
    name: 'AbortError',
  });
  let finished = false;
  const closing = session.close().then(() => {
    finished = true;
  });
  await Promise.all([rendering, recognizing]);
  assert.equal(finished, false);
  assert.equal(f.calls.ocrClosed, 1);
  encoding.resolve(f.raster);
  await closing;
  recognition.resolve(f.data);
  assert.equal(f.calls.pdfClosed, 1);
  await assert.rejects(session.render(1), { name: 'AbortError' });
  await assert.rejects(session.recognize(f.raster.png), { name: 'AbortError' });
});

test('Tesseract fields translate into independent paragraphs and illustration flags', () => {
  const bbox = { x0: 0, y0: 0, x1: 1, y1: 1 };
  const paragraphs = [
    {
      bbox,
      lines: [
        { bbox, text: 'Word', words: [{ text: 'Word', confidence: 95 }] },
      ],
    },
  ];
  assert.deepEqual(
    recognitionData({ blocks: [{ blocktype: 9, paragraphs }] }),
    { paragraphs, illustrations: true },
  );
  assert.equal(
    recognitionData({ layoutBlocks: [{ type: 'image' }] }).illustrations,
    true,
  );
  assert.equal(
    recognitionData({ hocr: '<div class="ocr_photo">' }).illustrations,
    true,
  );
  assert.deepEqual(recognitionData({}), {
    paragraphs: [],
    illustrations: false,
  });
});

test('an already-cancelled wait consumes a late backend rejection', async () => {
  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () => wait(Promise.reject(Error('late failure')), controller.signal),
    { name: 'AbortError' },
  );
  await new Promise((resolve) => setImmediate(resolve));
});
