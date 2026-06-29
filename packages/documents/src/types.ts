export interface DocumentInput {
  /** Original filename (used to infer format) and/or the raw bytes. */
  readonly filename: string;
  readonly bytes: Buffer;
  readonly mime?: string;
}

export interface DocumentTable {
  readonly name?: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface ParsedDocument {
  readonly format: string;
  /** Plain-text rendering of the document content. */
  readonly text: string;
  readonly tables: readonly DocumentTable[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** Parses one or more document formats into a normalized {@link ParsedDocument}. */
export interface DocumentReader {
  readonly id: string;
  /** Lowercase extensions (without dot) this reader handles. */
  readonly extensions: readonly string[];
  parse(input: DocumentInput): Promise<ParsedDocument>;
}

export const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
};
