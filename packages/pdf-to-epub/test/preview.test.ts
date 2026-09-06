import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertPdf } from '../src/convert.js';
import { previewPage } from '../src/content/preview.js';
import { reconstruct } from '../src/content/chapters.js';
import { config, page, paragraph, png } from './fixtures.js';
import type { ConversionAdapter, PreviewEvent } from '../src/types.js';

function fixture() {
  const wrapped = paragraph('a con-');
  wrapped.lines.push(paragraph('text', 230).lines[0]);
  return [1, 2, 3].map((number) =>
    page(
      number,
      [
        paragraph('RUNNING HEADER', 10),
        wrapped,
        paragraph('context elsewhere & <text>'),
      ],
      false,
      'text',
    ),
  );
}

test('provisional cleanup is isolated, while final cleanup runs once with book-wide evidence', () => {
  const pages = fixture();
  const before = structuredClone(pages);
  const drafts = pages.map(previewPage);
  assert.deepEqual(pages, before);
  assert.match(drafts[0].content, /RUNNING HEADER/);
  assert.match(drafts[0].content, /a context/);
  assert.match(drafts[0].content, /&amp;/);
  const book = reconstruct(pages, config);
  assert.deepEqual(book, reconstruct(before, config));
  assert.doesNotMatch(book.chapters[0].content, /RUNNING HEADER/);
  assert.equal(
    pages[0].report.cleanup.filter((event) => event.action === 'join-hyphen')
      .length,
    1,
  );
  assert.equal(
    pages[0].report.cleanup.filter((event) => event.action === 'remove-header')
      .length,
    1,
  );
});

test('blank previews and image fallbacks use the same page components and borrowed bytes', () => {
  assert.match(previewPage(page(1, [], true)).content, /Blank source page/);
  const draft = previewPage({ ...page(2, [], false, 'image'), png });
  assert.equal(draft.images[0].bytes, png);
  assert.ok(draft.content.includes(draft.images[0].url));
  assert.match(draft.content, /id="p2"/);
});

function adapter() {
  const pages = fixture();
  let recognized = 0;
  let closed = 0;
  const runtime: ConversionAdapter = {
    async open() {
      return {
        count: pages.length,
        async render() {
          return { width: 1000, height: 1000, png, blank: false };
        },
        async recognize() {
          return {
            paragraphs: pages[recognized++].paragraphs,
            illustrations: false,
          };
        },
        async close() {
          closed++;
        },
      };
    },
  };
  return { runtime, closed: () => closed };
}
const options = {
  ...config,
  pages: { 1: 'text', 2: 'text', 3: 'text' } as const,
  chapters: [{ page: 1, title: 'Whole book' }],
};

test('observing previews preserves final report content and emits the assembled book last', async () => {
  const previews: PreviewEvent[] = [];
  const plain = await convertPdf(new Uint8Array(), options, adapter().runtime);
  const observed = await convertPdf(
    new Uint8Array(),
    options,
    adapter().runtime,
    { onPreview: (event) => previews.push(event) },
  );
  assert.deepEqual(observed.report.pages, plain.report.pages);
  assert.equal(observed.report.images, plain.report.images);
  assert.deepEqual(
    previews.map((event) => event.type),
    ['page', 'page', 'page', 'book'],
  );
  const last = previews.at(-1)!;
  assert.equal(last.type, 'book');
  if (last.type === 'book')
    assert.deepEqual(last.book, reconstruct(fixture(), options));
});

test('cancellation and observer errors stop preview publication and dispose the session', async () => {
  for (const kind of ['page', 'book'] as const) {
    const controller = new AbortController();
    const backend = adapter();
    const seen: PreviewEvent[] = [];
    await assert.rejects(
      convertPdf(new Uint8Array(), options, backend.runtime, {
        signal: controller.signal,
        onPreview(event) {
          seen.push(event);
          if (event.type === kind) controller.abort();
        },
      }),
      { name: 'AbortError' },
    );
    assert.equal(seen.at(-1)?.type, kind);
    assert.equal(backend.closed(), 1);
  }
  const backend = adapter();
  let calls = 0;
  await assert.rejects(
    convertPdf(new Uint8Array(), options, backend.runtime, {
      onPreview() {
        calls++;
        throw Error('observer failed');
      },
    }),
    /Page 1: observer failed/,
  );
  assert.equal(calls, 1);
  assert.equal(backend.closed(), 1);
  const early = adapter();
  await assert.rejects(
    convertPdf(new Uint8Array(), options, early.runtime, {
      signal: AbortSignal.abort(),
      onPreview() {
        assert.fail('aborted run emitted preview');
      },
    }),
    { name: 'AbortError' },
  );
});

test('cancellation from progress prevents subsequent page or final preview notifications', async () => {
  for (const stage of ['page-complete', 'cleanup', 'package']) {
    const controller = new AbortController();
    const seen: PreviewEvent[] = [];
    await assert.rejects(
      convertPdf(new Uint8Array(), options, adapter().runtime, {
        signal: controller.signal,
        onProgress(event) {
          if (event.stage === stage) controller.abort();
        },
        onPreview(event) {
          seen.push(event);
        },
      }),
      { name: 'AbortError' },
    );
    assert.equal(seen.length, stage === 'page-complete' ? 0 : 3);
    assert.ok(seen.every((event) => event.type === 'page'));
  }
});
