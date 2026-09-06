import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  validateConfig,
  type ConversionConfig,
} from '@openbookscan/pdf-to-epub';

export async function loadConfig(file: string) {
  const config: ConversionConfig = JSON.parse(await readFile(file, 'utf8'));
  validateConfig(config);
  return {
    config,
    languagePath: resolve(dirname(file), config.languagePath ?? 'assets/ocr'),
  };
}
