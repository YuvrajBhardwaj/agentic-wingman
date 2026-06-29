import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { parseCsv } from './csv.js';
import { compareDocuments } from './operations.js';
import { DocumentRegistry } from './registry.js';
import type { DocumentInput } from './types.js';

const registry = new DocumentRegistry();
const input = (filename: string, bytes: Buffer): DocumentInput => ({ filename, bytes });

describe('parseCsv', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseCsv('Name,Note\n"Doe, Jr","said ""hi"""\nBob,plain');
    expect(rows).toEqual([
      ['Name', 'Note'],
      ['Doe, Jr', 'said "hi"'],
      ['Bob', 'plain'],
    ]);
  });
});

describe('DocumentRegistry', () => {
  it('reads markdown', async () => {
    const doc = await registry.parse(input('notes.md', Buffer.from('# Title\n\nbody')));
    expect(doc.format).toBe('markdown');
    expect(doc.text).toContain('# Title');
  });

  it('reads CSV into a table', async () => {
    const doc = await registry.parse(input('data.csv', Buffer.from('Name,Age\nAlice,30\nBob,25')));
    expect(doc.tables).toHaveLength(1);
    expect(doc.tables[0]?.headers).toEqual(['Name', 'Age']);
    expect(doc.tables[0]?.rows).toEqual([
      ['Alice', '30'],
      ['Bob', '25'],
    ]);
  });

  it('extracts tables from an XLSX workbook (round-trip)', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Age'],
      ['Alice', 30],
      ['Bob', 25],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'People');
    const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const doc = await registry.parse(input('people.xlsx', bytes));
    expect(doc.format).toBe('xlsx');
    expect(doc.tables[0]?.name).toBe('People');
    expect(doc.tables[0]?.headers).toEqual(['Name', 'Age']);
    expect(doc.tables[0]?.rows).toEqual([
      ['Alice', '30'],
      ['Bob', '25'],
    ]);
  });

  it('lists entries of a ZIP archive', async () => {
    const zip = new AdmZip();
    zip.addFile('a.txt', Buffer.from('hello'));
    zip.addFile('dir/b.txt', Buffer.from('world'));
    const doc = await registry.parse(input('bundle.zip', zip.toBuffer()));
    expect(doc.metadata.files).toBe(2);
    expect(doc.text).toContain('a.txt');
  });

  it('reads image dimensions', async () => {
    // Minimal PNG header declaring a 2x3 image.
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03, 0x08, 0x06, 0x00, 0x00, 0x00,
    ]);
    const doc = await registry.parse(input('pic.png', png));
    expect(doc.metadata.width).toBe(2);
    expect(doc.metadata.height).toBe(3);
  });

  it('throws for an unsupported format', async () => {
    await expect(registry.parse(input('a.xyz', Buffer.from('x')))).rejects.toThrow(
      /No document reader/,
    );
  });

  it('exposes supported extensions', () => {
    expect(registry.supportedExtensions()).toEqual(
      expect.arrayContaining(['csv', 'md', 'xlsx', 'zip', 'png']),
    );
  });
});

describe('compareDocuments', () => {
  it('reports added and removed lines between versions', () => {
    const before = { format: 'text', text: 'a\nb\nc', tables: [], metadata: {} };
    const after = { format: 'text', text: 'a\nc\nd', tables: [], metadata: {} };
    const diff = compareDocuments(before, after);
    expect(diff.added).toEqual(['d']);
    expect(diff.removed).toEqual(['b']);
  });
});
