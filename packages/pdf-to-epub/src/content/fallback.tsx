import { pageImageUrl } from './images.js';

export function Fallback({ page, blank }: { page: number; blank: boolean }) {
  return blank ? (
    <p class="note">Blank source page.</p>
  ) : (
    <figure>
      <img
        src={pageImageUrl(page)}
        alt={`Source page ${page}, preserved as an image to retain its layout`}
      />
    </figure>
  );
}
