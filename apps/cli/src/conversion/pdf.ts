// Canvas globals must be installed before PDF.js is evaluated.
import './canvas.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import type {
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist/types/src/display/api.js';
import type { RenderedPage } from '@openbookscan/pdf-to-epub';
import type { PdfSource } from './types.js';
import { aborted, wait } from './cancellation.js';

const pdfRoot = new URL('.', import.meta.resolve('pdfjs-dist/package.json'));

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
    cMapUrl: fileURLToPath(new URL('cmaps/', pdfRoot)),
    cMapPacked: true,
    standardFontDataUrl: fileURLToPath(new URL('standard_fonts/', pdfRoot)),
    wasmUrl: fileURLToPath(new URL('wasm/', pdfRoot)),
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
      let canvas: Canvas | undefined;
      try {
        aborted(controller.signal);
        page = await wait(pdf.getPage(number), controller.signal);
        aborted(controller.signal);
        const viewport = page.getViewport({ scale: 300 / 72 });
        const width = Math.ceil(viewport.width),
          height = Math.ceil(viewport.height);
        canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
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
        const png = new Uint8Array(await canvas.encode('png'));
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
