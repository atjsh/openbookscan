import type { Progress } from '@openbookscan/pdf-to-epub';

type PageStage =
  'pending' | Exclude<Progress['stage'], 'cleanup' | 'package' | 'page-error'>;
interface PageProgress {
  stage: PageStage;
  blank?: boolean;
  mode?: Progress['mode'];
  outcome?: 'failed' | 'stopped';
}

const states = {
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

export function createPageProgress(document: Document) {
  const root = document.querySelector<HTMLElement>('#page-progress')!;
  const filename = document.querySelector<HTMLElement>('#page-filename')!;
  const summary = document.querySelector<HTMLElement>('#page-summary')!;
  const grid = document.querySelector<HTMLElement>('#page-grid')!;
  const legend = document.querySelector<HTMLElement>('#page-legend')!;
  const detail = document.querySelector<HTMLElement>('#page-detail')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  const state = new ConversionProgress();
  let buttons: HTMLButtonElement[] = [];
  let inspected = 0;
  let tabIndex = 0;

  for (const [stage, { marker, label }] of Object.entries(states)) {
    const item = document.createElement('span');
    const swatch = document.createElement('span');
    swatch.className = 'page-marker';
    swatch.dataset.state = stage;
    swatch.textContent = marker;
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, document.createTextNode(` ${label}`));
    legend.append(item);
  }

  const inspect = (index: number) => {
    inspected = index;
    detail.textContent = state.describe(index);
  };
  const select = (index: number) => {
    buttons[tabIndex].tabIndex = -1;
    tabIndex = index;
    buttons[index].tabIndex = 0;
    inspect(index);
  };
  const renderPage = (index: number) => {
    const page = state.pages[index];
    const button = buttons[index];
    const displayState = page.outcome ?? page.stage;
    button.dataset.state = displayState;
    button.textContent = states[displayState].marker;
    button.setAttribute('aria-label', state.describe(index));
    if (inspected === index) inspect(index);
  };
  for (const type of ['pointermove', 'focusin', 'click'])
    grid.addEventListener(type, (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        'button[data-page]',
      );
      if (!button) return;
      const index = Number(button.dataset.page) - 1;
      if (type === 'pointermove') {
        if (inspected !== index) inspect(index);
      } else select(index);
    });

  grid.addEventListener('keydown', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-page]',
    );
    if (!button) return;
    const index = Number(button.dataset.page) - 1;
    const nextRow = buttons.findIndex(
      (cell) => cell.offsetTop > buttons[0].offsetTop,
    );
    const columns = nextRow < 0 ? buttons.length : nextRow;
    let next: number;
    switch (event.key) {
      case 'ArrowLeft':
        next = index - 1;
        break;
      case 'ArrowRight':
        next = index + 1;
        break;
      case 'ArrowUp':
        next = index >= columns ? index - columns : index;
        break;
      case 'ArrowDown':
        next = index + columns;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = buttons.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    next = Math.max(0, Math.min(next, buttons.length - 1));
    select(next);
    buttons[next].focus();
  });

  return {
    reset(name: string) {
      state.reset();
      root.hidden = true;
      filename.textContent = name;
      summary.textContent = '';
      detail.textContent = '';
      grid.replaceChildren();
      grid.scrollTop = 0;
      buttons = [];
      inspected = tabIndex = 0;
    },
    update(progress: Progress) {
      if (!state.update(progress)) return;
      if (!buttons.length) {
        const fragment = document.createDocumentFragment();
        buttons = state.pages.map((_, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'page-marker';
          button.dataset.page = String(index + 1);
          button.tabIndex = index === 0 ? 0 : -1;
          fragment.append(button);
          return button;
        });
        buttons.forEach((_, index) => renderPage(index));
        grid.append(fragment);
        root.hidden = false;
      } else if (progress.page !== undefined) renderPage(progress.page - 1);
      summary.textContent = state.summary;
      const message =
        progress.stage === 'page-error'
          ? 'Stopping conversion…'
          : state.phase === 'cleanup'
            ? 'Cleaning up book…'
            : state.phase === 'package'
              ? 'Packaging EPUB…'
              : 'Converting pages…';
      if (status.textContent !== message) status.textContent = message;
    },
    stop(phase: 'failed' | 'cancelled') {
      state.stop(phase);
      buttons.forEach((_, index) => renderPage(index));
    },
    finish() {
      state.finish();
    },
  };
}
