import { Page, type PageContent } from './page.js';

export function Chapter({ pages }: { pages: PageContent[] }) {
  return (
    <>
      {pages.map((page) => (
        <Page {...page} />
      ))}
    </>
  );
}
