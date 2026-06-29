import { z } from 'zod';

import { defineTool } from '../define-tool.js';

const input = z.object({
  path: z.string().min(1).default('.').describe('Workspace-relative directory to list'),
});

export interface ListDirResult {
  readonly path: string;
  readonly entries: readonly string[];
}

export const listDirTool = defineTool({
  name: 'list_dir',
  description: 'List the entries of a workspace directory. Directory names end with "/".',
  capability: 'fs.read',
  input,
  describe: (i) => ({ summary: `List directory ${i.path}`, target: i.path }),
  run: async (i, ctx) => {
    const entries = await ctx.fs.list(i.path);
    return { path: i.path, entries: [...entries].sort() };
  },
});
