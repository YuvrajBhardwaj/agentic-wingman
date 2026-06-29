import * as XLSX from 'xlsx';

import type { DocumentReader, DocumentTable } from '../types.js';

const cell = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value);

export const xlsxReader: DocumentReader = {
  id: 'xlsx',
  extensions: ['xlsx', 'xls'],
  async parse(input) {
    const workbook = XLSX.read(input.bytes, { type: 'buffer' });
    const tables: DocumentTable[] = [];
    const textParts: string[] = [];

    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
      const stringRows = rows.map((r) => r.map(cell));
      const headers = stringRows[0] ?? [];
      const table: DocumentTable = { name, headers, rows: stringRows.slice(1) };
      tables.push(table);
      textParts.push(`# ${name}\n${stringRows.map((r) => r.join(' | ')).join('\n')}`);
    }

    return {
      format: 'xlsx',
      text: textParts.join('\n\n'),
      tables,
      metadata: { sheets: workbook.SheetNames.length },
    };
  },
};
