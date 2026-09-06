import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPage } from '../src/ocr/classify.js';
import { normalizeOCR } from '../src/ocr/normalize.js';
import { page, paragraph } from './fixtures.js';

test('empty OCR cannot erase a nonblank page; explicit overrides win', () => {
  assert.equal(classifyPage(page(1)).mode, 'text');
  assert.equal(classifyPage(page(1, [])).mode, 'image');
  assert.equal(classifyPage(page(1, [], true)).mode, 'blank');
  assert.equal(classifyPage(page(1, []), 'text').mode, 'text');
  assert.equal(classifyPage(page(1, [], true), 'image').mode, 'image');
});

test('confidence, captions, equations, illustrations, and columns trigger fallbacks', () => {
  const low = classifyPage(page(1, [paragraph('word '.repeat(40), 200, 50)]));
  assert.deepEqual(low.reasons, ['mean-confidence', 'low-confidence-fraction']);
  assert.equal(low.confidence, 50);
  assert.ok(
    classifyPage({ ...page(1), illustrations: true }).reasons.includes(
      'illustration',
    ),
  );
  assert.ok(
    classifyPage(page(1, [paragraph('x = y')])).reasons.includes('equation'),
  );
  assert.ok(
    classifyPage(page(1, [paragraph('TABLE IV: Statistics')])).reasons.includes(
      'figure-or-table-caption',
    ),
  );
  const left = paragraph('Left', 200);
  const right = paragraph('Right', 200);
  left.bbox.y1 = right.bbox.y1 = 250;
  right.bbox.x0 = 600;
  right.bbox.x1 = 900;
  assert.ok(
    classifyPage(page(1, [left, right])).reasons.includes('column-order'),
  );
});

test('normalization retains structure and only needed word data', () => {
  const value = normalizeOCR(
    {
      paragraphs: [paragraph(' one \t two\u0001 ', 200)],
      illustrations: true,
    },
    1000,
    1000,
    1,
    false,
  );
  assert.equal(value.illustrations, true);
  assert.equal(value.paragraphs[0].lines[0].text, 'one two');
  assert.equal(value.paragraphs[0].lines[0].words[0].confidence, 96);
});
