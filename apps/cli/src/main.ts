#!/usr/bin/env node
import { run } from './run.js';

run(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode =
    error instanceof Error && error.name === 'AbortError' ? 130 : 1;
});
