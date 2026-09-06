import { EPub, type Options } from 'epub-gen-memory';
import type { Book, ImageResource } from './types.js';

/** Only the generator's image-loading stage is replaced; it still owns names and manifests. */
export class MemoryEPub extends EPub {
  private readonly resources: Map<string, ImageResource>;

  constructor(
    options: Options,
    book: Book,
    private readonly signal?: AbortSignal,
  ) {
    super(options, book.chapters);
    this.resources = new Map(
      book.images.map((resource) => [resource.url, resource]),
    );
    const filenames = new Set<string>();
    for (const chapter of this.content) {
      if (filenames.has(chapter.filename) || chapter.filename === 'toc.xhtml') {
        throw new TypeError(
          `Duplicate or reserved chapter filename: ${chapter.filename}`,
        );
      }
      filenames.add(chapter.filename);
    }
  }

  protected override async downloadAllImages(): Promise<void> {
    for (const image of this.images) {
      this.signal?.throwIfAborted();
      const resource = this.resources.get(image.url);
      if (!resource) throw new Error(`Missing in-memory image: ${image.url}`);
      if (resource.mediaType !== image.mediaType)
        throw new TypeError(
          `Image media type differs from the generator: ${image.url}`,
        );
      this.zip.file(
        `OEBPS/images/${image.id}.${image.extension}`,
        resource.bytes,
      );
    }
  }
}
