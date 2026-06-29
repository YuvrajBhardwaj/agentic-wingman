/** Compute the dot product of two equal-length vectors. */
export const dot = (a: readonly number[], b: readonly number[]): number => {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) sum += (a[i] as number) * (b[i] as number);
  return sum;
};

export const magnitude = (a: readonly number[]): number => Math.sqrt(dot(a, a));

/** Cosine similarity in [-1, 1]; 0 if either vector is zero-length. */
export const cosineSimilarity = (a: readonly number[], b: readonly number[]): number => {
  const denom = magnitude(a) * magnitude(b);
  return denom === 0 ? 0 : dot(a, b) / denom;
};

/** Return an L2-normalized copy of the vector. */
export const normalize = (a: readonly number[]): number[] => {
  const mag = magnitude(a);
  if (mag === 0) return [...a];
  return a.map((x) => x / mag);
};
