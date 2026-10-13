
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export function requireAuth(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      error: 'Invalid access token',
    });
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
      return res.status(401).json({
        error: 'Invalid access token',
      });
    }

    req.auth = {
      userId: payload.sub,
      username: payload.username,
    };

    next();
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired access token',
    });
  }
}
