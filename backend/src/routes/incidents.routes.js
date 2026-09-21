import { Router } from 'express';
import multer from 'multer';
import { query } from '../config/db.js';
import { requireAuth, requireAuthViaHeaderOrQuery, requireRole } from '../middleware/auth.js';
import { MAX_FILE_SIZE_BYTES, isImageAttachment, saveAttachmentFile, readAttachmentFile } from '../services/attachments/attachmentStore.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 } });

export const incidentsRouter = Router();

const SEVERITIES = ['low', 'medium', 'high', 'critical'];

// Manual incident reports from any specialist ("błędy są ludzkie"), landing
// in the same review queue as the automated uncertain-leak detector
// (`GET /metrics/leak-alerts`) via the shared `source` column.
incidentsRouter.post('/', requireAuth, upload.single('screenshot'), async (req, res, next) => {
  try {
    const { description, severity, conversationId } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'description is required' });
    }
    if (!SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: `severity must be one of: ${SEVERITIES.join(', ')}` });
    }

    let screenshotPath = null;
    if (req.file) {
      if (!isImageAttachment(req.file.mimetype)) {
        return res.status(400).json({ error: 'screenshot must be an image' });
      }
      screenshotPath = await saveAttachmentFile(req.file.buffer, req.file.originalname);
    }

    const { rows } = await query(
      `INSERT INTO leak_alerts (source, severity, description, screenshot_path, reporter_id, conversation_id, user_id)
       VALUES ('manual', $1, $2, $3, $4, $5, $4)
       RETURNING id, created_at`,
      [severity, description.trim(), screenshotPath, req.user.sub, conversationId || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

incidentsRouter.get('/:id/screenshot', requireAuthViaHeaderOrQuery, requireRole('manager', 'admin'), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT screenshot_path FROM leak_alerts WHERE id = $1', [req.params.id]);
    if (rows.length === 0 || !rows[0].screenshot_path) return res.status(404).json({ error: 'Screenshot not found' });

    const buffer = await readAttachmentFile(rows[0].screenshot_path);
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
