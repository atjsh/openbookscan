import { convertPdf } from '@openbookscan/pdf-to-epub';
import type {
  ConversionConfig,
  ConversionOptions,
  ConversionResult,
} from '@openbookscan/pdf-to-epub';
import { openPdf } from './pdf.js';
import { openRecognizer } from './ocr.js';
import { createSession } from './session.js';
import { parseModel } from '../config.js';
import type { OcrModel } from './types.js';
import {
  selectWorkers,
  type DeviceCapabilities,
  type WorkerSelection,
} from './workers.js';

export type { WorkerSelection } from './workers.js';
export type { OcrModel } from './types.js';
export interface BrowserConversionOptions extends ConversionOptions {
  languagePath?: string;
  workers?: WorkerSelection;
  model?: OcrModel;
}

export async function convertPdfBrowser(
  input: Blob | Uint8Array,
  config: ConversionConfig,
  {
    languagePath,
    workers = 'auto',
    model = 'fast',
    ...options
  }: BrowserConversionOptions = {},
): Promise<ConversionResult> {
  parseModel(model);
  const workerCount = selectWorkers(
    workers,
    globalThis.navigator as Navigator & DeviceCapabilities,
  );
  const bytes =
    input instanceof Uint8Array
      ? input
      : new Uint8Array(await input.arrayBuffer());
  return convertPdf(
    bytes,
    config,
    {
      async open(input, language, signal) {
        const pdf = await openPdf(input, signal);
        const count = Math.min(workerCount, pdf.count);
        return createSession(
          pdf,
          openRecognizer(language, count, model, languagePath, signal),
          count,
          signal,
        );
      },
    },
    options,
  );
}
