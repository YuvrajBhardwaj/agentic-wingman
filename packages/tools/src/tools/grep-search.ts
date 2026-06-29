import { z } from 'zod';

import { defineTool } from '../define-tool.js';
import { matchGlob } from '../glob.js';
import { walkFiles } from '../walk.js';

const input = z.object({
  pattern: z.string().min(1).describe('Regular expression to search for in file contents'),
  include: z.string().optional().describe('Optional glob limiting which files are searched'),
  ignoreCase: z.boolean().default(false),
  limit: z.number().int().min(1).max(1000).default(100).describe('Maximum matches to return'),
});

export interface GrepMatch {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

export interface GrepSearchResult {
  readonly pattern: string;
  readonly matches: readonly GrepMatch[];
  readonly truncated: boolean;
}

/** Skip files that look binary by sniffing for a NUL byte in the first 8KB. */
const looksBinary = (content: string): boolean => {
  const limit = Math.min(content.length, 8192);
  for (let i = 0; i < limit; i += 1) {
    if (content.charCodeAt(i) === 0) return true;
  }
  return false;
};

export const grepSearchTool = defineTool({
  name: 'grep_search',
  description:
    'Search workspace file contents with a regular expression, returning file/line matches.',
  capability: 'fs.read',
  input,
  describe: (i) => ({ summary: `Grep /${i.pattern}/`, target: i.include ?? '**' }),
  run: async (i, ctx) => {
    let regex: RegExp;
    try {
      regex = new RegExp(i.pattern, i.ignoreCase ? 'i' : undefined);
    } catch (error) {
      throw new Error(
        `Invalid regular expression: ${error instanceof Error ? error.message : i.pattern}`,
      );
    }

    const files = await walkFiles(ctx.cwd, { signal: ctx.signal });
    const candidates = i.include ? files.filter((f) => matchGlob(i.include as string, f)) : files;

    const matches: GrepMatch[] = [];
    for (const path of candidates) {
      if (ctx.signal.aborted) break;
      if (matches.length >= i.limit) break;
      let content: string;
      try {
        content = await ctx.fs.readFile(path);
      } catch {
        continue;
      }
      if (looksBinary(content)) continue;
      const lines = content.split('\n');
      for (let n = 0; n < lines.length; n += 1) {
        const text = lines[n] ?? '';
        if (regex.test(text)) {
          matches.push({ path, line: n + 1, text: text.slice(0, 400) });
          if (matches.length >= i.limit) break;
        }
      }
    }

    return { pattern: i.pattern, matches, truncated: matches.length >= i.limit };
  },
});
