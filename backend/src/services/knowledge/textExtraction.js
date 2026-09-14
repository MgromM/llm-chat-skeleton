import * as pdfParseModule from 'pdf-parse';
import mammoth from 'mammoth';

const pdfParse = pdfParseModule.default ?? pdfParseModule;

const PLAIN_TEXT_MIME_TYPES = new Set(['text/plain', 'text/csv', 'text/markdown', 'application/json']);
const PDF_MIME_TYPE = 'application/pdf';
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const SUPPORTED_KNOWLEDGE_MIME_TYPES = new Set([...PLAIN_TEXT_MIME_TYPES, PDF_MIME_TYPE, DOCX_MIME_TYPE]);

/** Extracts plain text from an uploaded knowledge document, based on its mime type. */
export async function extractText(buffer, mimeType) {
  if (PLAIN_TEXT_MIME_TYPES.has(mimeType)) return buffer.toString('utf-8');
  if (mimeType === PDF_MIME_TYPE) return (await pdfParse(buffer)).text;
  if (mimeType === DOCX_MIME_TYPE) return (await mammoth.extractRawText({ buffer })).value;
  throw new Error(`Unsupported knowledge document mime type: ${mimeType}`);
}
