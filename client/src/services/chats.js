
const API_URL = 'http://127.0.0.1:4000/api';
const TOKEN_KEY = 'haychat_access_token';

async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

export async function searchUsers(query) {
  const params = new URLSearchParams({ q: query.trim() });
  const data = await apiRequest(`/users/search?${params}`);
  return data.users;
}

export async function getDirectChats() {
  const data = await apiRequest('/chats');
  return data.chats;
}

export async function createDirectChat(userId) {
  const data = await apiRequest('/chats/direct', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });

  return data.chat;
}
