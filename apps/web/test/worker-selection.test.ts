import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectWorkers,
  type WorkerSelection,
} from '../src/conversion/workers.js';

test('automatic worker choice requires both sufficient CPU and memory hints', () => {
  assert.equal(
    selectWorkers('auto', { hardwareConcurrency: 4, deviceMemory: 4 }),
    2,
  );
  assert.equal(
    selectWorkers('auto', { hardwareConcurrency: 32, deviceMemory: 16 }),
    2,
  );
  for (const capabilities of [
    {},
    { hardwareConcurrency: 8 },
    { deviceMemory: 8 },
    { hardwareConcurrency: 2, deviceMemory: 8 },
    { hardwareConcurrency: 8, deviceMemory: 2 },
  ]) {
    assert.equal(selectWorkers('auto', capabilities), 1);
  }
});

test('manual worker selection accepts positive integers beyond the suggestions', () => {
  for (const count of [1, 2, 3, 4, 8, 16])
    assert.equal(selectWorkers(count, {}), count);
  for (const value of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '2',
    'fast',
    null,
  ])
    assert.throws(
      () => selectWorkers(value as WorkerSelection, {}),
      /workers must be/,
    );
});
