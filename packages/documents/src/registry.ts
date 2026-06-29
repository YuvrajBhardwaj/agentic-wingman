import { ForgewrightError } from '@forgewright/shared';

import { csvReader } from './readers/csv.js';
import { imageReader } from './readers/image.js';
import { jsonReader, markdownReader, textReader } from './readers/text.js';
import { xlsxReader } from './readers/xlsx.js';
import { zipReader } from './readers/zip.js';
import type { DocumentInput, DocumentReader, ParsedDocument } from './types.js';
import { extensionOf } from './types.js';

/**
 * Built-in readers. PDF/DOCX/PPTX readers implement the same {@link DocumentReader}
 * interface and register here once their parser libraries are wired.
 */
export const BUILTIN_READERS: readonly DocumentReader[] = [
  markdownReader,
  textReader,
  jsonReader,
  csvReader,
  xlsxReader,
  zipReader,
  imageReader,
];

export class DocumentRegistry {
  private readonly byExtension = new Map<string, DocumentReader>();

  constructor(readers: readonly DocumentReader[] = BUILTIN_READERS) {
    for (const reader of readers) this.register(reader);
  }

  register(reader: DocumentReader): void {
    for (const ext of reader.extensions) this.byExtension.set(ext, reader);
  }

  readerFor(filename: string): DocumentReader | undefined {
    return this.byExtension.get(extensionOf(filename));
  }

  supportedExtensions(): readonly string[] {
    return [...this.byExtension.keys()].sort();
  }

  async parse(input: DocumentInput): Promise<ParsedDocument> {
    const reader = this.readerFor(input.filename);
    if (!reader) {
      throw new ForgewrightError('NOT_FOUND', `No document reader for "${input.filename}"`, {
        extension: extensionOf(input.filename),
      });
    }
    return reader.parse(input);
  }
}
