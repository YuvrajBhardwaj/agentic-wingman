/**
 * Convert a glob pattern into an anchored RegExp.
 * Supports `**` (any depth, including none), `*` (within a path segment),
 * `?` (single char), and `{a,b}` alternation.
 */
export const globToRegExp = (glob: string): RegExp => {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**` — match across segment boundaries.
        re += '.*';
        i += 2;
        if (glob[i] === '/') i += 1; // consume trailing slash so `**/x` matches `x`
        continue;
      }
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) {
        re += '\\{';
      } else {
        const alts = glob
          .slice(i + 1, end)
          .split(',')
          .map((a) => a.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
        re += `(?:${alts.join('|')})`;
        i = end + 1;
        continue;
      }
    } else if (c !== undefined && '.+^$()|[]\\'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
    i += 1;
  }
  return new RegExp(`^${re}$`);
};

export const matchGlob = (glob: string, path: string): boolean => globToRegExp(glob).test(path);
