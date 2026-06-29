import type { Embedder } from '@forgewright/types';

import { normalize } from './vector-math.js';

/** Stable 32-bit FNV-1a hash of a string. */
const fnv1a = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const tokenize = (text: string): string[] => {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 2);
  const grams: string[] = [];
  // Character trigrams add robustness to typos / shared morphology.
  for (const word of words) {
    grams.push(word);
    for (let i = 0; i + 3 <= word.length; i += 1) grams.push(`#${word.slice(i, i + 3)}`);
  }
  return grams;
};

/**
 * A deterministic, dependency-free embedder using the hashing trick. It needs no
 * model download and runs fully offline, so it is the default in local mode and
 * in tests. Texts that share tokens land near each other in cosine space. For
 * higher-quality semantic embeddings, use {@link OllamaEmbedder} (real
 * bge-small-en-v1.5) behind the same {@link Embedder} interface.
 */
export class HashingEmbedder implements Embedder {
  readonly model = 'hashing-v1';
  readonly dimensions: number;

  constructor(dimensions = 384) {
    this.dimensions = dimensions;
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    for (const token of tokenize(text)) {
      const h = fnv1a(token);
      const index = h % this.dimensions;
      const sign = (h & 1) === 0 ? 1 : -1; // signed hashing reduces collisions
      vec[index] = (vec[index] as number) + sign;
    }
    return normalize(vec);
  }

  async embed(texts: readonly string[]): Promise<readonly number[][]> {
    return texts.map((t) => this.embedOne(t));
  }
}
