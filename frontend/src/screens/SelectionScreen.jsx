import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '../lib/context';
import { api } from '../lib/api';
import LangToggle from '../components/LangToggle';

const STATUS_BADGE = {
  OPEN:   { cls: 'badge-success', label: null },
  CLOSED: { cls: 'badge-default', label: null },
};

export default function SelectionScreen({ user, onSelect, onSignOut }) {
  const { t } = useLang();
  const [cases, setCases]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName]         = useState('');
  const [desc, setDesc]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [error, setError]       = useState('');

  const load = () => {
    setLoading(true);
    api.getCases(user.id)
      .then(data => { setCases(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setCases([]); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const c = await api.createCase({ name: name.trim(), description: desc.trim(), owner_id: user.id });
      setCreating(false);
      setName(''); setDesc('');
      onSelect(c, true); // isNew=true → go to ingestion screen
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handleDelete = async (caseId, e) => {
    e.stopPropagation();
    if (!window.confirm(t.deleteConfirm)) return;
    setDeleting(caseId);
    try {
      await api.deleteCase(caseId);
      setCases(prev => prev.filter(c => c.case_id !== caseId));
    } catch {}
    setDeleting(null);
  };

  const fmt = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Ensure Operation Chakshu demo investigation is always accessible at top
  const demoCase = {
    case_id: 'default-case',
    name: 'Operation Chakshu — Syndicate Investigation',
    description: 'Delhi (Syndicate A) vs Mumbai (Syndicate B) cross-border freight & hawala ring. Includes 441 multi-source records with covert bridge operative.',
    status: 'OPEN',
    updated_at: '2026-03-15T00:00:00',
    isDemo: true
  };

  const displayCases = cases.some(c => c.case_id === 'default-case')
    ? cases
    : [demoCase, ...cases];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Nav */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        height: 68,
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <img
            src="/logo.png"
            alt="Sutradhar Logo"
            fetchpriority="high"
            style={{ height: 52, width: 'auto', objectFit: 'contain' }}
          />
        </div>
        <LangToggle />
        <button className="btn btn-ghost btn-sm" onClick={onSignOut}>{t.signOut}</button>
      </header>

      <main style={{ flex: 1, padding: '48px 24px', maxWidth: 860, margin: '0 auto', width: '100%' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32, gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              {t.selectInv}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Signed in as <span style={{ fontWeight: 600 }}>{user.id}</span>
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className="btn btn-secondary"
            onClick={() => onSelect(demoCase, false)}
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 600 }}
          >
            ⭐ Quick Launch: Operation Chakshu
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className="btn btn-primary"
            onClick={() => { setCreating(true); setError(''); }}
            id="new-investigation-btn"
          >
            + {t.newInv}
          </motion.button>
        </div>

        {/* Create modal */}
        <AnimatePresence>
          {creating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'fixed', inset: 0, background: 'var(--bg-overlay)',
                zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 24,
              }}
              onClick={e => e.target === e.currentTarget && setCreating(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="card"
                style={{ width: '100%', maxWidth: 440, padding: 32 }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>{t.newInv}</h2>
                <form onSubmit={handleCreate}>
                  <div style={{ marginBottom: 16 }}>
                    <label className="label">{t.invName}</label>
                    <input
                      className="input"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Operation Chakshu"
                      autoFocus
                      id="inv-name"
                    />
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label className="label">{t.invDesc}</label>
                    <textarea
                      className="input"
                      value={desc}
                      onChange={e => setDesc(e.target.value)}
                      placeholder="Brief description of the criminal network investigation…"
                      rows={3}
                      id="inv-desc"
                    />
                  </div>
                  {error && (
                    <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</p>
                  )}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>
                      {t.cancel}
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()} id="inv-create">
                      {saving ? '…' : t.create}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Case list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
            Loading…
          </div>
        ) : displayCases.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="card"
            style={{ padding: '60px 32px', textAlign: 'center' }}
          >
            <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>{t.noInvestigations}</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 20 }}
              onClick={() => setCreating(true)}
            >
              + {t.newInv}
            </button>
          </motion.div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {displayCases.map((c, i) => (
              <motion.div
                key={c.case_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -2, boxShadow: 'var(--shadow-md)' }}
                className="card"
                style={{
                  padding: 20,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  border: c.isDemo ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                  position: 'relative',
                }}
                onClick={() => onSelect(c, false)}
                id={`case-card-${c.case_id}`}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {c.name}
                  </div>
                  {c.isDemo ? (
                    <span className="badge badge-primary" style={{ fontSize: 10, flexShrink: 0 }}>
                      ⭐ CONTROLLED DEMO
                    </span>
                  ) : (
                    <span className={`badge ${STATUS_BADGE[c.status]?.cls || 'badge-default'}`} style={{ fontSize: 11, flexShrink: 0 }}>
                      {c.status || 'OPEN'}
                    </span>
                  )}
                </div>

                {c.description && (
                  <p style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {c.description}
                  </p>
                )}

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                }}>
                  <span>{fmt(c.updated_at || c.created_at)}</span>
                  {!c.isDemo && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', padding: '2px 6px', fontSize: 12 }}
                      onClick={e => handleDelete(c.case_id, e)}
                      disabled={deleting === c.case_id}
                      title={t.deleteInv}
                    >
                      {deleting === c.case_id ? '…' : '✕'}
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
