import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PreviewEvent } from '@openbookscan/pdf-to-epub';
import { ConversionPreview } from '../src/preview.js';

const page = (page: number): PreviewEvent => ({
  type: 'page',
  page,
  content: `<span id="p${page}"></span><p>Text</p>`,
  images: [],
});

test('preview arrivals remain ordered without changing selection, and duplicates are ignored', () => {
  const state = new ConversionPreview();
  state.update(page(3));
  state.update(page(1));
  state.update(page(2));
  assert.deepEqual(
    state.entries.map((entry) => entry.pages[0]),
    [1, 2, 3],
  );
  assert.equal(state.current?.pages[0], 3);
  assert.equal(state.update(page(3)), false);
  assert.equal(state.selectPage(4), false);
  assert.equal(state.selectPage(2), true);
  assert.equal(state.current?.pages[0], 2);
});

test('final chapters replace provisional pages while preserving the selected source page and cover', () => {
  const state = new ConversionPreview();
  state.update(page(3));
  state.update({
    type: 'book',
    book: {
      metadata: { title: 'Book', author: 'Author', language: 'ko' },
      chapters: [
        { title: 'First', content: '<span id="p1"></span>' },
        {
          title: 'Second',
          content: '<span id="p2"></span><span id="p3"></span>',
        },
      ],
      images: [],
      cover: {
        bytes: new Uint8Array([1]),
        mediaType: 'image/png',
        name: 'cover.png',
      },
    },
  });
  assert.equal(state.final, true);
  assert.equal(state.language, 'ko');
  assert.equal(state.current?.title, 'Second');
  assert.deepEqual(
    state.entries.map((entry) => entry.title),
    ['Cover', 'First', 'Second'],
  );
  assert.equal(state.selectPage(2), true);
  assert.equal(state.current?.title, 'Second');
  assert.equal(state.update(page(4)), false);
});

test('stopping retains available content and rejects late callbacks; a new run starts empty', () => {
  const state = new ConversionPreview();
  state.update(page(1));
  state.stop();
  assert.equal(state.update(page(2)), false);
  assert.equal(state.current?.pages[0], 1);
  assert.equal(state.stopped, true);
  const fresh = new ConversionPreview();
  assert.equal(fresh.entries.length, 0);
  assert.equal(fresh.current, undefined);
  assert.equal(fresh.stopped, false);
});
