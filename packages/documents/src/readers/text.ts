import type { DocumentReader } from '../types.js';

export const markdownReader: DocumentReader = {
  id: 'markdown',
  extensions: ['md', 'markdown'],
  async parse(input) {
    const text = input.bytes.toString('utf8');
    return { format: 'markdown', text, tables: [], metadata: { bytes: input.bytes.length } };
  },
};

export const textReader: DocumentReader = {
  id: 'text',
  extensions: ['txt', 'text', 'log'],
  async parse(input) {
    const text = input.bytes.toString('utf8');
    return {
      format: 'text',
      text,
      tables: [],
      metadata: { bytes: input.bytes.length, lines: text.split('\n').length },
    };
  },
};

export const jsonReader: DocumentReader = {
  id: 'json',
  extensions: ['json'],
  async parse(input) {
    const raw = input.bytes.toString('utf8');
    let pretty = raw;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      // keep raw text if not valid JSON
    }
    return { format: 'json', text: pretty, tables: [], metadata: { bytes: input.bytes.length } };
  },
};
