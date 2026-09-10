import { logger } from '../config/logger.js';

export function errorHandler(err, req, res, _next) {
  logger.error(err.message, { stack: err.stack, path: req.path });
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
}
