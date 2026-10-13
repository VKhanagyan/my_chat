
import { useState } from 'react';
import { login, register } from '../services/auth.js';

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (loading) return;

    setLoading(true);

    try {
      let user;

      if (mode === 'register') {
        user = await register({
          username: username.trim(),
          displayName: displayName.trim(),
          password,
        });
      } else {
        user = await login({
          username: username.trim(),
          password,
        });
      }

      onAuthenticated(user);
    } catch (err) {
      setError(err.message || 'Не удалось выполнить запрос');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand-icon">հ</div>

        <h1 className="auth-title">HayChat</h1>
        <p className="auth-subtitle">
          Твой мессенджер. Твои люди.
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            Вход
          </button>

          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            Регистрация
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label>
              Отображаемое имя
              <input
                type="text"
                placeholder="Например, Арман"
                value={displayName}
                onChange={(event) =>
                  setDisplayName(event.target.value)
                }
                minLength={2}
                maxLength={50}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label>
            Имя пользователя
            <input
              type="text"
              placeholder="username"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value)
              }
              minLength={3}
              maxLength={24}
              pattern="[a-zA-Z0-9_]+"
              title="Используй английские буквы, цифры и знак _"
              autoComplete="username"
              required
            />
          </label>

          <label>
            Пароль
            <input
              type="password"
              placeholder="Не менее 8 символов"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              minLength={mode === 'register' ? 8 : 1}
              maxLength={128}
              autoComplete={
                mode === 'register'
                  ? 'new-password'
                  : 'current-password'
              }
              required
            />
          </label>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Подождите...'
              : mode === 'login'
                ? 'Войти в HayChat'
                : 'Создать аккаунт'}
          </button>
        </form>

        <p className="auth-footer">
          {mode === 'login'
            ? 'Ещё нет аккаунта? Создай его во вкладке «Регистрация».'
            : 'Уже есть аккаунт? Перейди во вкладку «Вход».'}
        </p>
      </section>
    </main>
  );
}
