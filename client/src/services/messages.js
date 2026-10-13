
import { getToken } from './auth.js';

const API_URL = 'http://127.0.0.1:4000/api/chats';

async function request(url, options = {}) {
  const token = getToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || `Ошибка запроса: HTTP ${response.status}`,
    );
  }

  return data;
}

export async function getMessages(chatId) {
  const data = await request(
    `${API_URL}/${encodeURIComponent(chatId)}/messages`,
  );

  return data.messages;
}

export async function saveMessage(chatId, message) {
  const data = await request(
    `${API_URL}/${encodeURIComponent(chatId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        id: message.id,
        text: message.text,
      }),
    },
  );

  return data.message;
}
