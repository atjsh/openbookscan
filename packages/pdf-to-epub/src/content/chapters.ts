import { h } from 'preact';
import type { Book } from '@openbookscan/epub';
import { renderContent } from '@openbookscan/epub/render';
import type { ConversionConfig, ProcessedPage } from '../types.js';
import { cleanParagraphs, collectEvidence } from './cleanup.js';
import { Chapter } from './chapter.js';
import { retainedImages } from './images.js';

export function reconstruct(
  pages: ProcessedPage[],
  config: ConversionConfig,
): Book {
  if (!pages.length) throw Error('PDF contains no pages');
  const evidence = collectEvidence(pages);
  const starts = config.chapters?.length
    ? [...config.chapters]
    : pages.map((page) => ({ page: page.page, title: `Page ${page.page}` }));
  if (starts[0].page !== 1) starts.unshift({ page: 1, title: 'Front matter' });
  const chapters = starts.map((chapter, index) => ({
    title: chapter.title,
    content: renderContent(
      h(Chapter, {
        pages: pages
          .slice(
            chapter.page - 1,
            (starts[index + 1]?.page ?? pages.length + 1) - 1,
          )
          .map((page) => ({
            page,
            paragraphs:
              page.report.mode === 'text'
                ? cleanParagraphs(page, evidence)
                : [],
          })),
      }),
    ),
  }));
  return {
    metadata: config.metadata,
    chapters,
    ...retainedImages(pages, config.coverPage),
  };
}
