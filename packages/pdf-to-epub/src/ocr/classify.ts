import type { OCRPage, PageMode, PageReport } from '../types.js';

export function classifyPage(
  page: OCRPage,
  override: PageMode = 'auto',
): PageReport {
  const lines = page.paragraphs.flatMap((paragraph) => paragraph.lines);
  const words = lines.flatMap((line) => line.words);
  const confidence = words.length
    ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length
    : null;
  const lowFraction = words.length
    ? words.filter((word) => word.confidence < 60).length / words.length
    : 0;
  const reasons: string[] = [];
  if (!page.blank) {
    if (words.length < 35) reasons.push('sparse-nonblank');
    if (confidence !== null && confidence < 83) reasons.push('mean-confidence');
    if (lowFraction > 0.16) reasons.push('low-confidence-fraction');
    if (page.illustrations) reasons.push('illustration');
    if (
      lines.some((line) =>
        /^(?:FIG(?:URE)?\.?|TABLE)\s+[IVXLC\d]+[.:\s-]/i.test(line.text),
      )
    )
      reasons.push('figure-or-table-caption');
    if (lines.some((line) => line.text.includes('=') && line.text.length < 85))
      reasons.push('equation');
    const boxes = page.paragraphs.map((paragraph) => paragraph.bbox);
    if (
      boxes.some((a, index) =>
        boxes
          .slice(index + 1)
          .some(
            (b) =>
              Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 20 &&
              (a.x1 < b.x0 || b.x1 < a.x0),
          ),
      )
    )
      reasons.push('column-order');
  }
  return {
    page: page.page,
    mode:
      override !== 'auto'
        ? override
        : page.blank
          ? 'blank'
          : reasons.length
            ? 'image'
            : 'text',
    override,
    reasons,
    words: words.length,
    confidence,
    lowFraction,
    cleanup: [],
  };
}
