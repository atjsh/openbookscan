import type { CleanParagraph } from './cleanup.js';

export function Paragraph({ text, footnote }: CleanParagraph) {
  return <p class={footnote ? 'footnote' : undefined}>{text}</p>;
}
