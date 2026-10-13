import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import messagesRouter from './modules/messages/messages.routes.js';
import { env } from './config/env.js';
import authRouter from './modules/auth/auth.routes.js';
import usersRouter from './modules/users/users.routes.js';
import chatsRouter from './modules/chats/chats.routes.js';

export const app = express();

app.disable('x-powered-by');

app.use(helmet());

app.use(cors({
  origin: env.CORS_ORIGINS,
}));

app.use(express.json({ limit: '20kb' }));


const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'development' ? 500 : 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
  },
});

app.use('/api', apiLimiter);


app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    app: 'HayChat',
  });
});

app.use('/api/chats', messagesRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/chats', chatsRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: 'Not found',
  });
});