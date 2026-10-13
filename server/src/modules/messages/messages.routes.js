
import { Router } from 'express';
import { z } from 'zod';
import {
  mkdir,
  readFile,
  writeFile,
  rename,
} from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { requireAuth } from '../auth/auth.middleware.js';
import { getIO } from '../../sockets/socket.js';

const router = Router();

const messagesDirectory = fileURLToPath(
  new URL('../../../../data/messages/', import.meta.url),
);

const chatsFile = fileURLToPath(
  new URL('../../../../data/chats/chats.json', import.meta.url),
);

const newMessageSchema = z.object({
  id: z.union([
    z.string().min(1).max(100),
    z.number().int(),
  ]),
  text: z.string().trim().min(1).max(5000),
});

const storedMessageSchema = z.object({
  id: z.union([
    z.string().min(1).max(100),
    z.number().int(),
  ]),
  text: z.string().trim().min(1).max(5000),
  senderId: z.string().optional(),
  own: z.boolean().optional(),
});

async function readJson(filePath, fallback = []) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function readMessages(chatId) {
  const filePath = path.join(
    messagesDirectory,
    `chat-${chatId}.json`,
  );

  const content = await readJson(filePath);
  return z.array(storedMessageSchema).parse(content);
}

async function saveMessages(chatId, messages) {
  await mkdir(messagesDirectory, { recursive: true });

  const filePath = path.join(
    messagesDirectory,
    `chat-${chatId}.json`,
  );

  const temporaryPath = `${filePath}.${process.pid}.tmp`;

  await writeFile(
    temporaryPath,
    JSON.stringify(messages, null, 2),
    'utf8',
  );

  await rename(temporaryPath, filePath);
}

async function getAuthorizedChat(chatId, userId) {
  const chats = await readJson(chatsFile);
  const chat = chats.find((item) => item.id === chatId);

  if (!chat) {
    return { error: 'Chat not found', status: 404 };
  }

  if (
    !Array.isArray(chat.participants) ||
    !chat.participants.includes(userId)
  ) {
    return { error: 'Access denied', status: 403 };
  }

  return { chat };
}

function presentMessage(message, userId) {
  return {
    ...message,
    own: message.senderId
      ? message.senderId === userId
      : Boolean(message.own),
  };
}

router.get('/:chatId/messages', requireAuth, async (req, res, next) => {
  const { chatId } = req.params;

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(chatId)) {
    return res.status(400).json({ error: 'Invalid chat ID' });
  }

  try {
    const access = await getAuthorizedChat(chatId, req.auth.userId);

    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const messages = await readMessages(chatId);

    return res.json({
      messages: messages.map((message) =>
        presentMessage(message, req.auth.userId),
      ),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:chatId/messages', requireAuth, async (req, res, next) => {
  const { chatId } = req.params;

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(chatId)) {
    return res.status(400).json({ error: 'Invalid chat ID' });
  }

  const result = newMessageSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: 'Invalid message',
      details: result.error.flatten().fieldErrors,
    });
  }

  try {
    const access = await getAuthorizedChat(chatId, req.auth.userId);

    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const messages = await readMessages(chatId);

    if (
      messages.some(
        (item) => String(item.id) === String(result.data.id),
      )
    ) {
      return res.status(409).json({
        error: 'Message already exists',
      });
    }

    const savedMessage = {
      ...result.data,
      senderId: req.auth.userId,
    };

    const updatedMessages = [...messages, savedMessage];

    await saveMessages(chatId, updatedMessages);

    // Рассылаем событие только после сохранения сообщения.
    getIO()?.to(`chat:${chatId}`).emit('message:new', {
      chatId,
      message: savedMessage,
    });

    return res.status(201).json({
      message: presentMessage(savedMessage, req.auth.userId),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
