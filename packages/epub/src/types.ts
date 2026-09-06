export interface Metadata {
  title: string;
  author: string;
  language: string;
  publisher?: string;
  description?: string;
  date?: string;
}

export interface Chapter {
  title: string;
  content: string;
  filename?: string;
}

export interface ImageResource {
  url: string;
  bytes: Uint8Array;
  mediaType: string;
}

export interface Cover {
  bytes: Uint8Array;
  mediaType: string;
  name: string;
}

export interface Book {
  metadata: Metadata;
  chapters: Chapter[];
  images: ImageResource[];
  cover?: Cover;
}

export interface AssemblyOptions {
  signal?: AbortSignal;
}
