import type {
  ConversionReport,
  ConversionTimings,
  ProcessedPage,
} from './types.js';

export function conversionReport(
  pages: ProcessedPage[],
  imageCount: number,
  bytes: number,
  started: number,
  workers: number,
  timings: ConversionTimings,
): ConversionReport {
  return {
    pageCount: pages.length,
    pages: pages.map((page) => page.report),
    images: imageCount,
    fallbackCount: pages.filter((page) => page.report.mode === 'image').length,
    bytes,
    seconds: (performance.now() - started) / 1000,
    workers,
    timings,
  };
}
