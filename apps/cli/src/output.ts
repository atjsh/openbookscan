import { open, unlink, type FileHandle } from 'node:fs/promises';
import type { ConversionResult } from '@openbookscan/pdf-to-epub';

/** Reserve both destinations before conversion; remove only files created by this call. */
export async function writeConversion(
  output: string,
  convert: () => Promise<ConversionResult>,
  signal?: AbortSignal,
) {
  const reportPath = `${output}.report.json`;
  let epubFile: FileHandle | undefined, reportFile: FileHandle | undefined;
  let success = false;
  try {
    epubFile = await open(output, 'wx');
    reportFile = await open(reportPath, 'wx');
    const result = await convert();
    signal?.throwIfAborted();
    await epubFile.writeFile(result.epub);
    await reportFile.writeFile(JSON.stringify(result.report, null, 2) + '\n');
    signal?.throwIfAborted();
    success = true;
    return result.report;
  } finally {
    await epubFile?.close();
    await reportFile?.close();
    if (!success) {
      if (epubFile) await unlink(output);
      if (reportFile) await unlink(reportPath);
    }
  }
}
