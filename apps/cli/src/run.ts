import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { convertPdfNode } from './conversion/convert.js';
import { parseArguments, usage } from './arguments.js';
import { loadConfig } from './config.js';
import { writeConversion } from './output.js';

export async function run(args: string[]) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(usage);
    return;
  }
  const { input, output, configFile } = parseArguments(args);
  const { config, languagePath } = await loadConfig(configFile);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const report = await writeConversion(
      output,
      async () =>
        convertPdfNode(new Uint8Array(await readFile(input)), config, {
          languagePath,
          signal: controller.signal,
          onProgress: (progress) => {
            if (progress.stage === 'page-complete')
              console.error(
                `Page ${progress.page}/${progress.total}: ${progress.mode}`,
              );
          },
        }),
      controller.signal,
    );
    const { pages: _pages, ...summary } = report;
    console.log(
      JSON.stringify({ output: resolve(output), ...summary }, null, 2),
    );
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
