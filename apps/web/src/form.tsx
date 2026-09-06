import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { titleFromFilename } from './config.js';
import { languageOptions } from './languages.js';

const suggestions = {
  book: languageOptions('book'),
  ocr: languageOptions('ocr'),
};

export function ConversionForm({
  running,
  onSubmit,
}: {
  running: boolean;
  onSubmit: JSX.SubmitEventHandler<HTMLFormElement>;
}) {
  const [title, setTitle] = useState('');
  const [configured, setConfigured] = useState(false);
  const suggested = useRef('');
  return (
    <form id="convert-form" onSubmit={onSubmit}>
      <fieldset id="inputs" disabled={running}>
        <legend>Convert Book</legend>
        <fieldset id="source">
          <legend>Source</legend>
          <p>
            <label>
              PDF{' '}
              <input
                name="pdf"
                type="file"
                accept=".pdf,application/pdf"
                required
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  const next = titleFromFilename(file.name);
                  if (!title || title === suggested.current) setTitle(next);
                  suggested.current = next;
                }}
              />
            </label>
          </p>
        </fieldset>
        <fieldset id="metadata" disabled={configured}>
          <legend>ePUB Settings</legend>
          <p>
            <label>
              Title{' '}
              <input
                name="title"
                value={title}
                onInput={(event) => setTitle(event.currentTarget.value)}
                required
              />
            </label>
          </p>
          <p>
            <label>
              Author <input name="author" required />
            </label>
          </p>
          <p>
            <label>
              Book language{' '}
              <input name="language" list="book-languages" required />
            </label>
            <datalist id="book-languages">
              {suggestions.book.map(({ value, label }) => (
                <option key={value} value={value} label={label}>
                  {label}
                </option>
              ))}
            </datalist>
          </p>
        </fieldset>
        <p hidden>
          <label>
            Configuration JSON (optional){' '}
            <input
              name="config"
              type="file"
              accept=".json,application/json"
              onChange={(event) =>
                setConfigured(Boolean(event.currentTarget.files?.length))
              }
            />
          </label>{' '}
          (
          <a
            href={`${import.meta.env.BASE_URL}config.example.json`}
            download=""
          >
            example
          </a>
          )
        </p>
        <fieldset id="ocr-settings">
          <legend>OCR Settings</legend>
          <p>
            <label>
              OCR language{' '}
              <input
                name="ocr-language"
                list="ocr-languages"
                disabled={configured}
                required
              />
            </label>
            <datalist id="ocr-languages">
              {suggestions.ocr.map(({ value, label }) => (
                <option key={value} value={value} label={label}>
                  {label}
                </option>
              ))}
            </datalist>
          </p>
          <p>
            <label>
              OCR model{' '}
              <select name="model">
                <option value="fast">Fast</option>
                <option value="best">Best</option>
              </select>
            </label>
          </p>
          <p>
            <label>
              OCR workers{' '}
              <input
                name="workers"
                list="worker-counts"
                defaultValue="auto"
                required
              />
            </label>
            <datalist id="worker-counts">
              <option value="auto">Automatic</option>
              <option value="1" />
              <option value="2" />
              <option value="4" />
            </datalist>
          </p>
        </fieldset>
        <br />
        <button type="submit">Convert</button>
      </fieldset>
    </form>
  );
}
