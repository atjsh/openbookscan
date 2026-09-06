import {
  validateConfig,
  type ConversionConfig,
} from '@openbookscan/pdf-to-epub';
import type { OcrModel } from './conversion/types.js';
import type { WorkerSelection } from './conversion/workers.js';
import { languages } from './languages.js';

export interface BookDetails {
  title: string;
  author: string;
  language: string;
  ocrLanguage: string;
}

export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

export function parseWorkers(value: string): WorkerSelection {
  const input = value.trim();
  if (input === 'auto') return 'auto';
  const count = Number(input);
  if (!/^\d+$/.test(input) || !Number.isSafeInteger(count) || count < 1)
    throw new Error('Enter auto or a whole number of OCR workers, 1 or more.');
  return count;
}

export function parseModel(value: unknown): OcrModel {
  if (value !== 'fast' && value !== 'best')
    throw new Error('Choose Fast or Best for the OCR model.');
  return value;
}

export function parseOcrLanguage(value: string): string {
  const code = value.trim().toLowerCase();
  if (!languages.some(([ocrCode]) => ocrCode === code))
    throw new Error(
      'Choose a supported OCR language code, such as eng or kor.',
    );
  return code;
}

export async function readConfiguration(
  details: BookDetails,
  file?: Pick<File, 'text'>,
): Promise<ConversionConfig> {
  const value: unknown = file
    ? JSON.parse(await file.text())
    : {
        language: parseOcrLanguage(details.ocrLanguage),
        metadata: {
          title: details.title.trim(),
          author: details.author.trim(),
          language: details.language.trim(),
        },
      };
  validateConfig(value);
  return value;
}
