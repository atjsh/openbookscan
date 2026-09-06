import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config.js';
import { config } from './fixtures.js';

test('metadata and page configuration are validated at the public boundary', () => {
  validateConfig(config);
  validateConfig(
    {
      ...config,
      chapters: [
        { page: 1, title: 'Start' },
        { page: 3, title: 'Finish' },
      ],
      pages: { 2: 'image' },
      coverPage: 1,
    },
    3,
  );
  for (const invalid of [
    null,
    {},
    { metadata: null },
    { ...config, metadata: { ...config.metadata, id: 'legacy' } },
    { ...config, metadata: { ...config.metadata, modified: 'legacy' } },
    { ...config, metadata: { ...config.metadata, author: '' } },
  ])
    assert.throws(() => validateConfig(invalid));
  assert.throws(
    () =>
      validateConfig(
        { ...config, chapters: [{ page: 3, title: 'Too late' }] },
        2,
      ),
    /Chapters/,
  );
  assert.throws(
    () =>
      validateConfig({
        ...config,
        chapters: [
          { page: 2, title: 'A' },
          { page: 1, title: 'B' },
        ],
      }),
    /Chapters/,
  );
  assert.throws(
    () => validateConfig({ ...config, pages: { 0: 'image' } }),
    /override/,
  );
  assert.throws(
    () => validateConfig({ ...config, pages: { 1: 'blank' } }),
    /override/,
  );
  assert.throws(
    () => validateConfig({ ...config, coverPage: 4 }, 3),
    /coverPage/,
  );
  assert.throws(
    () => validateConfig({ ...config, language: '../eng' }),
    /language/,
  );
});
