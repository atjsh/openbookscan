import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseModel,
  parseOcrLanguage,
  parseWorkers,
  readConfiguration,
  titleFromFilename,
} from '../src/config.js';
import { createDownload, epubFilename } from '../src/download.js';
import { languageOptions, languages } from '../src/languages.js';

test('basic form metadata is generic and whitespace is trimmed', async () => {
  assert.equal(titleFromFilename('A_generic-book.PDF'), 'A generic book');
  assert.equal(epubFilename('Any Book.PDF'), 'Any Book.epub');
  const config = await readConfiguration({
    title: ' A Book ',
    author: ' An Author ',
    language: ' en ',
    ocrLanguage: ' ENG ',
  });
  assert.deepEqual(config.metadata, {
    title: 'A Book',
    author: 'An Author',
    language: 'en',
  });
  assert.equal(config.language, 'eng');
});

test('JSON is authoritative and invalid JSON never falls back to basic details', async () => {
  const basic = {
    title: 'Ignored',
    author: 'Ignored',
    language: 'en',
    ocrLanguage: 'eng',
  };
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

test('book tags and OCR codes are independent, including languages outside the suggestions', async () => {
  for (const [language, ocrLanguage] of [
    ['ko', 'eng'],
    ['en', 'kor'],
    ['en-GB', 'jpn_vert'],
    ['zh-Hant', 'chi_sim'],
    ['zh-Hans', 'chi_tra'],
    ['haw', 'eng'],
  ]) {
    const config = await readConfiguration({
      title: 'Book',
      author: 'Author',
      language: ` ${language} `,
      ocrLanguage: ` ${ocrLanguage.toUpperCase()} `,
    });
    assert.equal(config.metadata.language, language);
    assert.equal(config.language, ocrLanguage);
  }
});

test('only catalog OCR codes are accepted in the form; JSON can use combined or custom models', async () => {
  for (const [code] of languages) assert.equal(parseOcrLanguage(code), code);
  for (const code of [
    '',
    ' ',
    'en',
    'Korean',
    'unknown',
    'osd',
    'equ',
    'script/Latin',
    'eng+kor',
  ]) {
    await assert.rejects(
      readConfiguration({
        title: 'Book',
        author: 'Author',
        language: 'en',
        ocrLanguage: code,
      }),
      /Choose a supported OCR language code/,
    );
  }
  for (const language of ['eng+kor', 'custom']) {
    const json = {
      metadata: { title: 'Book', author: 'Author', language: 'ko-KR' },
      language,
      languagePath: 'models',
    };
    assert.deepEqual(
      await readConfiguration(
        { title: '', author: '', language: '', ocrLanguage: 'invalid' },
        { text: async () => JSON.stringify(json) },
      ),
      json,
    );
  }
});

test('language suggestions have complete names, valid tags, stable ordering and deduplicated book variants', () => {
  assert.equal(languages.length, 123);
  assert.equal(new Set(languages.map(([code]) => code)).size, 123);
  for (const [code, tag, englishName, nativeName] of languages) {
    assert.match(code, /^[a-z_]+$/);
    assert.doesNotThrow(() => new Intl.Locale(tag));
    assert.ok(englishName.trim());
    assert.ok(nativeName.trim());
  }
  const ocr = languageOptions('ocr');
  const book = languageOptions('book');
  for (const options of [ocr, book]) {
    assert.equal(
      new Set(options.map(({ value }) => value)).size,
      options.length,
    );
    assert.deepEqual(
      options,
      [...options].sort(
        (a, b) =>
          a.name.localeCompare(b.name, 'en') ||
          a.value.localeCompare(b.value, 'en'),
      ),
    );
  }
  const label = (options: typeof ocr, value: string) =>
    options.find((option) => option.value === value)?.label;
  assert.equal(label(ocr, 'kor'), 'kor — Korean — 한국어');
  assert.equal(label(ocr, 'kor_vert'), 'kor_vert — Korean (vertical) — 한국어');
  assert.equal(label(book, 'ko'), 'ko — Korean — 한국어');
  assert.equal(label(book, 'de'), 'de — German — Deutsch');
  assert.equal(label(book, 'it'), 'it — Italian — italiano');
  assert.equal(
    label(book, 'zh-Hans'),
    'zh-Hans — Chinese (Simplified) — 简体中文',
  );
  assert.equal(
    label(book, 'zh-Hant'),
    'zh-Hant — Chinese (Traditional) — 繁體中文',
  );
  assert.equal(label(ocr, 'frk'), 'frk — German (Fraktur) — Deutsch');
  for (const tag of [
    'az-Cyrl',
    'sr-Latn',
    'uz-Cyrl',
    'enm',
    'frm',
    'grc',
    'oge',
    'osp',
  ])
    assert.ok(label(book, tag));
  for (const code of ['osd', 'equ', 'script/Latin'])
    assert.equal(label(ocr, code), undefined);
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
    ocrLanguage: 'eng',
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
    ocrLanguage: 'eng',
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
