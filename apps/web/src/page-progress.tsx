import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { ConversionProgress, states } from './progress.js';
import type { ConversionPreview } from './preview.js';

export function PageProgress({
  state,
  filename,
  preview,
  onPreview,
}: {
  state: ConversionProgress;
  filename: string;
  preview: ConversionPreview;
  onPreview: (
    event: JSX.TargetedMouseEvent<HTMLButtonElement>,
    page: number,
  ) => void;
}) {
  const [inspected, inspect] = useState(0);
  const [tabIndex, select] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const availablePages = new Set(
    preview.entries.flatMap((entry) => entry.pages),
  );
  return (
    <section
      id="page-progress"
      aria-label="Page conversion progress"
      hidden={!state.pages.length}
    >
      <p>
        <strong id="page-filename">{filename}</strong>
        <br />
        <span id="page-summary">{state.summary}</span>
      </p>
      <div
        id="page-grid"
        role="group"
        aria-label="PDF pages"
        onKeyDown={(event) => {
          const index = buttons.current.indexOf(
            event.target as HTMLButtonElement,
          );
          if (index < 0) return;
          const nextRow = buttons.current.findIndex(
            (cell) => cell && cell.offsetTop > buttons.current[0]!.offsetTop,
          );
          const columns = nextRow < 0 ? state.pages.length : nextRow;
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
              next = state.pages.length - 1;
              break;
            default:
              return;
          }
          event.preventDefault();
          next = Math.max(0, Math.min(next, state.pages.length - 1));
          select(next);
          inspect(next);
          buttons.current[next]?.focus();
        }}
      >
        {state.pages.map((page, index) => {
          const display = page.outcome ?? page.stage;
          const available = availablePages.has(index + 1);
          return (
            <button
              key={index}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              class="page-marker"
              data-state={display}
              data-page={index + 1}
              tabIndex={tabIndex === index ? 0 : -1}
              aria-label={
                state.describe(index) +
                (available ? ' · Preview available' : '')
              }
              commandfor={available ? 'content-preview' : undefined}
              command={available ? 'show-modal' : undefined}
              onPointerMove={() => inspect(index)}
              onFocus={() => {
                inspect(index);
                select(index);
              }}
              onClick={(event) => {
                inspect(index);
                select(index);
                if (available) onPreview(event, index + 1);
              }}
            >
              {states[display].marker}
            </button>
          );
        })}
      </div>
      <p id="page-legend" aria-label="Page status legend">
        {Object.entries(states).map(([stage, { marker, label }]) => (
          <span key={stage}>
            <span class="page-marker" data-state={stage} aria-hidden="true">
              {marker}
            </span>{' '}
            {label}
          </span>
        ))}
      </p>
      <p id="page-detail">
        {state.pages[inspected] ? state.describe(inspected) : ''}
      </p>
    </section>
  );
}
