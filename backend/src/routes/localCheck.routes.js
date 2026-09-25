import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import {
  isImageAttachment,
  isTextAttachment,
  isPdfAttachment,
  isDocxAttachment,
  isXlsxAttachment,
  isPptxAttachment,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_MESSAGE,
} from '../services/attachments/attachmentStore.js';
import { extractPdfText, extractDocxText, extractXlsxText, extractPptxText } from '../services/attachments/textExtraction.js';
import { extractTextFromImages } from '../services/security/ocrExtraction.js';
import { scanTextLocally, explainVerdict } from '../services/security/localSensitivityScan.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES_PER_MESSAGE },
});

const LEVEL_RANK = { zielona: 0, żółta: 1, czerwona: 2 };

export const localCheckRouter = Router();

localCheckRouter.use(requireAuth);

/**
 * Fully local "can I paste this into Claude?" check. Files are held only in
 * memory for the duration of this request (multer memoryStorage, no disk/DB
 * write anywhere in this handler) and the buffer/extracted text is discarded
 * once the response is sent — nothing about the file's content is persisted
 * or forwarded to any external API. OCR and text extraction run in-process
 * (tesseract.js / pdf-parse / mammoth / exceljs / jszip); classification is
 * pure regex/keyword scoring in localSensitivityScan.js — no LLM call.
 */
localCheckRouter.post('/scan', upload.array('files', MAX_FILES_PER_MESSAGE), async (req, res, next) => {
  try {
    const files = req.files ?? [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'Brak plików do sprawdzenia.' });
    }

    const results = [];
    for (const file of files) {
      let text = '';
      try {
        if (isImageAttachment(file.mimetype)) {
          text = await extractTextFromImages([{ buffer: file.buffer, filename: file.originalname }]);
        } else if (isPdfAttachment(file.mimetype)) {
          text = await extractPdfText(file.buffer);
        } else if (isDocxAttachment(file.mimetype)) {
          text = await extractDocxText(file.buffer);
        } else if (isXlsxAttachment(file.mimetype)) {
          text = await extractXlsxText(file.buffer);
        } else if (isPptxAttachment(file.mimetype)) {
          text = await extractPptxText(file.buffer);
        } else if (isTextAttachment(file.mimetype)) {
          text = file.buffer.toString('utf-8');
        } else {
          results.push({
            filename: file.originalname,
            level: 'żółta',
            rationale: 'Nieobsługiwany format pliku — nie udało się lokalnie odczytać treści, więc nie można potwierdzić braku danych wrażliwych. Sprawdź plik ręcznie przed wklejeniem do Claude.',
            hits: [],
          });
          continue;
        }
      } catch (err) {
        logger.error('Local file scan: extraction failed', { filename: file.originalname, error: err.message });
        results.push({
          filename: file.originalname,
          level: 'żółta',
          rationale: 'Nie udało się odczytać treści pliku do analizy. Sprawdź plik ręcznie przed wklejeniem do Claude.',
          hits: [],
        });
        continue;
      }

      const verdict = scanTextLocally(text ?? '');
      results.push({
        filename: file.originalname,
        level: verdict.level,
        rationale: explainVerdict(verdict),
        hits: verdict.hits,
      });
    }

    const overallLevel = results.reduce(
      (worst, r) => (LEVEL_RANK[r.level] > LEVEL_RANK[worst] ? r.level : worst),
      'zielona',
    );

    res.json({ overallLevel, results });
  } catch (err) {
    next(err);
  }
});
