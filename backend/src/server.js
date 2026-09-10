import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { authRouter } from './routes/auth.routes.js';
import { chatRouter } from './routes/chat.routes.js';
import { metricsRouter } from './routes/metrics.routes.js';
import { exportRouter } from './routes/export.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './config/logger.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
  }),
);
app.use(express.json({ limit: '1mb' }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRouter);
app.use('/chat', chatRouter);
app.use('/metrics', metricsRouter);
app.use('/export', exportRouter);

app.use(errorHandler);

const port = process.env.PORT ?? 8080;
app.listen(port, () => logger.info(`salesmore-llm backend listening on :${port}`));
