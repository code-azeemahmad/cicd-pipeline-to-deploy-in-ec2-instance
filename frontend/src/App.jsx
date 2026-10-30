import { useEffect, useState } from 'react';

const starterPrompts = [
  'Explain how Docker Compose connects frontend and backend services.',
  'Give me a practical checklist for deploying a FastAPI application.',
  'Explain the difference between a Docker image and a container.',
];

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState('checking');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [error, setError] = useState('');

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
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="PromptPad home">
          <span className="brand-mark">P</span>
          <span>PromptPad</span>
        </a>
        <div className={`status status-${health}`}>
          <span className="status-dot" />
          API {health}
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">A tiny full-stack starter project</p>
        <h1>Think it. Prompt it.</h1>
        <p className="subtitle">
          A React interface connected to a FastAPI backend. Try it in demo mode,
          then connect an OpenAI-compatible model provider on the server.
        </p>
        <div className={`mode-note ${aiConfigured ? 'mode-live' : 'mode-demo'}`}>
          {aiConfigured
            ? 'AI provider configured on the backend'
            : 'Demo mode · no provider key configured'}
        </div>
      </section>

      <section className="workspace" aria-label="Prompt playground">
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
            <div className="spark">✳</div>
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
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="conversation" aria-live="polite">
            {messages.map((message, index) => (
              <article className={`message message-${message.role}`} key={`${message.role}-${index}`}>
                <div className="message-label">
                  {message.role === 'user' ? 'YOU' : `PROMPTPAD${message.mode === 'demo' ? ' · DEMO' : ''}`}
                </div>
                <p>{message.content}</p>
              </article>
            ))}
            {loading && <div className="thinking">PromptPad is thinking…</div>}
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
            <span>{prompt.length}/4000 characters</span>
            <button className="send-button" disabled={!prompt.trim() || loading} type="submit">
              {loading ? 'Sending…' : 'Send prompt'}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
      </section>

      <footer className="footer">
        Built with React, FastAPI, Docker Compose, and GitHub Actions.
      </footer>
    </main>
  );
}
