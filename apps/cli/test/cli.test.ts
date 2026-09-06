import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArguments } from '../src/arguments.js';
import { loadConfig } from '../src/config.js';
import { writeConversion } from '../src/output.js';

test('arguments are explicit and OCR paths resolve relative to configuration', async () => {
  assert.throws(() => parseArguments(['input.pdf']), /Usage:/);
  assert.deepEqual(
    parseArguments(['a.pdf', 'b.epub', '--config', 'book.json']),
    { input: 'a.pdf', output: 'b.epub', configFile: 'book.json' },
  );
  const dir = await mkdtemp(join(tmpdir(), 'openbookscan-cli-'));
  try {
    const file = join(dir, 'book.json');
    await writeFile(
      file,
      JSON.stringify({
        metadata: { title: 'Example', author: 'Author', language: 'en' },
        languagePath: 'models',
      }),
    );
    assert.equal((await loadConfig(file)).languagePath, resolve(dir, 'models'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('output and report collisions are protected; errors clean only newly created files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openbookscan-output-'));
  const output = join(dir, 'book.epub');
  let started = false;
  const fail = async (): Promise<never> => {
    started = true;
    throw new Error('Conversion failed');
  };
  try {
    await writeFile(output, 'keep');
    await assert.rejects(writeConversion(output, fail), { code: 'EEXIST' });
    assert.equal(started, false);
    assert.equal(await readFile(output, 'utf8'), 'keep');
    await rm(output);
    await writeFile(output + '.report.json', 'keep report');
    await assert.rejects(writeConversion(output, fail), { code: 'EEXIST' });
    assert.deepEqual(await readdir(dir), ['book.epub.report.json']);
    assert.equal(
      await readFile(output + '.report.json', 'utf8'),
      'keep report',
    );
    await rm(output + '.report.json');
    await assert.rejects(writeConversion(output, fail), /Conversion failed/);
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
