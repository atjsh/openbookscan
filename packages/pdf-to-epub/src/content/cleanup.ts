import type { OCRPage, ProcessedPage } from '../types.js';

const key = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const median = (values: number[]) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    : 0;
export interface CleanParagraph {
  text: string;
  footnote: boolean;
}
export interface CleanupEvidence {
  headers: Map<string, number>;
  vocabulary: Set<string>;
}

export function collectEvidence(pages: OCRPage[]): CleanupEvidence {
  const headers = new Map<string, number>();
  const vocabulary = new Set<string>();
  for (const page of pages) {
    const seen = new Set<string>();
    for (const paragraph of page.paragraphs)
      for (const line of paragraph.lines) {
        for (const word of line.text.toLowerCase().match(/\p{L}+/gu) ?? [])
          vocabulary.add(word);
        if (
          line.bbox.y1 < page.height * 0.1 &&
          line.text.length < 90 &&
          key(line.text).length > 4
        )
          seen.add(key(line.text));
      }
    for (const header of seen)
      headers.set(header, (headers.get(header) ?? 0) + 1);
  }
  return { headers, vocabulary };
}

export function cleanParagraphs(
  page: ProcessedPage,
  evidence: CleanupEvidence,
): CleanParagraph[] {
  const paragraphs: CleanParagraph[] = [];
  const normal = median(
    page.paragraphs.flatMap((paragraph) =>
      paragraph.lines
        .filter((line) => line.text.length > 45)
        .map((line) => line.bbox.y1 - line.bbox.y0),
    ),
  );
  for (const paragraph of page.paragraphs) {
    const kept = paragraph.lines.filter((line) => {
      const remove =
        line.bbox.y1 < page.height * 0.1 &&
        (evidence.headers.get(key(line.text)) ?? 0) >= 3;
      if (remove)
        page.report.cleanup.push({ action: 'remove-header', text: line.text });
      return !remove;
    });
    let text = '';
    for (const line of kept) {
      const last = text.match(/(\p{L}+)-$/u);
      const first = line.text.match(/^(\p{Ll}+)/u);
      if (
        last &&
        first &&
        evidence.vocabulary.has((last[1] + first[1]).toLowerCase())
      ) {
        page.report.cleanup.push({
          action: 'join-hyphen',
          from: `${last[1]}- ${first[1]}`,
          to: last[1] + first[1],
        });
        text = text.slice(0, -1) + line.text;
      } else text += (text ? ' ' : '') + line.text;
    }
    if (text) {
      const footnote =
        normal > 0 &&
        paragraph.bbox.y0 > page.height * 0.7 &&
        median(kept.map((line) => line.bbox.y1 - line.bbox.y0)) < normal * 0.85;
      paragraphs.push({ text, footnote });
    }
  }
  return paragraphs;
}
