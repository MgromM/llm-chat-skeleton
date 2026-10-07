import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { MAX_FILE_SIZE_BYTES } from '../services/attachments/attachmentStore.js';
import { SUPPORTED_KNOWLEDGE_MIME_TYPES } from '../services/knowledge/textExtraction.js';
import { ingestCanteenDocument, ingestCanteenOcrText } from '../services/canteen/canteenIngestion.js';
import { applyPendingChange } from '../services/canteen/catalogDiff.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 } });

const CANTEEN_OCR_WEBHOOK_TOKEN = process.env.CANTEEN_OCR_WEBHOOK_TOKEN || '';

/**
 * Machine-to-machine auth for the external OCR webhook — a static shared
 * secret, not a user JWT, since the caller is a service (the external OCR
 * pipeline that reads canteen catalog photos/scans), not a logged-in
 * employee. Fails closed: an unconfigured token refuses every call rather
 * than silently accepting an unauthenticated one.
 */
function requireOcrWebhookToken(req, res, next) {
  const provided = req.headers['x-canteen-ocr-token'];
  if (!CANTEEN_OCR_WEBHOOK_TOKEN || provided !== CANTEEN_OCR_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Invalid or missing OCR webhook token' });
  }
  next();
}

export const canteenRouter = Router();

// Registered BEFORE canteenRouter.use(requireAuth) below, so this one route
// is reachable without a user JWT — see requireOcrWebhookToken above. Body
// parsing (express.json()) is already applied globally in server.js.
canteenRouter.post('/facilities/:id/ocr-import', requireOcrWebhookToken, async (req, res, next) => {
  try {
    const { text, confidence, sourceFilename } = req.body ?? {};
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text (string) required' });

    const result = await ingestCanteenOcrText({
      facilityId: Number(req.params.id),
      text,
      confidence: typeof confidence === 'number' ? confidence : null,
      filename: typeof sourceFilename === 'string' && sourceFilename ? sourceFilename : 'ocr-webhook',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Everything below requires a logged-in employee. Viewing facilities/
// products/changes is open to any role (same reasoning as review_items) —
// only the mutating routes (create facility, upload a document, apply a
// held-back change) are manager/admin, mirroring knowledge.routes.js.
canteenRouter.use(requireAuth);

canteenRouter.get('/facilities', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, external_code, city, address, active, created_at FROM canteen_facilities ORDER BY name`,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

canteenRouter.post('/facilities', requireRole('manager', 'admin'), async (req, res, next) => {
  try {
    const { name, externalCode, city, address } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });

    const { rows } = await query(
      `INSERT INTO canteen_facilities (name, external_code, city, address)
       VALUES ($1,$2,$3,$4) RETURNING id, name, external_code, city, address, active, created_at`,
      [name.trim(), externalCode?.trim() || null, city?.trim() || null, address?.trim() || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

canteenRouter.get('/facilities/:id/products', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, normalized_name, display_name, price, unit, category, updated_at
       FROM canteen_products WHERE facility_id = $1 AND active = true ORDER BY display_name`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

canteenRouter.get('/facilities/:id/changes', async (req, res, next) => {
  try {
    const conditions = ['facility_id = $1'];
    const params = [req.params.id];
    if (req.query.applied === 'false') conditions.push('applied = false');

    const { rows } = await query(
      `SELECT id, extraction_run_id, normalized_name, display_name, change_type, old_price, new_price, unit,
              flagged_implausible, flag_reason, applied, created_at
       FROM canteen_catalog_changes
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT 100`,
      params,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

canteenRouter.post(
  '/facilities/:id/documents',
  requireRole('manager', 'admin'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'file required' });
      if (!SUPPORTED_KNOWLEDGE_MIME_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: `Unsupported file type: ${file.mimetype}` });
      }

      const result = await ingestCanteenDocument({
        facilityId: Number(req.params.id),
        buffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
        submittedBy: req.user.sub,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

canteenRouter.post('/changes/:id/apply', requireRole('manager', 'admin'), async (req, res, next) => {
  try {
    const applied = await applyPendingChange(req.params.id);
    if (!applied) return res.status(404).json({ error: 'Change not found or already applied' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
