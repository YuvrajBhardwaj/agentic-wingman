/** Map a file extension to a language id. */
export const languageForPath = (path: string): string | undefined => {
  const ext = path.slice(path.lastIndexOf('.'));
  switch (ext) {
    case '.ts':
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.jsx':
      return 'jsx';
    case '.json':
      return 'json';
    case '.md':
      return 'markdown';
    default:
      return undefined;
  }
};

export const isTypeScriptFamily = (language: string): boolean =>
  language === 'typescript' ||
  language === 'tsx' ||
  language === 'javascript' ||
  language === 'jsx';
