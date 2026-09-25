/** Extracts plain text from a PDF buffer, truncated like the other inlined attachments. */
export async function extractPdfText(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.slice(0, 20_000);
  } finally {
    await parser.destroy?.();
  }
}

/** Extracts plain text from a .docx buffer via mammoth. */
export async function extractDocxText(buffer) {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ buffer });
  return result.value.slice(0, 20_000);
}

/** Renders a .xlsx workbook as tab-separated text, one block per sheet. */
export async function extractXlsxText(buffer) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = [];
  workbook.eachSheet((sheet) => {
    const rows = [];
    sheet.eachRow((row) => {
      rows.push(row.values.slice(1).map((v) => (v ?? '').toString()).join('\t'));
    });
    sheets.push(`## Arkusz: ${sheet.name}\n${rows.join('\n')}`);
  });
  return sheets.join('\n\n').slice(0, 20_000);
}

/**
 * Extracts slide text from a .pptx by reading each slide's XML directly out
 * of the zip (a full OOXML parser would be overkill just to pull `<a:t>`
 * runs) — `pptxgenjs`'s writer doesn't help us read files, so this goes
 * straight through `jszip`.
 */
export async function extractPptxText(buffer) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  const slides = [];
  for (const name of slideFiles) {
    const xml = await zip.files[name].async('text');
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    slides.push(`## Slajd ${slides.length + 1}\n${runs.join(' ')}`);
  }
  return slides.join('\n\n').slice(0, 20_000);
}
