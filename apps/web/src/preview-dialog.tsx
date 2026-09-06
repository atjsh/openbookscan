import type { RefObject } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';
import {
  createPreviewDocument,
  type ConversionPreview,
  type PreviewEntry,
} from './preview.js';

function PreviewFrame({
  entry,
  language,
}: {
  entry: PreviewEntry;
  language: string;
}) {
  const [result, setResult] = useState<
    { srcdoc: string } | { error: string }
  >();
  useLayoutEffect(() => {
    try {
      const document = createPreviewDocument(window.document, entry, language);
      setResult(document);
      return document.dispose;
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [entry, language]);
  if (!result) return <p>Preparing preview…</p>;
  if ('error' in result)
    return <p role="alert">Preview unavailable: {result.error}</p>;
  return (
    <iframe
      title={`Preview: ${entry.title}`}
      sandbox="allow-same-origin"
      srcDoc={result.srcdoc}
      onLoad={(event) => {
        const frame = event.currentTarget;
        // Keyboard events in a browsing context do not bubble to the outer dialog.
        frame.contentDocument?.addEventListener('keydown', (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          const dialog = frame.closest('dialog');
          if (typeof dialog?.requestClose === 'function') dialog.requestClose();
          else dialog?.close();
        });
      }}
    />
  );
}

export function PreviewDialog({
  dialogRef,
  preview,
  open,
  onClose,
  onChange,
}: {
  dialogRef: RefObject<HTMLDialogElement>;
  preview?: ConversionPreview;
  open: boolean;
  onClose: () => void;
  onChange: () => void;
}) {
  const index =
    preview?.entries.findIndex((entry) => entry.id === preview.selected) ?? -1;
  const select = (index: number) => {
    const entry = preview?.entries[index];
    if (preview && entry) {
      preview.selected = entry.id;
      onChange();
    }
  };
  return (
    <dialog
      id="content-preview"
      ref={dialogRef}
      aria-labelledby="preview-title"
      closedby="any"
      onClose={onClose}
    >
      <header class="preview-header">
        <h2 id="preview-title">Content preview</h2>
        <form method="dialog">
          <button autoFocus>Close</button>
        </form>
      </header>
      <p id="preview-status" role="status">
        {preview?.stopped
          ? 'Incomplete — conversion stopped. These pages are provisional.'
          : preview?.final
            ? 'Final content'
            : 'Provisional — text may change after book cleanup.'}
      </p>
      <nav class="preview-navigation" aria-label="Preview navigation">
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => select(index - 1)}
        >
          Previous
        </button>
        <label>
          {preview?.final ? 'Chapter' : 'Page'}{' '}
          <select
            value={preview?.selected ?? ''}
            onChange={(event) => {
              if (preview) {
                preview.selected = event.currentTarget.value;
                onChange();
              }
            }}
          >
            {preview?.entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!preview || index >= preview.entries.length - 1}
          onClick={() => select(index + 1)}
        >
          Next
        </button>
      </nav>
      {open && preview?.current && (
        <PreviewFrame
          key={preview.selected}
          entry={preview.current}
          language={preview.language}
        />
      )}
    </dialog>
  );
}
