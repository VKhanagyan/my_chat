
const API_URL = 'http://127.0.0.1:4000/api/auth';
const TOKEN_KEY = 'haychat_access_token';

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const details = data.details
      ? Object.values(data.details).flat().join(' ')
      : '';

    throw new Error(
      [data.error || 'Request failed', details]
        .filter(Boolean)
        .join(': '),
    );
  }

  return data;
}

function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function register({
  username,
  displayName,
  password,
}) {
  const data = await request('/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      displayName,
      password,
    }),
  });

  saveToken(data.token);

  return data.user;
}

export async function login({ username, password }) {
  const data = await request('/login', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
    }),
  });

  saveToken(data.token);

  return data.user;
}

export async function getCurrentUser() {
  const token = getToken();

  if (!token) {
    return null;
  }

  try {
    const data = await request('/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return data.user;
  } catch (error) {
    if (
      error.message.includes('Invalid access token') ||
      error.message.includes('Authentication required') ||
      error.message.includes('Account not found')
    ) {
      logout();
      return null;
    }

    throw error;
  }
}
