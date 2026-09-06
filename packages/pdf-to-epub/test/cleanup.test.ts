import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanParagraphs, collectEvidence } from '../src/content/cleanup.js';
import { page, paragraph } from './fixtures.js';

test('running headers require evidence from three distinct pages', () => {
  const pages = Array.from({ length: 3 }, (_, i) =>
    page(
      i + 1,
      [paragraph('RUNNING HEADER', 10), paragraph('Body text')],
      false,
      'text',
    ),
  );
  assert.equal(
    cleanParagraphs(pages[0], collectEvidence(pages)).some(
      (p) => p.text === 'RUNNING HEADER',
    ),
    false,
  );
  assert.deepEqual(pages[0].report.cleanup, [
    { action: 'remove-header', text: 'RUNNING HEADER' },
  ]);
  assert.equal(
    cleanParagraphs(pages[0], collectEvidence(pages.slice(0, 2))).some(
      (p) => p.text === 'RUNNING HEADER',
    ),
    true,
  );
  const repeated = page(
    1,
    Array.from({ length: 3 }, () => paragraph('RUNNING HEADER', 10)),
  );
  assert.equal(collectEvidence([repeated]).headers.get('running header'), 1);
});

test('hyphen joins require book vocabulary and remain within a paragraph', () => {
  const wrapped = paragraph('a con-');
  wrapped.lines.push(paragraph('text', 230).lines[0]);
  const value = page(1, [
    wrapped,
    paragraph('context elsewhere'),
    paragraph('un-'),
    paragraph('known'),
  ]);
  assert.deepEqual(
    cleanParagraphs(value, collectEvidence([value])).map((p) => p.text),
    ['a context', 'context elsewhere', 'un-', 'known'],
  );
  assert.deepEqual(value.report.cleanup, [
    { action: 'join-hyphen', from: 'con- text', to: 'context' },
  ]);
  const noEvidence = page(1, [wrapped]);
  assert.equal(
    cleanParagraphs(noEvidence, collectEvidence([noEvidence]))[0].text,
    'a con- text',
  );
});
