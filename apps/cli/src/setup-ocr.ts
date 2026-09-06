#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Download language data for the CLI; Node conversion uses local model files.
const languages = process.argv.slice(2);
if (!languages.length) languages.push('eng');
await mkdir('assets/ocr', { recursive: true });
const source =
  'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0';
const license = await fetch(`${source}/LICENSE`);
if (!license.ok)
  throw new Error(`Language license download failed: ${license.status}`);
await writeFile('assets/ocr/LICENSE', await license.text());
for (const language of languages) {
  if (!/^[a-z_]+$/i.test(language))
    throw new Error('Language must be a tessdata filename such as eng');
  const response = await fetch(`${source}/${language}.traineddata`);
  if (!response.ok)
    throw new Error(`Language download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const file = resolve('assets/ocr', `${language}.traineddata`);
  await writeFile(file, bytes);
  console.log(
    `${file}: ${bytes.length} bytes; SHA256 ${createHash('sha256').update(bytes).digest('hex')}`,
  );
}
