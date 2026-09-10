import { BigQuery } from '@google-cloud/bigquery';

let bigquery;

function getBigQuery() {
  if (!bigquery) bigquery = new BigQuery({ projectId: process.env.GCP_PROJECT_ID || undefined });
  return bigquery;
}

// Exposed to Claude as a tool. Kept as a single read-only query tool for the
// MVP — no write access, no arbitrary DDL.
export const bigQueryTool = {
  name: 'query_bigquery',
  description:
    'Uruchamia zapytanie SQL (tylko SELECT) na firmowym BigQuery i zwraca wynik jako JSON. Używaj do pytań o dane kampanii/sprzedaży.',
  input_schema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'Zapytanie SQL, wyłącznie SELECT.' },
    },
    required: ['sql'],
  },
};

export async function runBigQueryTool({ sql }) {
  if (!/^\s*select/i.test(sql)) {
    throw new Error('Only SELECT queries are allowed');
  }
  const [rows] = await getBigQuery().query({ query: sql, useLegacySql: false, maxResults: 200 });
  return rows;
}
