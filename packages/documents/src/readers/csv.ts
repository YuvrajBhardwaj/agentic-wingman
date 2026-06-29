import { parseCsv } from '../csv.js';
import type { DocumentReader, DocumentTable } from '../types.js';

const tableFromRows = (rows: string[][], name?: string): DocumentTable => {
  const headers = rows[0] ?? [];
  return { ...(name ? { name } : {}), headers, rows: rows.slice(1) };
};

const renderTable = (table: DocumentTable): string => {
  const head = table.headers.join(' | ');
  const body = table.rows.map((r) => r.join(' | ')).join('\n');
  return `${head}\n${body}`;
};

export const csvReader: DocumentReader = {
  id: 'csv',
  extensions: ['csv', 'tsv'],
  async parse(input) {
    const delimiter = input.filename.toLowerCase().endsWith('.tsv') ? '\t' : ',';
    const rows = parseCsv(input.bytes.toString('utf8'), delimiter).filter((r) => r.length > 0);
    const table = tableFromRows(rows);
    return {
      format: 'csv',
      text: renderTable(table),
      tables: [table],
      metadata: { rows: table.rows.length, columns: table.headers.length },
    };
  },
};
