import { convertPdfBrowser } from './conversion/convert.js';
import {
  parseModel,
  parseWorkers,
  readConfiguration,
  titleFromFilename,
} from './config.js';
import { createDownload } from './download.js';
import { createPageProgress } from './progress.js';

export function initializeForm(document: Document): void {
  const form = document.querySelector<HTMLFormElement>('#convert-form')!;
  const inputs = document.querySelector<HTMLFieldSetElement>('#inputs')!;
  const metadata = document.querySelector<HTMLFieldSetElement>('#metadata')!;
  const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  const progress = createPageProgress(document);
  const field = (name: string) =>
    form.elements.namedItem(name) as HTMLInputElement;
  const workerInput = field('workers');
  const modelInput = form.elements.namedItem('model') as HTMLSelectElement;
  const download = createDownload(
    document.querySelector<HTMLAnchorElement>('#download')!,
  );
  let controller: AbortController | undefined;
  let suggestedTitle = '';

  field('pdf').addEventListener('change', () => {
    const filename = field('pdf').files?.[0]?.name;
    if (!filename) return;
    const next = titleFromFilename(filename);
    if (!field('title').value || field('title').value === suggestedTitle)
      field('title').value = next;
    suggestedTitle = next;
  });
  field('config').addEventListener('change', () => {
    metadata.disabled = Boolean(field('config').files?.length);
  });
  cancel.addEventListener('click', () => {
    if (!controller) return;
    controller.abort();
    progress.stop('cancelled');
    cancel.disabled = true;
    status.textContent = 'Cancelling…';
  });
  document.defaultView?.addEventListener('pagehide', () => {
    controller?.abort();
    download.clear();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = field('pdf').files?.[0];
    if (controller || !file) return;
    const configFile = field('config').files?.[0];
    const details = {
      title: field('title').value,
      author: field('author').value,
      language: field('language').value,
    };
    controller = new AbortController();
    const { signal } = controller;
    inputs.disabled = true;
    cancel.disabled = false;
    download.clear();
    progress.reset(file.name);
    status.textContent = 'Preparing OCR…';
    try {
      const config = await readConfiguration(details, configFile);
      const workers = parseWorkers(workerInput.value);
      const model = parseModel(modelInput.value);
      signal.throwIfAborted();
      const { epub, report } = await convertPdfBrowser(file, config, {
        signal,
        workers,
        model,
        onProgress: (event) => {
          if (!signal.aborted) progress.update(event);
        },
      });
      signal.throwIfAborted();
      const bytes = download.show(epub, file.name);
      progress.finish();
      status.textContent = `Ready — ${(bytes / 1048576).toFixed(2)} MiB; ${report.workers} OCR worker${report.workers === 1 ? '' : 's'}.`;
    } catch (error) {
      progress.stop(signal.aborted ? 'cancelled' : 'failed');
      status.textContent = signal.aborted
        ? 'Cancelled.'
        : `Conversion failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      controller = undefined;
      inputs.disabled = false;
      cancel.disabled = true;
    }
  });
}
