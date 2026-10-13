
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const chatsFile = fileURLToPath(
  new URL('../../../data/chats/chats.json', import.meta.url),
);

let ioInstance = null;

async function readChats() {
  try {
    const content = await readFile(chatsFile, 'utf8');
    const chats = JSON.parse(content);
    return Array.isArray(chats) ? chats : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function getIO() {
  return ioInstance;
}

export function initializeSocketServer(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: env.CORS_ORIGINS,
      methods: ['GET', 'POST'],
    },
  });

  ioInstance.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (typeof token !== 'string' || !token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        issuer: 'haychat',
      });

      if (
        typeof payload !== 'object' ||
        typeof payload.sub !== 'string' ||
        typeof payload.username !== 'string'
      ) {
        return next(new Error('Invalid access token'));
      }

      socket.data.userId = payload.sub;
      socket.data.username = payload.username;

      next();
    } catch {
      next(new Error('Invalid or expired access token'));
    }
  });

  ioInstance.on('connection', (socket) => {
    const userId = socket.data.userId;

    socket.on('chat:join', async (chatId, acknowledge) => {
      const reply =
        typeof acknowledge === 'function' ? acknowledge : () => {};

      if (
        typeof chatId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(chatId)
      ) {
        return reply({ ok: false, error: 'Invalid chat ID' });
      }

      try {
        const chats = await readChats();
        const chat = chats.find(
          (item) => String(item.id) === chatId,
        );

        if (!chat) {
          return reply({ ok: false, error: 'Chat not found' });
        }

        if (
          !Array.isArray(chat.participants) ||
          !chat.participants.includes(userId)
        ) {
          return reply({ ok: false, error: 'Access denied' });
        }

        await socket.join(`chat:${chatId}`);
        reply({ ok: true });
      } catch (error) {
        console.error('Socket chat join error:', error);
        reply({ ok: false, error: 'Could not join chat' });
      }
    });

    socket.on('chat:leave', async (chatId) => {
      if (
        typeof chatId === 'string' &&
        /^[a-zA-Z0-9_-]{1,64}$/.test(chatId)
      ) {
        await socket.leave(`chat:${chatId}`);
      }
    });
  });

  return ioInstance;
}
