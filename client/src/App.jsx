import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { translations } from './app/translations.js';
import { getMessages, saveMessage } from './services/messages.js';
import { getCurrentUser, getToken, logout } from './services/auth.js';
import {
  searchUsers,
  getDirectChats,
  createDirectChat,
} from './services/chats.js';
import AuthScreen from './components/AuthScreen.jsx';

function toChatItem(chat) {
  const person = chat.user || {};
  const name = person.displayName || person.username || 'Пользователь';

  return {
    id: String(chat.id),
    name,
    username: person.username || '',
    message: chat.lastMessage || 'Начните переписку',
    lastMessage: chat.lastMessage || '',
    time: '',
    avatar: name.charAt(0).toUpperCase(),
    color: 'blue',
    unread: 0,
    online: false,
    direct: true,
    userId: person.id || null,
  };
}

function formatTime(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSenderName(item, currentUser, selectedChat) {
  if (
    item.senderId &&
    currentUser?.id &&
    String(item.senderId) === String(currentUser.id)
  ) {
    return 'Вы';
  }

  if (typeof item.own === 'boolean' && item.own) {
    return 'Вы';
  }

  return selectedChat?.name || 'Собеседник';
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [language, setLanguage] = useState('hy');
  const [directChats, setDirectChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatsError, setChatsError] = useState('');

  const [selectedId, setSelectedId] = useState(null);

  // Ref нужен, чтобы обработчик Socket.IO видел актуальный выбранный чат.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const [unreadCounts, setUnreadCounts] = useState({});

  // Ссылки для управления прокруткой сообщений.
  const messageAreaRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  const [search, setSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [openingChatId, setOpeningChatId] = useState(null);

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState({});

  const [serverStatus, setServerStatus] = useState('connecting');
  const [serverError, setServerError] = useState('');

  const [socketStatus, setSocketStatus] = useState('connecting');
  const socketRef = useRef(null);

  const [sending, setSending] = useState(false);

  const t = translations[language];
  const query = search.trim();
  const searchingUsers = query.length >= 2;

  // Добавляем к каждому чату его текущий счётчик непрочитанных сообщений.
  const allChats = directChats.map((chat) => ({
    ...toChatItem(chat),
    unread: unreadCounts[String(chat.id)] || 0,
  }));

  const selectedChat = allChats.find(
    (chat) => String(chat.id) === String(selectedId),
  );

  // При открытии чата сразу переходим к последним сообщениям.
  useEffect(() => {
    shouldAutoScrollRef.current = true;

    const element = messageAreaRef.current;

    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [selectedId]);

  // Новые сообщения прокручивают чат вниз, только если пользователь
  // уже находился рядом с концом переписки.
  useEffect(() => {
    const element = messageAreaRef.current;

    if (!element || !shouldAutoScrollRef.current) return;

    element.scrollTo({
      top: element.scrollHeight,
      behavior: 'smooth',
    });
  }, [
    selectedId,
    messages[String(selectedId)]?.length,
    serverStatus,
  ]);

  // Восстановление авторизации.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const currentUser = await getCurrentUser();

        if (!cancelled) {
          setUser(currentUser);
        }
      } catch (error) {
        console.error('Session restore error:', error);

        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // Загрузка настоящих личных чатов.
  const loadDirectChats = useCallback(async () => {
    if (!user) return;

    setChatsLoading(true);
    setChatsError('');

    try {
      const result = await getDirectChats();

      const normalized = result.map((chat) => ({
        ...chat,
        id: String(chat.id),
      }));

      setDirectChats(normalized);

      setSelectedId((currentId) => {
        const stillExists = normalized.some(
          (chat) => String(chat.id) === String(currentId),
        );

        if (stillExists) return currentId;

        return normalized.length > 0 ? normalized[0].id : null;
      });
    } catch (error) {
      console.error('Could not load personal chats:', error);
      setChatsError(error.message || 'Не удалось загрузить чаты');
    } finally {
      setChatsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setDirectChats([]);
      setSelectedId(null);
      setMessages({});
      return;
    }

    loadDirectChats();
  }, [user, loadDirectChats]);

  // Поиск зарегистрированных пользователей.
  useEffect(() => {
    if (!user || !searchingUsers) {
      setUserResults([]);
      setSearchLoading(false);
      setSearchError('');
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError('');

      try {
        const results = await searchUsers(query);

        if (!cancelled) {
          setUserResults(results);
        }
      } catch (error) {
        if (!cancelled) {
          setUserResults([]);
          setSearchError(
            error.message || 'Не удалось найти пользователей',
          );
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user, query, searchingUsers]);

  // Загрузка сообщений для выбранного чата.
  const loadChatMessages = useCallback(async (chatId) => {
    if (!chatId) return;

    setServerStatus('connecting');
    setServerError('');

    try {
      const serverMessages = await getMessages(chatId);

      setMessages((previous) => ({
        ...previous,
        [String(chatId)]: serverMessages,
      }));

      setServerStatus('connected');
    } catch (error) {
      console.error('Message loading error:', error);
      setServerStatus('error');
      setServerError(error.message || 'Не удалось загрузить сообщения');
    }
  }, []);

  useEffect(() => {
    if (user && selectedChat?.direct) {
      loadChatMessages(selectedChat.id);
    } else {
      setServerStatus('connected');
      setServerError('');
    }
  }, [user, selectedChat?.id, selectedChat?.direct, loadChatMessages]);

  // Подключение к Socket.IO.
  useEffect(() => {
    if (!user) {
      setSocketStatus('disconnected');
      socketRef.current = null;
      return undefined;
    }

    const token = getToken();

    if (!token) {
      setSocketStatus('error');
      return undefined;
    }

    const socket = io('http://127.0.0.1:4000', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;
    setSocketStatus('connecting');

    socket.on('connect', () => {
      setSocketStatus('connected');
    });

    socket.on('disconnect', () => {
      setSocketStatus('disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error.message);
      setSocketStatus('error');
    });

    // Получение новых сообщений в реальном времени.
    socket.on('message:new', (payload) => {
      if (!payload || payload.chatId == null || !payload.message) {
        return;
      }

      const chatId = String(payload.chatId);
      const incomingMessage = payload.message;

      const normalizedMessage = {
        ...incomingMessage,
        own: incomingMessage.senderId != null
          ? String(incomingMessage.senderId) === String(user.id)
          : Boolean(incomingMessage.own),
      };

      const isOwnMessage = normalizedMessage.senderId != null
        ? String(normalizedMessage.senderId) === String(user.id)
        : Boolean(normalizedMessage.own);

      // Увеличиваем счётчик только для входящих сообщений в другом чате.
      if (
        !isOwnMessage &&
        String(selectedIdRef.current) !== chatId
      ) {
        setUnreadCounts((previous) => ({
          ...previous,
          [chatId]: (previous[chatId] || 0) + 1,
        }));
      }

      setMessages((previous) => {
        const currentMessages = previous[chatId] || [];

        const alreadyExists = currentMessages.some(
          (item) => String(item.id) === String(normalizedMessage.id),
        );

        if (alreadyExists) return previous;

        return {
          ...previous,
          [chatId]: [...currentMessages, normalizedMessage],
        };
      });

      setDirectChats((previous) =>
        previous.map((chat) =>
          String(chat.id) === chatId
            ? {
                ...chat,
                lastMessage: normalizedMessage.text || chat.lastMessage,
              }
            : chat,
        ),
      );
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [user]);

  // Подписка на выбранный чат.
  useEffect(() => {
    const socket = socketRef.current;

    if (!socket || !selectedChat?.direct || !socket.connected) {
      return undefined;
    }

    const chatId = String(selectedChat.id);

    socket.emit('chat:join', chatId, (result) => {
      if (!result?.ok) {
        console.warn(
          'Could not join chat room:',
          result?.error || 'Unknown error',
        );
      }
    });

    return () => {
      if (socket.connected) {
        socket.emit('chat:leave', chatId);
      }
    };
  }, [selectedChat?.id, selectedChat?.direct, socketStatus]);

  // Фильтрация чатов.
  const filteredChats = allChats.filter((chat) =>
    `${chat.name} ${chat.username} ${chat.lastMessage}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  // Создание или открытие личного чата.
  async function handleStartChat(person) {
    if (openingChatId !== null) return;

    setOpeningChatId(person.id);
    setSearchError('');

    try {
      const result = await createDirectChat(person.id);

      const normalized = {
        ...result,
        id: String(result.id),
      };

      setDirectChats((previous) => {
        const exists = previous.some(
          (chat) => String(chat.id) === normalized.id,
        );

        if (exists) {
          return previous.map((chat) =>
            String(chat.id) === normalized.id ? normalized : chat,
          );
        }

        return [normalized, ...previous];
      });

      setSelectedId(normalized.id);

      setUnreadCounts((previous) => ({
        ...previous,
        [normalized.id]: 0,
      }));

      setMessages((previous) => ({
        ...previous,
        [normalized.id]: previous[normalized.id] || [],
      }));

      setSearch('');
      setUserResults([]);
      setMessage('');
    } catch (error) {
      console.error('Could not create personal chat:', error);
      setSearchError(error.message || 'Не удалось открыть чат');
    } finally {
      setOpeningChatId(null);
    }
  }

  // Отправка сообщения на сервер.
  async function sendMessage(event) {
    event.preventDefault();

    const text = message.trim();

    if (!text || sending || !user || !selectedChat) return;

    const chatId = String(selectedChat.id);

    const newMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
    };

    setSending(true);
    setServerError('');

    try {
      const savedMessage = await saveMessage(chatId, newMessage);

      // Не добавляем сообщение повторно, если оно уже пришло через сокет.
      setMessages((previous) => {
        const currentMessages = previous[chatId] || [];

        const alreadyExists = currentMessages.some(
          (item) => String(item.id) === String(savedMessage.id),
        );

        if (alreadyExists) return previous;

        return {
          ...previous,
          [chatId]: [...currentMessages, savedMessage],
        };
      });

      setMessage('');
      setServerStatus('connected');

      setDirectChats((previous) =>
        previous.map((chat) =>
          String(chat.id) === chatId
            ? { ...chat, lastMessage: text }
            : chat,
        ),
      );
    } catch (error) {
      console.error('Message saving error:', error);
      setServerStatus('error');
      setServerError(error.message || 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  }

  function handleLogout() {
    logout();

    setUser(null);
    setDirectChats([]);
    setSelectedId(null);
    setUserResults([]);
    setMessages({});
    setUnreadCounts({});
    setMessage('');
    setSearch('');
    setChatsError('');
    setServerError('');
    setServerStatus('connecting');
  }

  if (authLoading) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-brand-icon">հ</div>
          <h1 className="auth-title">HayChat</h1>
          <p className="auth-subtitle">Загрузка аккаунта...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={setUser} />;
  }

  return (
    <main className="messenger">
      <aside className="sidebar">
        <header className="brand">
          <div className="brand-icon">հ</div>

          <div className="brand-text">
            <h1>HayChat</h1>
            <p>{t.brandSubtitle}</p>
          </div>

          <div className="language-switcher" aria-label={t.language}>
            {[
              { code: 'hy', label: 'HY' },
              { code: 'ru', label: 'RU' },
              { code: 'en', label: 'EN' },
            ].map((item) => (
              <button
                key={item.code}
                type="button"
                className={language === item.code ? 'active' : ''}
                aria-pressed={language === item.code}
                onClick={() => setLanguage(item.code)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className="search-box">
          <span>⌕</span>

          <input
            aria-label={t.searchLabel}
            placeholder="Поиск чатов или пользователей..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="section-title">
          {searchingUsers ? 'Пользователи' : t.allChats}
        </div>

        <div className="chat-list">
          {searchingUsers ? (
            <>
              {searchLoading && (
                <p className="empty-search">Поиск пользователей...</p>
              )}

              {searchError && (
                <p className="empty-search" role="alert">
                  {searchError}
                </p>
              )}

              {!searchLoading &&
                !searchError &&
                userResults.length === 0 && (
                  <p className="empty-search">
                    Пользователи не найдены
                  </p>
                )}

              {userResults.map((person) => (
                <div className="chat-item user-result" key={person.id}>
                  <div className="avatar blue">
                    {(person.displayName || person.username || '?')
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div className="chat-info">
                    <div className="chat-heading">
                      <span className="chat-name">
                        {person.displayName || person.username}
                      </span>
                    </div>

                    <div className="chat-preview">
                      @{person.username}
                    </div>

                    <button
                      type="button"
                      className="start-chat-button"
                      disabled={openingChatId !== null}
                      onClick={() => handleStartChat(person)}
                    >
                      {openingChatId === person.id
                        ? 'Открываем...'
                        : 'Начать чат'}
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {chatsLoading && (
                <p className="empty-search">Загрузка чатов...</p>
              )}

              {chatsError && (
                <div className="empty-search" role="alert">
                  <p>{chatsError}</p>

                  <button type="button" onClick={loadDirectChats}>
                    Повторить
                  </button>
                </div>
              )}

              {!chatsLoading &&
                !chatsError &&
                filteredChats.map((chat) => {
                  const chatMessages = messages[chat.id] || [];
                  const lastMessage = chatMessages.at(-1);

                  return (
                    <button
                      type="button"
                      className={`chat-item ${
                        String(selectedId) === String(chat.id)
                          ? 'selected'
                          : ''
                      }`}
                      key={chat.id}
                      onClick={() => {
                        setSelectedId(chat.id);

                        setUnreadCounts((previous) => ({
                          ...previous,
                          [String(chat.id)]: 0,
                        }));
                      }}
                    >
                      <div className={`avatar ${chat.color}`}>
                        {chat.avatar}
                      </div>

                      <div className="chat-info">
                        <div className="chat-heading">
                          <span className="chat-name">
                            {chat.name}
                          </span>

                          <span className="chat-time">
                            {lastMessage?.createdAt
                              ? formatTime(lastMessage.createdAt)
                              : ''}
                          </span>

                          {chat.unread > 0 && (
                            <span
                              className="unread"
                              aria-label={`${chat.unread} непрочитанных сообщений`}
                            >
                              {chat.unread > 99 ? '99+' : chat.unread}
                            </span>
                          )}
                        </div>

                        <div className="chat-preview">
                          <span>
                            {lastMessage?.text ||
                              chat.lastMessage ||
                              'Нет сообщений'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}

              {!chatsLoading &&
                !chatsError &&
                filteredChats.length === 0 && (
                  <p className="empty-search">
                    {query
                      ? 'Чаты не найдены. Введи не менее двух символов, чтобы найти пользователей.'
                      : 'У тебя пока нет чатов. Найди пользователя через поиск и начни переписку.'}
                  </p>
                )}
            </>
          )}
        </div>

        <footer className="sidebar-footer">
          <div className="profile-avatar">
            {(user.displayName || user.username || 'H')
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="profile-info">
            <strong>{user.displayName || user.username}</strong>
            <span>@{user.username}</span>
          </div>

          <button
            type="button"
            className="settings-icon"
            title="Выйти из аккаунта"
            aria-label="Выйти из аккаунта"
            onClick={handleLogout}
          >
            ↪
          </button>
        </footer>
      </aside>

      <section className="conversation">
        {selectedChat ? (
          <>
            <header className="conversation-header">
              <div className={`avatar ${selectedChat.color}`}>
                {selectedChat.avatar}
              </div>

              <div className="conversation-person">
                <strong>{selectedChat.name}</strong>

                <span>
                  {selectedChat.username
                    ? `@${selectedChat.username}`
                    : 'HayChat'}
                </span>
              </div>

              <button
                type="button"
                className="header-action"
                aria-label={t.searchLabel}
                title={t.searchLabel}
                onClick={() => {
                  setSearch('');
                  document.querySelector('.search-box input')?.focus();
                }}
              >
                ⌕
              </button>

              <button
                type="button"
                className="header-action"
                aria-label={t.more}
                title={t.more}
              >
                ⋮
              </button>
            </header>

            <div
              className="message-area"
              ref={messageAreaRef}
              onScroll={(event) => {
                const element = event.currentTarget;

                shouldAutoScrollRef.current =
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                  100;
              }}
            >
              <div className="date-divider">
                <span>{t.today}</span>
              </div>

              {serverStatus === 'connecting' && (
                <p className="server-notice">
                  {t.loadingMessages || 'Загрузка сообщений...'}
                </p>
              )}

              {serverStatus === 'error' && (
                <div className="server-error" role="alert">
                  <p>
                    {t.serverConnectionError ||
                      'Ошибка подключения к серверу'}
                  </p>

                  {serverError && <small>{serverError}</small>}

                  <button
                    type="button"
                    onClick={() => loadChatMessages(selectedChat.id)}
                  >
                    {t.retry || 'Повторить'}
                  </button>
                </div>
              )}

              {serverStatus !== 'error' &&
                serverStatus !== 'connecting' &&
                (messages[selectedChat.id] || []).length === 0 && (
                  <p className="empty-search">
                    Сообщений пока нет. Напиши первым!
                  </p>
                )}

              {(messages[selectedChat.id] || []).map((item) => {
                const isOwn =
                  typeof item.own === 'boolean'
                    ? item.own
                    : Boolean(
                        item.senderId &&
                          user.id &&
                          String(item.senderId) === String(user.id),
                      );

                const senderName = getSenderName(
                  item,
                  user,
                  selectedChat,
                );

                return (
                  <div
                    key={item.id}
                    className={`message-row ${isOwn ? 'own' : ''}`}
                  >
                    <div className="message-bubble">
                      <span className="message-sender">
                        {senderName}
                      </span>

                      <p>{item.text}</p>

                      <span className="message-time">
                        {formatTime(item.createdAt) ||
                          (isOwn ? `${t.now} ✓` : '')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <button
                type="button"
                className="attachment-button"
                aria-label={t.attach}
                title={t.attach}
              >
                +
              </button>

              <input
                aria-label={t.messagePlaceholder}
                placeholder={t.messagePlaceholder}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />

              <button
                type="submit"
                className="send-button"
                aria-label={t.send}
                title={t.send}
                disabled={!message.trim() || sending}
              >
                {sending ? '…' : '➤'}
              </button>
            </form>
          </>
        ) : (
          <div className="empty-conversation">
            <div className="empty-conversation-icon">հ</div>

            <h2>Добро пожаловать в HayChat</h2>

            <p>
              {chatsLoading
                ? 'Загружаем твои чаты...'
                : 'Выбери существующий чат или найди пользователя через поиск, чтобы начать переписку.'}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}