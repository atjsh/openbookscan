import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Progress } from '@openbookscan/pdf-to-epub';
import { ConversionProgress } from '../src/progress.js';

function update(
  state: ConversionProgress,
  stage: Progress['stage'],
  page: number,
  completed = 0,
  extra: Partial<Progress> = {},
) {
  state.update({ stage, page, completed, total: 4, ...extra });
}

test('page identity and step history survive out-of-order completion and failure', () => {
  const state = new ConversionProgress();
  assert.equal(state.phase, 'preparing');
  assert.equal(state.pages.length, 0);
  for (const page of [1, 2]) {
    update(state, 'render', page);
    update(state, 'render-complete', page, 0, { blank: false });
    update(state, 'ocr', page);
  }
  update(state, 'render', 3);
  update(state, 'render-complete', 3, 0, { blank: false });
  assert.equal(state.describe(3), 'Page 4: Not started');
  assert.match(state.describe(2), /waiting for OCR · Render complete/);
  assert.doesNotMatch(state.describe(2), /OCR complete/);
  update(state, 'post-process', 2);
  assert.match(
    state.describe(1),
    /Post-processing · Render complete · OCR complete/,
  );
  update(state, 'page-complete', 2, 1, { mode: 'text' });
  update(state, 'page-complete', 2, 1, { mode: 'text' });
  assert.equal(state.summary, '1 / 4 pages processed · 3 remaining');
  assert.equal(state.pages[0].stage, 'ocr');
  assert.equal(state.pages[1].stage, 'page-complete');
  assert.match(state.describe(1), /Post-processing complete · Output: text/);
  update(state, 'page-error', 1, 1);
  state.stop('failed');
  assert.match(state.describe(0), /Failed \(OCR running\) · Render complete/);
  assert.equal(state.pages[1].outcome, undefined);
  assert.match(state.describe(2), /Stopped .*waiting for OCR.*Render complete/);
  assert.equal(state.describe(3), 'Page 4: Not started');
  assert.equal(state.summary, '1 / 4 pages processed · 3 remaining');
});

test('blank pages show skipped OCR, and output modes do not imply errors', () => {
  const state = new ConversionProgress();
  update(state, 'render-complete', 1, 0, { blank: true });
  assert.match(
    state.describe(0),
    /Rendered · Render complete · OCR skipped \(blank page\)/,
  );
  assert.doesNotMatch(state.describe(0), /waiting for OCR/);
  update(state, 'post-process', 1);
  update(state, 'page-complete', 1, 1, { mode: 'blank' });
  assert.match(
    state.describe(0),
    /OCR skipped .*Post-processing complete · Output: blank/,
  );
  assert.doesNotMatch(state.describe(0), /OCR complete/);
  update(state, 'page-complete', 2, 2, { mode: 'image', blank: false });
  assert.match(state.describe(1), /Page processed.*Output: image/);
  assert.equal(state.pages[1].outcome, undefined);
});

test('cleanup and packaging are separate from completed pages, including terminal failures', () => {
  for (const terminal of ['ready', 'failed', 'cancelled'] as const) {
    const state = new ConversionProgress();
    for (let page = 1; page <= 4; page++)
      update(state, 'page-complete', page, page, { mode: 'text' });
    assert.equal(state.phase, 'pages');
    for (const stage of ['cleanup', 'package'] as const) {
      state.update({ stage, total: 4, completed: 4 });
      assert.equal(state.phase, stage);
      assert.equal(state.summary, '4 / 4 pages processed · 0 remaining');
    }
    if (terminal === 'ready') state.finish();
    else state.stop(terminal);
    assert.equal(state.phase, terminal);
    assert.ok(
      state.pages.every(
        (page) => page.stage === 'page-complete' && !page.outcome,
      ),
    );
    assert.equal(
      state.update({ stage: 'render', page: 1, total: 4, completed: 0 }),
      false,
    );
    assert.equal(state.completed, 4);
  }
});

test('cancellation stops active stages, preserves completed steps, and reset starts a fresh run', () => {
  const state = new ConversionProgress();
  update(state, 'post-process', 1);
  update(state, 'render', 2);
  state.stop('cancelled');
  assert.match(state.describe(0), /Stopped \(Post-processing\).*OCR complete/);
  assert.equal(state.describe(1), 'Page 2: Stopped (Rendering)');
  assert.equal(state.describe(2), 'Page 3: Not started');
  assert.equal(
    state.update({ stage: 'page-complete', page: 1, total: 4, completed: 1 }),
    false,
  );
  assert.equal(state.completed, 0);
  state.reset();
  assert.equal(state.phase, 'preparing');
  assert.equal(state.pages.length, 0);
  assert.equal(state.completed, 0);
  state.update({ stage: 'render', page: 1, total: 1, completed: 0 });
  assert.equal(state.summary, '0 / 1 pages processed · 1 remaining');
  assert.equal(state.describe(0), 'Page 1: Rendering');
});
