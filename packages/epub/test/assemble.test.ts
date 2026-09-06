import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { assembleEpub, type Book } from '@openbookscan/epub';
import { assembleEpub as nodeAssemble } from '@openbookscan/epub/node';
import { assembleEpub as browserAssemble } from '@openbookscan/epub/browser';

const png = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9X8AAAAASUVORK5CYII=',
    'base64',
  ),
);
const url = 'https://openbookscan.invalid/images/page-1.png';
function book(): Book {
  return {
    metadata: { title: 'A & B <Book>', author: 'An "Author"', language: 'en' },
    chapters: [
      {
        title: 'First & foremost',
        filename: 'first.xhtml',
        content: `<span id="p1" epub:type="pagebreak" aria-label="1"></span><p>One <em>two</em> three.</p><p class="footnote" epub:type="footnote">1. A note.</p><pre>a  b\n c</pre><img src="${url}" alt="Page" />`,
      },
      {
        title: 'Second',
        filename: 'second.xhtml',
        content:
          '<span id="p2" epub:type="pagebreak" aria-label="2"></span><p>Second page.</p>',
      },
    ],
    images: [{ url, bytes: png, mediaType: 'image/png' }],
    cover: { bytes: png, mediaType: 'image/png', name: 'cover.png' },
  };
}

test('library assembly preserves text, source anchors, image bytes and ordered chapters', async () => {
  assert.equal(nodeAssemble, assembleEpub);
  assert.equal(browserAssemble, assembleEpub);
  const input = book();
  input.images.push({
    url: 'https://openbookscan.invalid/unused.png',
    bytes: png,
    mediaType: 'image/png',
  });
  const bytes = await assembleEpub(input);
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(header.getUint16(8, true), 0, 'mimetype is stored');
  assert.equal(
    new TextDecoder().decode(bytes.slice(30, 38)),
    'mimetype',
    'mimetype is first',
  );
  const zip = await JSZip.loadAsync(bytes);
  assert.equal(
    await zip.file('mimetype')!.async('string'),
    'application/epub+zip',
  );
  const opf = await zip.file('OEBPS/content.opf')!.async('string');
  assert.match(opf, /<dc:title>A &amp; B &lt;Book&gt;<\/dc:title>/);
  assert.match(opf, /Converted from PDF using automated OCR\./);
  assert.ok(opf.indexOf('content_0_item_0') < opf.indexOf('content_1_item_1'));
  const chapter = await zip.file('OEBPS/first.xhtml')!.async('string');
  assert.match(chapter, /id="p1"/);
  assert.match(chapter, /One <em>two<\/em> three\./);
  assert.match(chapter, /epub:type="footnote"/);
  assert.ok(chapter.includes('<pre>a  b\n c</pre>'));
  const imageFiles = Object.values(zip.files).filter(
    (file) => !file.dir && file.name.startsWith('OEBPS/images/'),
  );
  assert.equal(
    imageFiles.length,
    1,
    'unreferenced supplied images are omitted',
  );
  assert.deepEqual(await imageFiles[0]!.async('uint8array'), png);
  assert.deepEqual(await zip.file('OEBPS/cover.png')!.async('uint8array'), png);
  const toc = await zip.file('OEBPS/toc.xhtml')!.async('string');
  assert.ok(toc.indexOf('first.xhtml') < toc.indexOf('second.xhtml'));
});

test('missing memory images fail before any network fallback', async () => {
  const input = book();
  input.images = [];
  await assert.rejects(assembleEpub(input), /Missing in-memory image/);
});

test('rejects legacy metadata, invalid XML, unsafe names and mismatched images', async () => {
  const legacy = book();
  Object.assign(legacy.metadata, { id: 'old-id' });
  await assert.rejects(assembleEpub(legacy), /Unsupported metadata field: id/);
  const invalidText = book();
  invalidText.metadata.title = 'bad\u0000title';
  await assert.rejects(assembleEpub(invalidText), /invalid XML character/);
  const unsafe = book();
  unsafe.chapters[0]!.filename = '../outside.xhtml';
  await assert.rejects(
    assembleEpub(unsafe),
    /Unsafe or reserved chapter filename/,
  );
  const duplicate = book();
  duplicate.chapters[1]!.filename = 'first.xhtml';
  await assert.rejects(assembleEpub(duplicate), /Duplicate or reserved/);
  const mismatch = book();
  mismatch.images[0]!.mediaType = 'image/jpeg';
  await assert.rejects(
    assembleEpub(mismatch),
    /filename and media type must match/,
  );
});

test('rejects cancellation before assembly and discards an in-progress result', async () => {
  await assert.rejects(assembleEpub(book(), { signal: AbortSignal.abort() }), {
    name: 'AbortError',
  });
  const controller = new AbortController();
  const pending = assembleEpub(book(), { signal: controller.signal });
  setTimeout(() => controller.abort(), 0);
  await assert.rejects(pending, { name: 'AbortError' });
});
