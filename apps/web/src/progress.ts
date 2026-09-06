import type { Progress } from '@openbookscan/pdf-to-epub';

type PageStage =
  'pending' | Exclude<Progress['stage'], 'cleanup' | 'package' | 'page-error'>;
interface PageProgress {
  stage: PageStage;
  blank?: boolean;
  mode?: Progress['mode'];
  outcome?: 'failed' | 'stopped';
}

export const states = {
  pending: { marker: '·', label: 'Not started' },
  render: { marker: 'R', label: 'Rendering' },
  'render-complete': { marker: 'W', label: 'Rendered / waiting for OCR' },
  ocr: { marker: 'O', label: 'OCR running' },
  'post-process': { marker: 'P', label: 'Post-processing' },
  'page-complete': { marker: '✓', label: 'Page processed' },
  failed: { marker: '!', label: 'Failed' },
  stopped: { marker: '—', label: 'Stopped' },
};
const pageStages: PageStage[] = [
  'pending',
  'render',
  'render-complete',
  'ocr',
  'post-process',
  'page-complete',
];

export class ConversionProgress {
  pages: PageProgress[] = [];
  completed = 0;
  phase:
    | 'preparing'
    | 'pages'
    | 'cleanup'
    | 'package'
    | 'ready'
    | 'failed'
    | 'cancelled' = 'preparing';

  reset(): void {
    this.pages = [];
    this.completed = 0;
    this.phase = 'preparing';
  }

  update(progress: Progress): boolean {
    if (['ready', 'failed', 'cancelled'].includes(this.phase)) return false;
    if (!this.pages.length)
      this.pages = Array.from({ length: progress.total }, () => ({
        stage: 'pending',
      }));
    this.completed = progress.completed;
    this.phase =
      progress.stage === 'cleanup' || progress.stage === 'package'
        ? progress.stage
        : 'pages';
    if (
      progress.stage !== 'cleanup' &&
      progress.stage !== 'package' &&
      progress.page !== undefined
    ) {
      const page = this.pages[progress.page - 1];
      if (progress.stage === 'page-error') page.outcome = 'failed';
      else page.stage = progress.stage;
      if (progress.blank !== undefined) page.blank = progress.blank;
      if (progress.mode !== undefined) page.mode = progress.mode;
    }
    return true;
  }

  stop(phase: 'failed' | 'cancelled'): void {
    this.phase = phase;
    for (const page of this.pages)
      if (
        page.stage !== 'pending' &&
        page.stage !== 'page-complete' &&
        !page.outcome
      )
        page.outcome = 'stopped';
  }

  finish(): void {
    this.phase = 'ready';
  }

  get summary(): string {
    return `${this.completed} / ${this.pages.length} pages processed · ${this.pages.length - this.completed} remaining`;
  }

  describe(index: number): string {
    const page = this.pages[index];
    const stage = pageStages.indexOf(page.stage);
    const label =
      page.blank && page.stage === 'render-complete'
        ? 'Rendered'
        : states[page.stage].label;
    const details = [
      `Page ${index + 1}: ${page.outcome ? `${states[page.outcome].label} (${label})` : label}`,
    ];
    if (stage >= 2) details.push('Render complete');
    if (page.blank) details.push('OCR skipped (blank page)');
    else if (stage >= 4) details.push('OCR complete');
    if (stage >= 5) details.push('Post-processing complete');
    if (page.mode) details.push(`Output: ${page.mode}`);
    return details.join(' · ');
  }
}
