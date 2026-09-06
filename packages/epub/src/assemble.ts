import { MemoryEPub } from './memory-resources.js';
import { bookOptions } from './options.js';
import type { AssemblyOptions, Book } from './types.js';

export type {
  AssemblyOptions,
  Book,
  Chapter,
  Cover,
  ImageResource,
  Metadata,
} from './types.js';

/** Assemble trusted chapter HTML and supplied image bytes; no filesystem or document uploads. */
export async function assembleEpub(
  book: Book,
  { signal }: AssemblyOptions = {},
): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const generator = new MemoryEPub(bookOptions(book), book, signal);
  const output: unknown = await generator.genEpub();
  signal?.throwIfAborted();
  // The upstream API produces a Buffer in Node and a Blob in a browser bundle.
  const bytes =
    output instanceof Uint8Array
      ? new Uint8Array(output)
      : output instanceof Blob
        ? new Uint8Array(await output.arrayBuffer())
        : undefined;
  if (!bytes)
    throw new TypeError(
      'The EPUB generator returned an unsupported byte container',
    );
  signal?.throwIfAborted();
  return bytes;
}
