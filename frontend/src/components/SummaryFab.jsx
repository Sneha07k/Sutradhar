import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '../lib/context';
import { api } from '../lib/api';

export default function SummaryFab({ caseId }) {
  const { t } = useLang();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError]     = useState('');

  const generate = async () => {
    setLoading(true); setError('');
    try {
      const data = await api.getSummary(caseId);
      setSummary(data);
    } catch (err) {
      setError(err.message || 'Failed to generate summary.');
    }
    setLoading(false);
  };

  const downloadBlank = (url, filename) => {
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.target = '_blank';
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <>
      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.05, boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}
        whileTap={{ scale: 0.95 }}
        className="btn btn-primary fab"
        style={{ padding: '10px 18px', fontSize: 13, fontWeight: 600 }}
        onClick={() => { setOpen(true); if (!summary) generate(); }}
        id="generate-summary-fab"
      >
        ✦ {t.generateSummary}
      </motion.button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, background: 'var(--bg-overlay)',
              zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
              padding: '80px 24px 80px 24px',
            }}
            onClick={e => e.target === e.currentTarget && setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="card"
              style={{ width: '100%', maxWidth: 540, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
              {/* Header */}
              <div style={{
                padding: '20px 24px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{t.summaryTitle}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => downloadBlank(api.exportCSV(caseId), 'investigation.csv')}
                  >{t.exportCSV}</button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => window.open(api.exportJSON(caseId), '_blank')}
                  >{t.exportJSON}</button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => window.open(api.exportReport(caseId), '_blank')}
                  >{t.exportReport}</button>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={() => setOpen(false)}>✕</button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                {loading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-tertiary)' }}>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      style={{ width: 16, height: 16, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%' }}
                    />
                    {t.generating_s}
                  </div>
                )}
                {error && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>}
                {summary && (
                  <div>
                    {/* Stats row */}
                    {summary.stats && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                        {[
                          ['Actors', summary.stats.total_actors],
                          ['Events', summary.stats.total_events],
                          ['Evidence', summary.stats.evidence_items],
                        ].map(([label, val]) => (
                          <div key={label} style={{
                            padding: '12px 14px', background: 'var(--bg)',
                            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', textAlign: 'center',
                          }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{val ?? '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Paragraphs */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {(summary.summary_paragraphs || []).map((p, i) => (
                        <p key={i} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)' }}>
                          {/* Render markdown-ish bold: **text** */}
                          {p.split(/\*\*(.*?)\*\*/g).map((seg, j) =>
                            j % 2 === 1 ? <strong key={j}>{seg}</strong> : seg
                          )}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer refresh */}
              {summary && !loading && (
                <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-ghost btn-sm" onClick={generate} style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    ↻ Regenerate
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
