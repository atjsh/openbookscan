import type { VNode } from 'preact';
import { render } from 'preact-render-to-string';

declare module 'preact' {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Must match Preact's generic declaration for interface merging.
    interface HTMLAttributes<RefType extends EventTarget = EventTarget> {
      'epub:type'?: string;
      'epub:prefix'?: string;
    }
  }
}

/** Render pure, synchronous document components without mounting a browser UI. */
export function renderContent<Props>(content: VNode<Props>): string {
  return render(content);
}
