import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from '../auth/auth.middleware.js';

const router = Router();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const usersFile = path.resolve(currentDir, '../../../../data/users/users.json');

async function readUsers() {
  try {
    return JSON.parse(await readFile(usersFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const query = String(req.query.q ?? '').trim().toLowerCase();

    if (query.length < 2) {
      return res.json({ users: [] });
    }

    const users = await readUsers();

    const results = users
      .filter((user) => user.id !== req.auth.userId)
      .filter((user) =>
        user.username.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query)
      )
      .slice(0, 20)
      .map(({ id, username, displayName }) => ({
        id,
        username,
        displayName,
      }));

    res.json({ users: results });
  } catch (error) {
    next(error);
  }
});

export default router;