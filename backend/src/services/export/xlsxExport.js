import ExcelJS from 'exceljs';

// "Quality" columns (an LLM-as-judge score from a second model call) and
// cost (USD) were dropped along with the judge/Anthropic-pricing features
// when this app moved to a local Ollama model — this report is now
// usage/latency only.
export async function buildUsageReportXlsx(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Użycie');

  sheet.columns = [
    { header: 'Model', key: 'model', width: 28 },
    { header: 'Komenda', key: 'command_used', width: 22 },
    { header: 'Zapytania', key: 'requests', width: 12 },
    { header: 'Tokeny wej.', key: 'input_tokens', width: 14 },
    { header: 'Tokeny wyj.', key: 'output_tokens', width: 14 },
    { header: 'Śr. czas (ms)', key: 'avg_latency_ms', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));

  return workbook.xlsx.writeBuffer();
}
