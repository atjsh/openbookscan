import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconstruct } from '../src/content/chapters.js';
import { config, page, paragraph, png } from './fixtures.js';

test('chapter bodies retain source anchors, escaped prose, and footnote order', () => {
  const footnote = paragraph('1 A footnote & explanation.', 800);
  footnote.lines[0].bbox.y1 = 810;
  const value = page(
    1,
    [paragraph('Clear body text with enough words. '.repeat(10)), footnote],
    false,
    'text',
  );
  const book = reconstruct([value], config);
  const html = book.chapters[0].content;
  assert.match(html, /id="p1"/);
  assert.match(html, /epub:type="pagebreak"/);
  assert.match(
    html,
    /<p class="footnote">1 A footnote &amp; explanation\.<\/p>/,
  );
  assert.ok(html.indexOf('Clear body text') < html.indexOf('1 A footnote'));
  assert.doesNotMatch(html, /<h1|<html|<body/);
});

test('multiple page counts, chapter starts, blank pages, and retained image bytes', () => {
  for (const count of [1, 2, 4]) {
    const pages = Array.from({ length: count }, (_, index) => page(index + 1));
    const book = reconstruct(pages, config);
    assert.equal(book.chapters.length, count);
    assert.equal(
      (
        book.chapters
          .map((c) => c.content)
          .join('')
          .match(/epub:type="pagebreak"/g) ?? []
      ).length,
      count,
    );
  }
  const pages = [
    page(1, [], true),
    { ...page(2, []), png },
    { ...page(3), png },
  ];
  const book = reconstruct(pages, {
    ...config,
    chapters: [{ page: 2, title: 'Content' }],
    coverPage: 3,
  });
  assert.deepEqual(
    book.chapters.map((chapter) => chapter.title),
    ['Front matter', 'Content'],
  );
  assert.match(book.chapters[0].content, /Blank source page/);
  assert.equal(book.images.length, 1);
  assert.equal(book.images[0].bytes, png);
  assert.equal(book.cover?.bytes, png);
  assert.match(
    book.chapters[1].content,
    /https:\/\/openbookscan.invalid\/images\/page-2.png/,
  );
  assert.doesNotMatch(book.chapters[1].content, /page-3.png/);
});
