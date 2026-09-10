import ExcelJS from 'exceljs';

export async function buildCostQualityReportXlsx(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Koszty i jakość');

  sheet.columns = [
    { header: 'Model', key: 'model', width: 28 },
    { header: 'Komenda', key: 'command_used', width: 22 },
    { header: 'Zapytania', key: 'requests', width: 12 },
    { header: 'Tokeny wej.', key: 'input_tokens', width: 14 },
    { header: 'Tokeny wyj.', key: 'output_tokens', width: 14 },
    { header: 'Koszt (USD)', key: 'cost_usd', width: 14 },
    { header: 'Śr. czas (ms)', key: 'avg_latency_ms', width: 14 },
    { header: 'Śr. ocena jakości (1-5)', key: 'avg_quality_score', width: 20 },
    { header: 'Ocenione wiadomości', key: 'scored_messages', width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));

  return workbook.xlsx.writeBuffer();
}
