export const usage =
  'Usage: openbookscan input.pdf output.epub --config book.json';

export function parseArguments(args: string[]) {
  if (
    args.length !== 4 ||
    args[2] !== '--config' ||
    args.some((value) => !value)
  ) {
    throw new Error(usage);
  }
  return { input: args[0], output: args[1], configFile: args[3] };
}
