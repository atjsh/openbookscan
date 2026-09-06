import type { Book } from '@openbookscan/epub';
import type { ProcessedPage } from '../types.js';

export const pageImageUrl = (page: number) =>
  `https://openbookscan.invalid/images/page-${page}.png`;

export function retainedImages(
  pages: ProcessedPage[],
  coverPage?: number,
): Pick<Book, 'images' | 'cover'> {
  const images: Book['images'] = [];
  let cover: Book['cover'];
  for (const page of pages) {
    if (page.report.mode === 'image') {
      if (!page.png) throw Error(`Page ${page.page}: missing fallback image`);
      images.push({
        url: pageImageUrl(page.page),
        mediaType: 'image/png',
        bytes: page.png,
      });
    }
    if (page.page === coverPage) {
      if (!page.png) throw Error(`Page ${page.page}: missing cover image`);
      cover = {
        bytes: page.png,
        mediaType: 'image/png',
        name: `page-${page.page}.png`,
      };
    }
  }
  return { images, ...(cover ? { cover } : {}) };
}
