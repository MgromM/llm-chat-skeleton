import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

import { authRouter } from './routes/auth.routes.js';
import { chatRouter } from './routes/chat.routes.js';
import { metricsRouter } from './routes/metrics.routes.js';
import { exportRouter } from './routes/export.routes.js';
import { knowledgeRouter } from './routes/knowledge.routes.js';
import { memoryRouter } from './routes/memory.routes.js';
import { artifactsRouter } from './routes/artifacts.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './config/logger.js';

const app = express();

app.set('trust proxy', 1);

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
    keyGenerator: (req) => {
      const header = req.headers.authorization;
      const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
      const payload = token ? jwt.decode(token) : null;
      return payload?.sub ? `user:${payload.sub}` : req.ip;
    },
  }),
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRouter);
app.use('/chat', chatRouter);
app.use('/metrics', metricsRouter);
app.use('/export', exportRouter);
app.use('/knowledge', knowledgeRouter);
app.use('/memory', memoryRouter);
app.use(artifactsRouter);

app.use(errorHandler);

const port = process.env.PORT ?? 8080;
app.listen(port, () => logger.info(`salesmore-llm backend listening on :${port}`));
