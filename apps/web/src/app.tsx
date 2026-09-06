import type { JSX } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { convertPdfBrowser } from './conversion/convert.js';
import { parseModel, parseWorkers, readConfiguration } from './config.js';
import { createDownload } from './download.js';
import { ConversionForm } from './form.js';
import { ConversionProgress } from './progress.js';
import { PageProgress } from './page-progress.js';
import { ConversionPreview } from './preview.js';
import { PreviewDialog } from './preview-dialog.js';

interface Run {
  id: number;
  filename: string;
  controller: AbortController;
  running: boolean;
  status: string;
  progress: ConversionProgress;
  preview: ConversionPreview;
  download?: ReturnType<typeof createDownload>;
}

export function App() {
  const [run, setRun] = useState<Run>();
  const current = useRef<Run>();
  const runId = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const publish = (value: Run) => {
    if (current.current === value) setRun({ ...value });
  };

  useLayoutEffect(() => {
    const dispose = () => {
      const value = current.current;
      current.current = undefined;
      value?.controller.abort();
      value?.preview.stop();
      value?.download?.dispose();
      dialog.current?.close();
    };
    const hide = () => {
      dispose();
      setRun(undefined);
      setPreviewOpen(false);
    };
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      dispose();
    };
  }, []);

  const submit: JSX.SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (current.current?.running) return;
    const field = (name: string) =>
      event.currentTarget.elements.namedItem(name) as HTMLInputElement;
    const file = field('pdf').files?.[0];
    if (!file) return;
    const configFile = field('config').files?.[0];
    const details = {
      title: field('title').value,
      author: field('author').value,
      language: field('language').value,
      ocrLanguage: field('ocr-language').value,
    };
    const workers = field('workers').value;
    const model = field('model').value;
    current.current?.download?.dispose();
    current.current?.preview.stop();
    dialog.current?.close();
    setPreviewOpen(false);
    const value: Run = {
      id: ++runId.current,
      filename: file.name,
      controller: new AbortController(),
      running: true,
      status: 'Preparing OCR…',
      progress: new ConversionProgress(),
      preview: new ConversionPreview(),
    };
    current.current = value;
    publish(value);
    const { signal } = value.controller;
    const active = () =>
      current.current === value && value.running && !signal.aborted;
    try {
      const config = await readConfiguration(details, configFile);
      signal.throwIfAborted();
      value.preview.language = config.metadata.language;
      const { epub, report } = await convertPdfBrowser(file, config, {
        signal,
        workers: parseWorkers(workers),
        model: parseModel(model),
        onProgress(event) {
          if (!active() || !value.progress.update(event)) return;
          value.status =
            event.stage === 'page-error'
              ? 'Stopping conversion…'
              : event.stage === 'cleanup'
                ? 'Cleaning up book…'
                : event.stage === 'package'
                  ? 'Packaging EPUB…'
                  : 'Converting pages…';
          publish(value);
        },
        onPreview(event) {
          if (active() && value.preview.update(event)) publish(value);
        },
      });
      signal.throwIfAborted();
      if (!active()) return;
      value.download = createDownload(epub, file.name);
      value.progress.finish();
      value.status = `Ready — ${(value.download.size / 1048576).toFixed(2)} MiB; ${report.workers} OCR worker${report.workers === 1 ? '' : 's'}.`;
    } catch (error) {
      value.progress.stop(signal.aborted ? 'cancelled' : 'failed');
      value.preview.stop();
      value.status = signal.aborted
        ? 'Cancelled.'
        : `Conversion failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      value.running = false;
      publish(value);
    }
  };

  const openPreview = (
    event: JSX.TargetedMouseEvent<HTMLButtonElement>,
    page?: number,
  ) => {
    const value = current.current;
    if (!value?.preview.entries.length) return;
    if (page !== undefined && !value.preview.selectPage(page)) return;
    setPreviewOpen(true);
    publish(value);
    if (!('commandForElement' in event.currentTarget)) {
      event.preventDefault();
      dialog.current?.showModal();
    }
  };

  return (
    <main>
      <h1>
        <a
          href="https://github.com/atjsh/openbookscan"
          target="_blank"
          rel="noopener noreferrer"
        >
          openbookscan
        </a>
      </h1>
      <p>
        openbookscan uses in-browser OCR(Optical Character Recognition)
        technology to convert your book scans PDF into eBook (ePUB) format.
      </p>
      <p>Secure, private, and most importantly, no cost.</p>
      <ConversionForm running={run?.running ?? false} onSubmit={submit} />
      <p>
        <button
          id="cancel"
          type="button"
          disabled={!run?.running || run.controller.signal.aborted}
          onClick={() => {
            const value = current.current;
            if (!value?.running) return;
            value.controller.abort();
            value.progress.stop('cancelled');
            value.preview.stop();
            value.status = 'Cancelling…';
            publish(value);
          }}
        >
          Cancel
        </button>
      </p>
      <p id="status" role="status" aria-live="polite">
        {run?.status}
      </p>
      {run && (
        <PageProgress
          key={run.id}
          state={run.progress}
          filename={run.filename}
          preview={run.preview}
          onPreview={openPreview}
        />
      )}
      <div class="result-actions">
        <button
          id="preview"
          type="button"
          disabled={!run?.preview.entries.length}
          commandfor="content-preview"
          command="show-modal"
          onClick={openPreview}
        >
          Preview
        </button>
        {run?.download && (
          <a
            id="download"
            href={run.download.url}
            download={run.download.filename}
          >
            Download EPUB
          </a>
        )}
      </div>
      <PreviewDialog
        dialogRef={dialog}
        preview={run?.preview}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onChange={() => {
          if (current.current) publish(current.current);
        }}
      />
    </main>
  );
}
