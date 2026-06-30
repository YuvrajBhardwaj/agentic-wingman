/**
 * Tiny dependency-free ANSI styling. Colors are disabled automatically when
 * stdout is not a TTY or when NO_COLOR / FORGE_NO_COLOR is set, so piped output
 * stays clean.
 */

const enabled =
  process.stdout.isTTY === true &&
  !process.env.NO_COLOR &&
  !process.env.FORGE_NO_COLOR &&
  process.env.TERM !== 'dumb';

const wrap =
  (open: number, close: number) =>
  (text: string): string =>
    enabled ? `[${open}m${text}[${close}m` : text;

export const color = {
  enabled,
  reset: '[0m',
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
} as const;

/** Glyphs used in the transcript. Falls back to ASCII when color is off. */
export const glyph = {
  bullet: enabled ? '●' : '*',
  arrow: enabled ? '›' : '>',
  check: enabled ? '✓' : 'OK',
  cross: enabled ? '✗' : 'X',
  dot: enabled ? '·' : '.',
} as const;
