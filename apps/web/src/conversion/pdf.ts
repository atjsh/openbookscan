import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker&url';
import cMap from 'pdfjs-dist/cmaps/Adobe-CNS1-0.bcmap?url';
import standardFont from 'pdfjs-dist/standard_fonts/FoxitSerif.pfb?url';
import wasm from 'pdfjs-dist/wasm/openjpeg.wasm?url';
import type {
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist/types/src/display/api.js';
import type { RenderedPage } from '@openbookscan/pdf-to-epub';
import type { PdfSource } from './types.js';
import { aborted, wait } from './cancellation.js';

// Include companions with their original names for PDF.js's directory-based loading.
import.meta.glob(
  [
    '#pdfjs-dist/{cmaps,standard_fonts,wasm}/**/*',
    '#pdfjs-dist/{LICENSE*,COPYING*,NOTICE*}',
  ],
  { eager: true, query: '?url', import: 'default' },
);
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

function uniformlyWhite(pixels: Uint8ClampedArray): boolean {
  for (let i = 0; i < pixels.length; i += 4) {
    if (
      pixels[i] !== 255 ||
      pixels[i + 1] !== 255 ||
      pixels[i + 2] !== 255 ||
      pixels[i + 3] !== 255
    )
      return false;
  }
  return true;
}

export async function openPdf(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<PdfSource> {
  aborted(signal);
  const loading = pdfjs.getDocument({
    data: bytes.slice(), // PDF.js transfers this buffer; preserve the caller's input.
    cMapUrl: new URL('.', new URL(cMap, location.href)).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('.', new URL(standardFont, location.href))
      .href,
    wasmUrl: new URL('.', new URL(wasm, location.href)).href,
    stopAtErrors: true,
  });
  const controller = new AbortController();
  let rendering: Promise<RenderedPage> | undefined;
  let activeRender: RenderTask | undefined;
  let closed: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (closed) return closed;
    signal?.removeEventListener('abort', cancel);
    controller.abort(signal?.reason);
    const task = activeRender;
    closed = (async () => {
      await Promise.allSettled([
        Promise.resolve().then(() => task?.cancel()),
        Promise.resolve().then(() => loading.destroy()),
        rendering,
      ]);
    })();
    return closed;
  };
  const cancel = () => {
    void close();
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const pdf = await wait(loading.promise, controller.signal);
    aborted(controller.signal);
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1)
      throw Error('PDF contains no valid pages');
    const renderPage = async (number: number): Promise<RenderedPage> => {
      let page: PDFPageProxy | undefined;
      let canvas: OffscreenCanvas | undefined;
      try {
        aborted(controller.signal);
        page = await wait(pdf.getPage(number), controller.signal);
        aborted(controller.signal);
        const viewport = page.getViewport({ scale: 300 / 72 });
        const width = Math.ceil(viewport.width),
          height = Math.ceil(viewport.height);
        canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        if (!context) throw Error('A 2D canvas context is required');
        const task = page.render({
          canvas: null,
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
          background: 'rgb(255,255,255)',
        });
        activeRender = task;
        await wait(task.promise, controller.signal);
        activeRender = undefined;
        aborted(controller.signal);
        const blank = uniformlyWhite(
          context.getImageData(0, 0, width, height).data,
        );
        const png = new Uint8Array(
          await (
            await canvas.convertToBlob({ type: 'image/png' })
          ).arrayBuffer(),
        );
        aborted(controller.signal);
        return { width, height, blank, png };
      } finally {
        activeRender = undefined;
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        page?.cleanup();
      }
    };
    return {
      count: pdf.numPages,
      close,
      render(number) {
        // The core renders sequentially; close must also await PNG encoding.
        return (rendering = Promise.resolve()
          .then(() => renderPage(number))
          .finally(() => {
            rendering = undefined;
          }));
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
