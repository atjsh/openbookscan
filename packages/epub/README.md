# @openbookscan/epub

Private npm workspace for EPUB 3 generation from trusted chapter-body HTML and in-memory images. It has no filesystem integration. `epub-gen-memory` owns templates, chapter navigation, resource names, and ZIP compression; Preact renders pure document components.

From the repository root:

```sh
npm run build --workspace @openbookscan/epub
npm run typecheck --workspace @openbookscan/epub
npm test --workspace @openbookscan/epub
```

Production JavaScript and declarations are emitted to `dist`. Tests compile separately to `.test-dist` and are excluded from the package allowlist.

## API

```tsx
import { assembleEpub } from '@openbookscan/epub';
import { renderContent } from '@openbookscan/epub/render';

const content = renderContent(
  <p>
    One <em>two</em> three.
  </p>,
);
const bytes = await assembleEpub({
  metadata: { title: 'Example', author: 'Example Author', language: 'en' },
  chapters: [{ title: 'Introduction', content }],
  images: [],
});
```

`assembleEpub(book, { signal? })` returns `Promise<Uint8Array>`. The root, `/node`, and `/browser` exports all resolve to the same implementation and declaration file; the bundler resolves the generator's platform dependencies. `renderContent` accepts a Preact VNode; configure TypeScript with `jsx: "react-jsx"` and `jsxImportSource: "preact"`. The browser UI itself does not use Preact.

Metadata requires `title`, `author`, and `language`; optional fields are `publisher`, `description`, and `date`. Legacy `id` and `modified` fields are rejected because the generator supplies those values. Chapter inputs contain `title`, body `content`, and an optional unique `.xhtml` filename without directories. HTML must already be trusted; the generator's normalization is not an HTML sanitizer. Put OCR text in ordinary JSX children, never raw HTML injection.

Images have `{ url, bytes, mediaType }`. Use canonical absolute identifiers such as `https://openbookscan.invalid/images/page-1.png` in chapter `img` elements and the image map. The map is the only source of image data: missing references fail, and unused supplied images are omitted. Supported extensions and media types are PNG, JPEG, GIF, and SVG. Bytes are retained unchanged. An optional cover `{ bytes, mediaType, name }` becomes a separate resource even when also displayed in reading content.

Cancellation is checked before assembly, during image insertion, and after ZIP creation. The generator's ZIP creation cannot be interrupted; a cancelled result is discarded when it finishes.

## Generator defaults and browser requirements

The generator normalizes HTML to XHTML and inserts chapter headings, so chapter bodies should not repeat their headings. It supplies chapter navigation without a custom source-page navigation document. Source anchors in bodies are preserved.

Without an explicit description, the wrapper supplies “Converted from PDF using automated OCR.” The library otherwise supplies its standard metadata: random identifier, current timestamps, `anonymous` publisher by default, “All rights reserved,” and copyright text using the current year and publisher. Those are generated defaults, not statements extracted from the input PDF. Its OPF package-level `xml:lang` remains `en` while the configured language is written into language metadata and chapter documents. Archives are not byte-deterministic.

Browser bundlers must honor the generator's `browser` field and resolve its exact `ejs` import to `ejs/ejs.min.js`; the web workspace's Vite configuration provides this alias. No UMD loader, global shim, custom JSX runtime, React compatibility layer, or hydration is used.

Direct runtime dependencies are pinned `epub-gen-memory@1.1.2`, `preact@10.29.8`, and `preact-render-to-string@6.7.0`. JSZip and Node typings are test/development dependencies. Shared TypeScript tooling is provided at the repository root.
