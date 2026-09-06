import { renderContent } from '@openbookscan/epub/render';
import type { PreviewEvent, ProcessedPage } from '../types.js';
import { cleanParagraphs, collectEvidence } from './cleanup.js';
import { retainedImages } from './images.js';
import { Page } from './page.js';

export function previewPage(
  page: ProcessedPage,
): Extract<PreviewEvent, { type: 'page' }> {
  // Provisional cleanup must not write into the final conversion report.
  const provisional = { ...page, report: { ...page.report, cleanup: [] } };
  const paragraphs =
    page.report.mode === 'text'
      ? cleanParagraphs(provisional, collectEvidence([provisional]))
      : [];
  return {
    type: 'page',
    page: page.page,
    content: renderContent(<Page page={provisional} paragraphs={paragraphs} />),
    images: retainedImages([page]).images,
  };
}
