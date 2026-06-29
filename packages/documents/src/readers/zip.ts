import AdmZip from 'adm-zip';

import type { DocumentReader } from '../types.js';

export const zipReader: DocumentReader = {
  id: 'zip',
  extensions: ['zip'],
  async parse(input) {
    const zip = new AdmZip(input.bytes);
    const entries = zip.getEntries().map((e) => ({
      name: e.entryName,
      size: e.header.size,
      isDirectory: e.isDirectory,
    }));
    const files = entries.filter((e) => !e.isDirectory);
    const text = files.map((e) => `${e.name} (${e.size} bytes)`).join('\n');
    return {
      format: 'zip',
      text,
      tables: [],
      metadata: { entries: entries.length, files: files.length },
    };
  },
};
