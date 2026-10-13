
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
  rename,
} from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { env } from '../../config/env.js';
import { requireAuth } from './auth.middleware.js';

const router = Router();

const usersFile = fileURLToPath(
  new URL('../../../../data/users/users.json', import.meta.url),
);

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username may contain English letters, numbers and underscores',
    ),
  displayName: z.string().trim().min(2).max(50),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  username: z.string().trim().min(3).max(24),
  password: z.string().min(1).max(128),
});

async function readUsers() {
  try {
    const content = await readFile(usersFile, 'utf8');
    const users = JSON.parse(content);

    if (!Array.isArray(users)) {
      throw new Error('Invalid users database format');
    }

    return users;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function writeUsers(users) {
  await mkdir(path.dirname(usersFile), { recursive: true });

  const temporaryFile = `${usersFile}.${process.pid}.tmp`;

  await writeFile(
    temporaryFile,
    JSON.stringify(users, null, 2),
    'utf8',
  );

  await rename(temporaryFile, usersFile);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

function createToken(user) {
  return jwt.sign(
    {
      username: user.username,
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: user.id,
      expiresIn: '1h',
      issuer: 'haychat',
    },
  );
}

router.post('/register', async (req, res) => {
  const validation = registerSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: 'Invalid registration data',
      details: validation.error.flatten().fieldErrors,
    });
  }

  const { username, displayName, password } = validation.data;

  try {
    const users = await readUsers();

    const existingUser = users.find(
      (user) =>
        user.username.toLowerCase() === username.toLowerCase(),
    );

    if (existingUser) {
      return res.status(409).json({
        error: 'Username is already taken',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = {
      id: randomUUID(),
      username,
      displayName,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    await writeUsers([...users, user]);

    return res.status(201).json({
      message: 'Account created successfully',
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Registration error:', error);

    return res.status(500).json({
      error: 'Could not create account',
    });
  }
});

router.post('/login', async (req, res) => {
  const validation = loginSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: 'Invalid login data',
    });
  }

  const { username, password } = validation.data;

  try {
    const users = await readUsers();

    const user = users.find(
      (item) =>
        item.username.toLowerCase() === username.toLowerCase(),
    );

    if (
      !user ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      return res.status(401).json({
        error: 'Incorrect username or password',
      });
    }

    return res.json({
      message: 'Login successful',
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      error: 'Could not log in',
    });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const users = await readUsers();

    const user = users.find(
      (item) => item.id === req.auth.userId,
    );

    if (!user) {
      return res.status(401).json({
        error: 'Account not found',
      });
    }

    return res.json({
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Account lookup error:', error);

    return res.status(500).json({
      error: 'Could not load account',
    });
  }
});

export default router;
