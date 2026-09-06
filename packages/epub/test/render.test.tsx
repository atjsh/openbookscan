import assert from 'node:assert/strict';
import test from 'node:test';
import { renderContent } from '../src/render.js';

test('TSX preserves text, inline spacing, preformatted strings and EPUB attributes', () => {
  const Paragraph = ({ text }: { text: string }) => <p>{text}</p>;
  const result = renderContent(
    <>
      <span id="p1" epub:type="pagebreak" aria-label="1" />
      <Paragraph text={'A <tag> & "quote"'} />
      <p>
        One <em>two</em> three.{false}
        {null}
        {0}
      </p>
      <p class="footnote" epub:type="footnote">
        1. A note.
      </p>
      <pre>{'a  b\n c'}</pre>
      <img src="https://openbookscan.invalid/image.png" alt={'A & "B"'} />
    </>,
  );
  assert.match(result, /id="p1" epub:type="pagebreak" aria-label="1"/);
  assert.match(result, /A &lt;tag(?:>|&gt;) &amp; &quot;quote&quot;/);
  assert.match(result, /One <em>two<\/em> three\.0/);
  assert.match(result, /class="footnote" epub:type="footnote"/);
  assert.ok(result.includes('<pre>a  b\n c</pre>'));
  assert.match(result, /alt="A &amp; &quot;B&quot;"/);
});
