import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { MAX_FILE_SIZE_BYTES, isImageAttachment } from '../services/attachments/attachmentStore.js';
import { SUPPORTED_KNOWLEDGE_MIME_TYPES } from '../services/knowledge/textExtraction.js';
import { checkDocument } from '../services/gateway/documentGateway.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 } });

export const documentGatewayRouter = Router();
// Any authenticated specialist, not just managers/admins — this is a safety
// tool everyone should be able to reach for before pasting a document
// anywhere, not a privileged admin action.
documentGatewayRouter.use(requireAuth);

documentGatewayRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'file required' });
    if (!isImageAttachment(file.mimetype) && !SUPPORTED_KNOWLEDGE_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: `Unsupported file type: ${file.mimetype}` });
    }

    const result = await checkDocument({
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
