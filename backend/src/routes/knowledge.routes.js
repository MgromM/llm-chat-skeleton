import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { MAX_FILE_SIZE_BYTES, saveKnowledgeFile } from '../services/attachments/attachmentStore.js';
import { extractText, SUPPORTED_KNOWLEDGE_MIME_TYPES } from '../services/knowledge/textExtraction.js';
import { createDocument, indexDocument, listDocuments, deleteDocument } from '../services/knowledge/knowledgeStore.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 } });

export const knowledgeRouter = Router();
knowledgeRouter.use(requireAuth);

knowledgeRouter.get('/documents', async (req, res, next) => {
  try {
    res.json(await listDocuments());
  } catch (err) {
    next(err);
  }
});

knowledgeRouter.post('/documents', requireRole('manager', 'admin'), upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'file required' });
    if (!SUPPORTED_KNOWLEDGE_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: `Unsupported file type: ${file.mimetype}` });
    }

    const storagePath = await saveKnowledgeFile(file.buffer, file.originalname);
    const documentId = await createDocument({
      title: req.body.title?.trim() || file.originalname,
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath,
      uploadedBy: req.user.sub,
    });

    const text = await extractText(file.buffer, file.mimetype);
    const chunkCount = await indexDocument(documentId, text);

    res.status(201).json({ id: documentId, chunkCount });
  } catch (err) {
    next(err);
  }
});

knowledgeRouter.delete('/documents/:id', requireRole('manager', 'admin'), async (req, res, next) => {
  try {
    const deleted = await deleteDocument(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Document not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
