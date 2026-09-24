import multer from 'multer';
import { logger } from '../config/logger.js';

// Every route that accepts uploads (knowledge, incidents, chat attachments,
// document gateway) shares this multer config shape — a MulterError (file
// too large, too many files, wrong field name) is a client mistake, not a
// server fault, but multer's own Error subclass doesn't set `.status`, so
// without this check it fell through to a generic 500 with a confusing
// "Internal server error"-flavored log for what's really routine input
// validation.
function statusFor(err) {
  if (err.status) return err.status;
  if (err instanceof multer.MulterError) return 400;
  return 500;
}

export function errorHandler(err, req, res, _next) {
  const status = statusFor(err);
  if (status >= 500) {
    logger.error(err.message, { stack: err.stack, path: req.path });
  } else {
    logger.warn(err.message, { path: req.path, code: err.code });
  }
  res.status(status).json({ error: err.message ?? 'Internal server error' });
}
