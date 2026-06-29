import { z } from 'zod';

import { defineTool } from '../define-tool.js';
import { matchGlob } from '../glob.js';
import { walkFiles } from '../walk.js';

const input = z.object({
  pattern: z.string().min(1).describe('Glob pattern, e.g. "src/**/*.ts" or "**/*.{js,ts}"'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(2000)
    .default(200)
    .describe('Maximum number of paths to return'),
});

export interface GlobSearchResult {
  readonly pattern: string;
  readonly matches: readonly string[];
  readonly truncated: boolean;
}

export const globSearchTool = defineTool({
  name: 'glob_search',
  description: 'Find workspace files whose path matches a glob pattern.',
  capability: 'fs.read',
  input,
  describe: (i) => ({ summary: `Glob ${i.pattern}`, target: i.pattern }),
  run: async (i, ctx) => {
    const files = await walkFiles(ctx.cwd, { signal: ctx.signal });
    const all = files.filter((f) => matchGlob(i.pattern, f)).sort();
    return {
      pattern: i.pattern,
      matches: all.slice(0, i.limit),
      truncated: all.length > i.limit,
    };
  },
});
