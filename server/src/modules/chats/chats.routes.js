import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';

const router = Router();
const currentDir = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.resolve(currentDir, '../../../../data');
const chatsFile = path.join(dataDir, 'chats', 'chats.json');
const usersFile = path.join(dataDir, 'users', 'users.json');


const directChatSchema = z.object({
  userId: z.string().uuid(),
});

async function readJson(file, fallback = []) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeChats(chats) {
  await mkdir(path.dirname(chatsFile), { recursive: true });

  const tempFile = `${chatsFile}.${process.pid}.tmp`;
  await writeFile(tempFile, JSON.stringify(chats, null, 2), 'utf8');
  await rename(tempFile, chatsFile);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}

// Получить список личных чатов текущего пользователя.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [chats, users] = await Promise.all([
      readJson(chatsFile),
      readJson(usersFile),
    ]);

    const result = chats
      .filter((chat) => chat.participants.includes(req.auth.userId))
      .map((chat) => {
        const otherId = chat.participants.find(
          (id) => id !== req.auth.userId
        );

        const otherUser = users.find((user) => user.id === otherId);

        return {
          id: chat.id,
          type: chat.type,
          createdAt: chat.createdAt,
          user: otherUser ? publicUser(otherUser) : null,
        };
      })
      .filter((chat) => chat.user !== null);

    res.json({ chats: result });
  } catch (error) {
    next(error);
  }
});

// Создать личный чат или вернуть уже существующий.
router.post('/direct', requireAuth, async (req, res, next) => {
  try {
    const parsed = directChatSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid user ID',
      });
    }

    const currentUserId = req.auth.userId;
    const targetUserId = parsed.data.userId;

    if (currentUserId === targetUserId) {
      return res.status(400).json({
        error: 'You cannot create a chat with yourself',
      });
    }

    const [users, chats] = await Promise.all([
      readJson(usersFile),
      readJson(chatsFile),
    ]);

    const targetUser = users.find((user) => user.id === targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const participants = [currentUserId, targetUserId].sort();

    const existingChat = chats.find(
      (chat) =>
        chat.type === 'direct' &&
        chat.participants.length === 2 &&
        chat.participants.every((id) => participants.includes(id))
    );

    if (existingChat) {
      return res.json({
        chat: {
          id: existingChat.id,
          type: existingChat.type,
          createdAt: existingChat.createdAt,
          user: publicUser(targetUser),
        },
      });
    }

    const chat = {
      id: randomUUID(),
      type: 'direct',
      participants,
      createdAt: new Date().toISOString(),
    };

    chats.push(chat);
    await writeChats(chats);

    return res.status(201).json({
      chat: {
        id: chat.id,
        type: chat.type,
        createdAt: chat.createdAt,
        user: publicUser(targetUser),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;