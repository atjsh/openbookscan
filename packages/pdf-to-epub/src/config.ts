import type { ConversionConfig } from './types.js';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validateConfig(
  config: unknown,
  count?: number,
): asserts config is ConversionConfig {
  if (!record(config) || !record(config.metadata))
    throw Error('metadata is required');
  const metadata = config.metadata;
  for (const field of ['id', 'modified']) {
    if (field in metadata)
      throw Error(
        `metadata.${field} is no longer supported; the EPUB generator supplies it`,
      );
  }
  for (const field of ['title', 'author', 'language']) {
    if (typeof metadata[field] !== 'string' || !metadata[field].trim())
      throw Error(`metadata.${field} is required`);
  }
  for (const field of ['publisher', 'description', 'date']) {
    if (metadata[field] !== undefined && typeof metadata[field] !== 'string')
      throw Error(`metadata.${field} must be text`);
  }
  if (
    config.language !== undefined &&
    (typeof config.language !== 'string' ||
      !/^[a-z_]+(?:\+[a-z_]+)*$/i.test(config.language))
  )
    throw Error('Invalid OCR language');
  if (
    config.languagePath !== undefined &&
    (typeof config.languagePath !== 'string' || !config.languagePath.trim())
  )
    throw Error('languagePath must be a nonempty path');
  const validPage = (value: unknown): value is number =>
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    (count === undefined || value <= count);
  if (config.chapters !== undefined && !Array.isArray(config.chapters))
    throw Error('chapters must be an array');
  let previous = 0;
  for (const chapter of config.chapters ?? []) {
    if (
      !record(chapter) ||
      !validPage(chapter.page) ||
      chapter.page <= previous ||
      typeof chapter.title !== 'string' ||
      !chapter.title.trim()
    )
      throw Error('Chapters require increasing source page numbers and titles');
    previous = chapter.page;
  }
  if (config.coverPage !== undefined && !validPage(config.coverPage))
    throw Error('Invalid coverPage');
  if (config.pages !== undefined && !record(config.pages))
    throw Error('pages must be an object');
  for (const [page, mode] of Object.entries(config.pages ?? {})) {
    if (
      !/^[1-9]\d*$/.test(page) ||
      !validPage(Number(page)) ||
      typeof mode !== 'string' ||
      !['auto', 'text', 'image'].includes(mode)
    )
      throw Error(`Invalid page override: ${page}`);
  }
}
