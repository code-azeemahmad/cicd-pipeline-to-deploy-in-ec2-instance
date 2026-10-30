import { useEffect, useState } from 'react';

const starterPrompts = [
  'Explain how Docker Compose connects frontend and backend services.',
  'Give me a practical checklist for deploying a FastAPI application.',
  'Explain the difference between a Docker image and a container.',
];

export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('promptpad-theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState('checking');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('promptpad-theme', theme);
    } catch {
      // ignore storage errors
    }
    document.body.dataset.theme = theme;
    document.body.style.backgroundColor = theme === 'dark' ? '#212121' : '#faf9f5';
  }, [theme]);

  function toggleTheme() {
    setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
  }

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error('Backend health check failed');
        const data = await response.json();
        if (!cancelled) {
          setHealth('online');
          setAiConfigured(Boolean(data.ai_configured));
        }
      } catch {
        if (!cancelled) setHealth('offline');
      }
    }

    checkHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendPrompt(event) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    setError('');
    setMessages((current) => [...current, { role: 'user', content: trimmed }]);
    setPrompt('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'The request could not be completed.');
      }
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: data.reply, mode: data.mode },
      ]);
    } catch (requestError) {
      setError(requestError.message || 'Unable to reach the backend.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`app-canvas theme-${theme}`}>
      <div className="page-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="PromptPad home">
            <span className="brand-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" />
              </svg>
            </span>
            <span className="brand-name">PromptPad</span>
          </a>

          <button
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            className="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            type="button"
          >
            {theme === 'dark' ? (
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="16"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="16"
              >
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
            <span className="theme-toggle-label">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </header>

        <section className="hero">
          <h1>Think it. Prompt it.</h1>
          <p className="subtitle">
            A React interface connected to a FastAPI backend. Try it in demo mode,
            then connect an OpenAI-compatible model provider on the server.
          </p>
        </section>

        <main className="workspace" aria-label="Prompt playground">
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">PLAYGROUND</p>
              <h2>New conversation</h2>
            </div>
            <button className="clear-button" onClick={() => setMessages([])} type="button">
              Clear
            </button>
          </div>

          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="spark" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" />
                </svg>
              </div>
              <h3>What are you working on?</h3>
              <p>Choose a starter prompt or write your own below.</p>
              <div className="suggestions">
                {starterPrompts.map((item) => (
                  <button
                    className="suggestion"
                    key={item}
                    onClick={() => setPrompt(item)}
                    type="button"
                  >
                    <span>{item}</span>
                    <span className="suggestion-arrow" aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="conversation" aria-live="polite">
              {messages.map((message, index) => (
                <article
                  className={`message message-${message.role}`}
                  key={`${message.role}-${index}`}
                >
                  <div className="message-header">
                    <span className="message-label">
                      {message.role === 'user' ? 'YOU' : 'PROMPTPAD'}
                    </span>
                    {message.role === 'assistant' && (
                      <span className={`message-badge ${message.mode === 'demo' ? 'badge-demo' : 'badge-live'}`}>
                        {message.mode === 'demo' ? 'DEMO' : 'LIVE'}
                      </span>
                    )}
                  </div>
                  <div className="message-body">
                    <p>{message.content}</p>
                  </div>
                </article>
              ))}
              {loading && (
                <div className="thinking">
                  <span className="thinking-dot" aria-hidden="true" />
                  <span>PromptPad is thinking…</span>
                </div>
              )}
            </div>
          )}

          {error && <p className="error-message" role="alert">{error}</p>}

          <form className="prompt-form" onSubmit={sendPrompt}>
            <label className="sr-only" htmlFor="prompt-input">Your prompt</label>
            <textarea
              id="prompt-input"
              maxLength={4000}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask something about your project…"
              rows={3}
              value={prompt}
            />
            <div className="form-footer">
              <span className="char-count">{prompt.length}/4000 characters</span>
              <button
                className="send-button"
                disabled={!prompt.trim() || loading}
                type="submit"
              >
                <span>{loading ? 'Sending…' : 'Send prompt'}</span>
                <span className="send-arrow" aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
        </main>

        <footer className="footer">
          <div className="footer-content">
            <span className="footer-mark" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" />
              </svg>
            </span>
            <span>Built with React, FastAPI, Docker Compose, and GitHub Actions.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
