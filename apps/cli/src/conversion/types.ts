import type { ConversionSession } from '@openbookscan/pdf-to-epub';

export type PdfSource = Pick<ConversionSession, 'count' | 'render' | 'close'>;
export type PngRecognizer = Pick<ConversionSession, 'recognize' | 'close'>;
