import type { Tool, ToolRegistry } from '@forgewright/types';

import { globSearchTool } from './tools/glob-search.js';
import { grepSearchTool } from './tools/grep-search.js';
import { httpFetchTool } from './tools/http-fetch.js';
import { listDirTool } from './tools/list-dir.js';
import { readFileTool } from './tools/read-file.js';
import { shellTool } from './tools/shell.js';
import { writeFileTool } from './tools/write-file.js';

/** The default tool set available to the agent in Phase 2. */
export const builtinTools: readonly Tool[] = [
  readFileTool,
  writeFileTool,
  listDirTool,
  globSearchTool,
  grepSearchTool,
  shellTool,
  httpFetchTool,
] as Tool[];

/** Register every built-in tool into a registry. */
export const registerBuiltinTools = (registry: ToolRegistry): void => {
  for (const tool of builtinTools) registry.register(tool);
};
