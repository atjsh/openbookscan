import { convertPdf } from '@openbookscan/pdf-to-epub';
import type {
  ConversionConfig,
  ConversionOptions,
  ConversionResult,
} from '@openbookscan/pdf-to-epub';
import { openPdf } from './pdf.js';
import { openRecognizer } from './ocr.js';
import { createSession } from './session.js';

export interface NodeConversionOptions extends ConversionOptions {
  languagePath?: string;
}

export function convertPdfNode(
  bytes: Uint8Array,
  config: ConversionConfig,
  options: NodeConversionOptions = {},
): Promise<ConversionResult> {
  const languagePath = options.languagePath ?? config.languagePath;
  return convertPdf(
    bytes,
    config,
    {
      async open(input, language, signal) {
        const pdf = await openPdf(input, signal);
        return createSession(
          pdf,
          openRecognizer(language, languagePath, signal),
          signal,
        );
      },
    },
    options,
  );
}
