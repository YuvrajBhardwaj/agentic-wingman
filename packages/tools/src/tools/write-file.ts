import { z } from 'zod';

import { defineTool } from '../define-tool.js';

const input = z.object({
  path: z.string().min(1).describe('Workspace-relative path to write'),
  content: z.string().describe('Full new file contents'),
});

export interface WriteFileResult {
  readonly path: string;
  readonly bytesWritten: number;
  readonly created: boolean;
}

export const writeFileTool = defineTool({
  name: 'write_file',
  description:
    'Create or overwrite a workspace file with the given contents. Parent directories are created as needed.',
  capability: 'fs.write',
  input,
  describe: (i) => ({ summary: `Write file ${i.path}`, target: i.path }),
  run: async (i, ctx) => {
    const existed = await ctx.fs.exists(i.path);
    await ctx.fs.writeFile(i.path, i.content);
    return {
      path: i.path,
      bytesWritten: Buffer.byteLength(i.content, 'utf8'),
      created: !existed,
    };
  },
});
