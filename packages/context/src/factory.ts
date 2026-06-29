import type { ContextBuilder, Indexer } from '@forgewright/types';

import { LexicalContextBuilder } from './context-builder.js';
import { TsSymbolExtractor } from './extractors/ts-extractor.js';
import { RepoIndexer } from './indexer.js';

/** Create an indexer with the default extractor set. */
export const createIndexer = (root: string, now?: () => number): RepoIndexer =>
  new RepoIndexer({
    root,
    extractors: [new TsSymbolExtractor()],
    ...(now ? { now } : {}),
  });

/** Create a context builder over an indexer. */
export const createContextBuilder = (root: string, indexer: Indexer): ContextBuilder =>
  new LexicalContextBuilder({ root, indexer });
