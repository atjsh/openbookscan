import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseModel,
  parseWorkers,
  readConfiguration,
  titleFromFilename,
} from '../src/config.js';
import { createDownload, epubFilename } from '../src/download.js';

test('basic form metadata is generic and whitespace is trimmed', async () => {
  assert.equal(titleFromFilename('A_generic-book.PDF'), 'A generic book');
  assert.equal(epubFilename('Any Book.PDF'), 'Any Book.epub');
  const config = await readConfiguration({
    title: ' A Book ',
    author: ' An Author ',
    language: ' en ',
  });
  assert.deepEqual(config.metadata, {
    title: 'A Book',
    author: 'An Author',
    language: 'en',
  });
});

test('JSON is authoritative and invalid JSON never falls back to basic details', async () => {
  const basic = { title: 'Ignored', author: 'Ignored', language: 'en' };
  const json = {
    metadata: { title: 'From JSON', author: 'Another Author', language: 'fr' },
    language: 'fra',
  };
  assert.deepEqual(
    await readConfiguration(basic, { text: async () => JSON.stringify(json) }),
    json,
  );
  await assert.rejects(
    readConfiguration(basic, { text: async () => '{invalid' }),
    SyntaxError,
  );
  await assert.rejects(readConfiguration({ ...basic, author: ' ' }));
  await assert.rejects(
    readConfiguration(basic, {
      text: async () => JSON.stringify({ metadata: {} }),
    }),
  );
});

test('worker selection is an execution option independent of book JSON', async () => {
  assert.deepEqual(
    ['auto', '1', '2', '3', '4', '8', ' 16 '].map(parseWorkers),
    ['auto', 1, 2, 3, 4, 8, 16],
  );
  for (const value of [
    '',
    ' ',
    '0',
    '-1',
    '1.5',
    '3workers',
    'NaN',
    'Infinity',
    '1e2',
    '0x10',
    '9007199254740992',
  ])
    assert.throws(() => parseWorkers(value));
  const config = await readConfiguration({
    title: 'Book',
    author: 'Author',
    language: 'en',
  });
  assert.equal('workers' in config, false);
});

test('model selection accepts only Fast or Best and is independent of book JSON', async () => {
  assert.equal(parseModel('fast'), 'fast');
  assert.equal(parseModel('best'), 'best');
  for (const value of [
    '',
    'Fast',
    'tessdata_best',
    '__proto__',
    null,
    undefined,
    1,
  ])
    assert.throws(() => parseModel(value), /Choose Fast or Best/);
  const config = await readConfiguration({
    title: 'Book',
    author: 'Author',
    language: 'en',
  });
  assert.equal('model' in config, false);
});

test('download URLs preserve bytes and are revoked on replacement and cleanup', async () => {
  const link = {
    hidden: true,
    href: '',
    download: '',
    removeAttribute() {
      this.href = '';
    },
  };
  const download = createDownload(link as unknown as HTMLAnchorElement);
  assert.equal(download.show(new Uint8Array([1, 2, 3]), 'Book.pdf'), 3);
  assert.equal(link.download, 'Book.epub');
  assert.equal(link.hidden, false);
  const previous = link.href;
  const response = await fetch(previous);
  assert.equal(response.headers.get('content-type'), 'application/epub+zip');
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    new Uint8Array([1, 2, 3]),
  );
  download.show(new Uint8Array([4]), 'Next.pdf');
  await assert.rejects(fetch(previous));
  const current = link.href;
  download.clear();
  assert.equal(link.hidden, true);
  assert.equal(link.href, '');
  await assert.rejects(fetch(current));
});
