import type { Book, ImageResource, Metadata } from '@openbookscan/epub';

export type { Book, ImageResource, Metadata } from '@openbookscan/epub';
export type PageMode = 'auto' | 'text' | 'image';
export interface ConversionConfig {
  metadata: Metadata;
  language?: string;
  languagePath?: string;
  chapters?: { page: number; title: string }[];
  coverPage?: number;
  pages?: Record<number, PageMode>;
}
export interface PageReport {
  page: number;
  mode: 'text' | 'image' | 'blank';
  override: PageMode;
  reasons: string[];
  words: number;
  confidence: number | null;
  lowFraction: number;
  cleanup: { action: string; text?: string; from?: string; to?: string }[];
}
export interface Progress {
  stage:
    | 'render'
    | 'render-complete'
    | 'ocr'
    | 'post-process'
    | 'page-complete'
    | 'cleanup'
    | 'package'
    | 'page-error';
  page?: number;
  total: number;
  /** Number of source pages completed, independent of completion order. */
  completed: number;
  mode?: PageReport['mode'];
  /** Present on render-complete; uniformly white pages skip OCR. */
  blank?: boolean;
}
export interface ConversionOptions {
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
  /** Synchronous observer; image bytes are borrowed and must not be modified. */
  onPreview?: (preview: PreviewEvent) => void;
}
export type PreviewEvent =
  /** Provisional page content, emitted in completion order before book-wide cleanup. */
  | { type: 'page'; page: number; content: string; images: ImageResource[] }
  /** Final content, emitted once after successful EPUB assembly. */
  | { type: 'book'; book: Book };
export interface ConversionReport {
  pageCount: number;
  pages: PageReport[];
  images: number;
  fallbackCount: number;
  bytes: number;
  seconds: number;
  workers: number;
  timings: ConversionTimings;
}
/** Aggregate work durations in seconds. Concurrent stages overlap and need not sum to wall time. */
export interface ConversionTimings {
  initialize: number;
  render: number;
  ocr: number;
  /** Page normalization/classification, book reconstruction, and resource disposal. */
  cleanup: number;
  package: number;
}
export interface ConversionResult {
  epub: Uint8Array;
  report: ConversionReport;
}
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface OCRWord {
  text: string;
  confidence: number;
}
export interface OCRLine {
  bbox: Box;
  text: string;
  words: OCRWord[];
}
export interface OCRParagraph {
  bbox: Box;
  lines: OCRLine[];
}
export interface OCRPage {
  page: number;
  width: number;
  height: number;
  blank: boolean;
  illustrations: boolean;
  paragraphs: OCRParagraph[];
}
export interface ProcessedPage extends OCRPage {
  report: PageReport;
  png?: Uint8Array;
}
/** Engine-independent recognition output in source reading order and pixel coordinates. */
export interface OCRData {
  paragraphs: OCRParagraph[];
  illustrations: boolean;
}
export interface RenderedPage {
  width: number;
  height: number;
  blank: boolean;
  png: Uint8Array;
}
export interface ConversionSession {
  count: number;
  /** Opt into overlapping rendering/OCR, with this many simultaneous recognition jobs. */
  concurrency?: number;
  /** Render a one-based page to lossless PNG; release the canvas after encoding. */
  render(page: number): Promise<RenderedPage>;
  /** Recognize PNG bytes without changing them; honor the signal supplied to open. */
  recognize(png: Uint8Array): Promise<OCRData>;
  /** Idempotently stop work and await disposal, including resources still initializing. */
  close(): Promise<void>;
}
export interface ConversionAdapter {
  /** Preserve input bytes. On failure or cancellation, dispose resources before rejecting. */
  open(
    bytes: Uint8Array,
    language: string,
    signal?: AbortSignal,
  ): Promise<ConversionSession>;
}
