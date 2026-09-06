import type { ImageResource, PreviewEvent } from '@openbookscan/pdf-to-epub';

export interface PreviewEntry {
  id: string;
  title: string;
  content: string;
  images: ImageResource[];
  pages: number[];
}

export class ConversionPreview {
  entries: PreviewEntry[] = [];
  selected = '';
  language = 'en';
  final = false;
  stopped = false;

  update(event: PreviewEvent): boolean {
    if (this.final || this.stopped) return false;
    if (event.type === 'page') {
      const id = `page-${event.page}`;
      if (this.entries.some((entry) => entry.id === id)) return false;
      this.entries.push({
        ...event,
        id,
        title: `Page ${event.page}`,
        pages: [event.page],
      });
      this.entries.sort((a, b) => a.pages[0] - b.pages[0]);
      if (!this.selected) this.selected = id;
    } else {
      const page = this.current?.pages[0];
      const { book } = event;
      this.language = book.metadata.language;
      this.entries = book.chapters.map((chapter, index) => ({
        id: `chapter-${index}`,
        title: chapter.title,
        content: chapter.content,
        images: book.images,
        pages: [...chapter.content.matchAll(/\bid="p(\d+)"/g)].map((match) =>
          Number(match[1]),
        ),
      }));
      if (book.cover) {
        const url = 'https://openbookscan.invalid/preview-cover';
        this.entries.unshift({
          id: 'cover',
          title: 'Cover',
          pages: [],
          content: `<figure><img src="${url}" alt="Book cover" /></figure>`,
          images: [
            { url, bytes: book.cover.bytes, mediaType: book.cover.mediaType },
          ],
        });
      }
      this.selected =
        this.entries.find(
          (entry) => page !== undefined && entry.pages.includes(page),
        )?.id ??
        this.entries[0]?.id ??
        '';
      this.final = true;
    }
    return true;
  }

  get current(): PreviewEntry | undefined {
    return this.entries.find((entry) => entry.id === this.selected);
  }

  selectPage(page: number): boolean {
    const entry = this.entries.find((entry) => entry.pages.includes(page));
    if (!entry) return false;
    this.selected = entry.id;
    return true;
  }

  stop(): void {
    this.stopped = true;
  }
}

/** Parse off-document; only supplied image bytes may load in the sandbox. */
export function createPreviewDocument(
  document: Document,
  entry: PreviewEntry,
  language: string,
) {
  const template = document.createElement('template');
  template.innerHTML = entry.content;
  const urls = new Map<string, string>();
  const dispose = () => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.clear();
  };
  try {
    // Chapter HTML is generated locally. Keep embedded documents and navigation out of the preview.
    template.content
      .querySelectorAll('script,style,link,meta,base,iframe,object,embed,form')
      .forEach((element) => element.remove());
    template.content.querySelectorAll('*').forEach((element) => {
      for (const { name } of Array.from(element.attributes)) {
        if (
          /^on/i.test(name) ||
          ['style', 'srcset', 'href', 'xlink:href', 'action'].includes(name)
        )
          element.removeAttribute(name);
      }
    });
    for (const image of Array.from(template.content.querySelectorAll('img'))) {
      const source = image.getAttribute('src') ?? '';
      const resource = entry.images.find((image) => image.url === source);
      if (!resource) throw Error(`Missing preview image: ${source}`);
      let url = urls.get(source);
      if (!url) {
        url = URL.createObjectURL(
          new Blob([new Uint8Array(resource.bytes)], {
            type: resource.mediaType,
          }),
        );
        urls.set(source, url);
      }
      image.src = url;
    }
    const html = document.implementation.createHTMLDocument(entry.title);
    html.documentElement.lang = language;
    const policy = html.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content =
      "default-src 'none'; img-src blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
    html.head.prepend(policy);
    const style = html.createElement('style');
    style.textContent =
      'body{font:1.125rem/1.65 Georgia,serif;margin:1.5rem;overflow-wrap:anywhere;color:#1f2328;background:white}figure{margin:1em 0}img{max-width:100%;height:auto}.footnote,.note{font-size:.9em}';
    html.head.append(style);
    const title = html.createElement('h1');
    title.textContent = entry.title;
    html.body.append(title, template.content);
    return {
      srcdoc: '<!doctype html>' + html.documentElement.outerHTML,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
