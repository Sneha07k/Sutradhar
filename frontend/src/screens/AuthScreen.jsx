import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '../lib/context';
import { storeUser } from '../lib/context';
import LangToggle from '../components/LangToggle';

// Minimal client-side auth: hash the password with a simple djb2 for storage
function hashPw(pw) {
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h) ^ pw.charCodeAt(i);
  return (h >>> 0).toString(16);
}

const STORE_KEY = 'pc_accounts';
function getAccounts() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}
function saveAccounts(obj) { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); }

export default function AuthScreen({ onAuth }) {
  const { t } = useLang();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [id, setId]     = useState('');
  const [pw, setPw]     = useState('');
  const [pw2, setPw2]   = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const accounts = getAccounts();
    const hashed   = hashPw(pw);

    setTimeout(() => {
      setLoading(false);
      if (mode === 'register') {
        if (pw !== pw2) { setError('Passwords do not match.'); return; }
        if (pw.length < 6) { setError('Password must be at least 6 characters.'); return; }
        if (!id.trim()) { setError('Investigator ID is required.'); return; }
        if (accounts[id.trim()]) { setError('Investigator ID already exists.'); return; }
        const newAccounts = { ...accounts, [id.trim()]: hashed };
        saveAccounts(newAccounts);
        const user = { id: id.trim(), firstLogin: true };
        storeUser(user);
        onAuth(user);
      } else {
        const stored = accounts[id.trim()];
        if (!stored || stored !== hashed) { setError(t.authError); return; }
        const user = { id: id.trim(), firstLogin: false };
        storeUser(user);
        onAuth(user);
      }
    }, 400);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      {/* Lang toggle top-right */}
      <div style={{ position: 'fixed', top: 16, right: 20 }}>
        <LangToggle />
      </div>

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ textAlign: 'center', marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <img
          src="/logo.png"
          alt="Pragya Chakshu Logo"
          fetchpriority="high"
          style={{ height: 120, width: 'auto', objectFit: 'contain', marginBottom: 8, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.12))' }}
        />
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
          {t.tagline}
        </div>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="card"
        style={{ width: '100%', maxWidth: 380, padding: '32px' }}
      >
        {/* Mode toggle */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '3px',
          marginBottom: '28px',
        }}>
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1,
                padding: '7px 0',
                fontSize: 13,
                fontWeight: mode === m ? 600 : 400,
                background: mode === m ? 'var(--bg-card)' : 'transparent',
                color: mode === m ? 'var(--text-primary)' : 'var(--text-tertiary)',
                border: mode === m ? '1px solid var(--border)' : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                boxShadow: mode === m ? 'var(--shadow-sm)' : 'none',
                transition: 'all 150ms',
              }}
            >
              {m === 'login' ? t.login : t.register}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <div style={{ marginBottom: 16 }}>
            <label className="label">{t.investigatorId}</label>
            <input
              className="input"
              type="text"
              placeholder={t.idPlaceholder}
              value={id}
              onChange={e => setId(e.target.value)}
              autoFocus
              required
              id="auth-id"
            />
          </div>

          <div style={{ marginBottom: mode === 'register' ? 16 : 24 }}>
            <label className="label">{t.password}</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={pw}
              onChange={e => setPw(e.target.value)}
              required
              id="auth-password"
            />
          </div>

          <AnimatePresence>
            {mode === 'register' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden', marginBottom: 24 }}
              >
                <label className="label">{t.confirmPassword}</label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={pw2}
                  onChange={e => setPw2(e.target.value)}
                  id="auth-password2"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  fontSize: 13,
                  color: 'var(--danger)',
                  background: 'var(--danger-bg)',
                  border: '1px solid #FECACA',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 12px',
                  marginBottom: 16,
                }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}
            id="auth-submit"
          >
            {loading ? '…' : (mode === 'login' ? t.login : t.register)}
          </button>
        </form>
      </motion.div>

      <p style={{ marginTop: 20, fontSize: 13, color: 'var(--text-tertiary)' }}>
        {mode === 'login' ? t.noAccount : t.hasAccount}{' '}
        <button
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 }}
        >
          {mode === 'login' ? t.register : t.login}
        </button>
      </p>
    </div>
  );
}
