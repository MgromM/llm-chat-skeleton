import * as pdfParseModule from 'pdf-parse';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const pdfParse = pdfParseModule.default ?? pdfParseModule;

const PLAIN_TEXT_MIME_TYPES = new Set(['text/plain', 'text/csv', 'text/markdown', 'application/json']);
const PDF_MIME_TYPE = 'application/pdf';
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export const SUPPORTED_KNOWLEDGE_MIME_TYPES = new Set([
  ...PLAIN_TEXT_MIME_TYPES,
  PDF_MIME_TYPE,
  DOCX_MIME_TYPE,
  XLSX_MIME_TYPE,
  PPTX_MIME_TYPE,
]);

/** Renders a .xlsx workbook as tab-separated text, one block per sheet. */
async function extractXlsxText(buffer) {
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
  return sheets.join('\n\n');
}

/**
 * Extracts slide text from a .pptx by reading each slide's XML directly out
 * of the zip (a full OOXML parser would be overkill just to pull `<a:t>`
 * runs) — same approach as `chatCore/pipeline.js`'s private copy of this,
 * which predates this shared module and still has its own for the chat
 * attachment path; this one is the version reused by the knowledge base and
 * the document gateway.
 */
async function extractPptxText(buffer) {
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
  return slides.join('\n\n');
}

/** Extracts plain text from an uploaded knowledge document, based on its mime type. */
export async function extractText(buffer, mimeType) {
  if (PLAIN_TEXT_MIME_TYPES.has(mimeType)) return buffer.toString('utf-8');
  if (mimeType === PDF_MIME_TYPE) return (await pdfParse(buffer)).text;
  if (mimeType === DOCX_MIME_TYPE) return (await mammoth.extractRawText({ buffer })).value;
  if (mimeType === XLSX_MIME_TYPE) return extractXlsxText(buffer);
  if (mimeType === PPTX_MIME_TYPE) return extractPptxText(buffer);
  throw new Error(`Unsupported knowledge document mime type: ${mimeType}`);
}
