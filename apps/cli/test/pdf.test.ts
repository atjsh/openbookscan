import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { openPdf } from '../src/conversion/pdf.js';

function samplePdf(): Uint8Array {
  const text = 'BT /F1 18 Tf 20 70 Td (A readable sample page.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 288 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  pdf += offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

test('PDF rendering preserves input bytes and supports reopening after close', async () => {
  const bytes = samplePdf();
  const original = bytes.slice();
  for (let attempt = 0; attempt < 2; attempt++) {
    const pdf = await openPdf(bytes);
    try {
      assert.equal(pdf.count, 1);
      const page = await pdf.render(1);
      assert.equal(page.blank, false);
      assert.deepEqual(
        [...page.png.slice(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10],
      );
      assert.deepEqual(bytes, original);
    } finally {
      await Promise.all([pdf.close(), pdf.close()]);
    }
    await assert.rejects(pdf.render(1), { name: 'AbortError' });
  }
});

test('cancelling a PDF waits for pending PNG encoding before closing', async (t) => {
  let start!: () => void;
  let finish!: (png: Buffer) => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const encoding = new Promise<Buffer>((resolve) => {
    finish = resolve;
  });
  t.mock.method(Object.getPrototypeOf(createCanvas(1, 1)), 'encode', () => {
    start();
    return encoding;
  });
  const controller = new AbortController();
  const pdf = await openPdf(samplePdf(), controller.signal);
  const rejected = assert.rejects(pdf.render(1), { name: 'AbortError' });
  await started;
  controller.abort();
  let closed = false;
  const closing = pdf.close().then(() => {
    closed = true;
  });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(closed, false);
  } finally {
    finish(Buffer.alloc(0));
    await Promise.all([closing, rejected]);
  }
  assert.equal(closed, true);
});
