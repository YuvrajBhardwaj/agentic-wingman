import { z } from 'zod';

import { defineTool } from '../define-tool.js';

const input = z.object({
  path: z.string().min(1).describe('Workspace-relative path to the file to read'),
  startLine: z.number().int().min(1).optional().describe('1-based first line to return'),
  endLine: z.number().int().min(1).optional().describe('1-based last line to return (inclusive)'),
});

export interface ReadFileResult {
  readonly path: string;
  readonly content: string;
  readonly totalLines: number;
}

export const readFileTool = defineTool({
  name: 'read_file',
  description: 'Read a UTF-8 text file from the workspace, optionally a line range.',
  capability: 'fs.read',
  input,
  describe: (i) => ({ summary: `Read file ${i.path}`, target: i.path }),
  run: async (i, ctx) => {
    const full = await ctx.fs.readFile(i.path);
    const lines = full.split('\n');
    const start = (i.startLine ?? 1) - 1;
    const end = i.endLine ?? lines.length;
    const slice =
      i.startLine !== undefined || i.endLine !== undefined ? lines.slice(start, end) : lines;
    return { path: i.path, content: slice.join('\n'), totalLines: lines.length };
  },
});
