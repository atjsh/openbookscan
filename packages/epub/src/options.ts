import type { Options } from 'epub-gen-memory';
import type { Book, Metadata } from './types.js';

const metadataKeys = new Set([
  'title',
  'author',
  'language',
  'publisher',
  'description',
  'date',
]);
const imageExtensions: Record<string, readonly string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'image/svg+xml': ['svg'],
};

function text(
  value: unknown,
  name: string,
  empty = false,
): asserts value is string {
  if (typeof value !== 'string' || (!empty && !value.trim())) {
    throw new TypeError(`${name} must be a nonempty string`);
  }
  if (
    // eslint-disable-next-line no-control-regex -- XML metadata must reject these control characters.
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\p{Cs}]/u.test(value)
  ) {
    throw new TypeError(`${name} contains an invalid XML character`);
  }
}

function image(bytes: Uint8Array, mediaType: string, name: string): void {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new TypeError(`Image bytes are required: ${name}`);
  }
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (!imageExtensions[mediaType]?.includes(extension ?? '')) {
    throw new TypeError(
      `Image filename and media type must match: ${name} (${mediaType})`,
    );
  }
}

export function metadataOptions(metadata: Metadata): Options {
  if (!metadata || typeof metadata !== 'object')
    throw new TypeError('Metadata is required');
  for (const key of Object.keys(metadata)) {
    if (!metadataKeys.has(key))
      throw new TypeError(`Unsupported metadata field: ${key}`);
  }
  for (const key of ['title', 'author', 'language'] as const)
    text(metadata[key], `metadata.${key}`);
  for (const key of ['publisher', 'description', 'date'] as const) {
    if (metadata[key] !== undefined) text(metadata[key], `metadata.${key}`);
  }
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(metadata.language)) {
    throw new TypeError(
      'metadata.language must be a language tag such as en or ko-KR',
    );
  }
  if (
    metadata.date !== undefined &&
    !Number.isFinite(Date.parse(metadata.date))
  ) {
    throw new TypeError('metadata.date must be a valid date');
  }
  return {
    title: metadata.title,
    author: metadata.author,
    lang: metadata.language,
    description:
      metadata.description ?? 'Converted from PDF using automated OCR.',
    ...(metadata.publisher === undefined
      ? {}
      : { publisher: metadata.publisher }),
    ...(metadata.date === undefined ? {} : { date: metadata.date }),
  };
}

export function bookOptions(book: Book): Options {
  if (!book || typeof book !== 'object')
    throw new TypeError('Book inputs are required');
  const options = metadataOptions(book.metadata);
  if (!Array.isArray(book.chapters) || book.chapters.length === 0)
    throw new TypeError('At least one chapter is required');
  for (const [index, chapter] of book.chapters.entries()) {
    text(chapter?.title, `chapters[${index}].title`);
    text(chapter.content, `chapters[${index}].content`, true);
    if (
      chapter.filename !== undefined &&
      (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.xhtml$/.test(chapter.filename) ||
        chapter.filename.includes('..') ||
        chapter.filename === 'toc.xhtml')
    ) {
      throw new TypeError(
        `Unsafe or reserved chapter filename: ${chapter.filename}`,
      );
    }
  }
  if (!Array.isArray(book.images))
    throw new TypeError('images must be an array');
  const urls = new Set<string>();
  for (const resource of book.images) {
    const url = new URL(resource.url);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.href !== resource.url
    )
      throw new TypeError(
        `Image URL must be a canonical absolute HTTP(S) identifier: ${resource.url}`,
      );
    if (urls.has(resource.url))
      throw new TypeError(`Duplicate image URL: ${resource.url}`);
    urls.add(resource.url);
    image(resource.bytes, resource.mediaType, url.pathname);
  }
  if (book.cover !== undefined) {
    const { bytes, mediaType, name } = book.cover;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) || name.includes('..'))
      throw new TypeError(`Unsafe cover filename: ${name}`);
    image(bytes, mediaType, name);
    options.cover = new File([new Uint8Array(bytes)], name, {
      type: mediaType,
    });
  }
  return options;
}
