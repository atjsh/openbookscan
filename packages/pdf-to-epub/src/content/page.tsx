import type { ProcessedPage } from '../types.js';
import type { CleanParagraph } from './cleanup.js';
import { Paragraph } from './paragraph.js';
import { Fallback } from './fallback.js';

export interface PageContent {
  page: ProcessedPage;
  paragraphs: CleanParagraph[];
}

export function Page({ page, paragraphs }: PageContent) {
  const pagebreak = { 'epub:type': 'pagebreak' };
  return (
    <>
      <span
        id={`p${page.page}`}
        {...pagebreak}
        role="doc-pagebreak"
        aria-label={`Source page ${page.page}`}
      />
      {page.report.mode === 'text' ? (
        paragraphs.map((paragraph) => <Paragraph {...paragraph} />)
      ) : (
        <Fallback page={page.page} blank={page.report.mode === 'blank'} />
      )}
    </>
  );
}
