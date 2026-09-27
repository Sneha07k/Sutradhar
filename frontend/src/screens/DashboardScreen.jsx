import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '../lib/context';
import { api } from '../lib/api';
import LangToggle from '../components/LangToggle';

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfBadge({ val }) {
  const { t } = useLang();
  if (!val) return null;
  const v = (val + '').toLowerCase();
  const cls = v === 'high' ? 'badge-success' : v === 'medium' ? 'badge-warning' : 'badge-default';
  const label = v === 'high' ? t.high : v === 'medium' ? t.medium : t.low;
  return <span className={`badge ${cls}`}><span className={`conf-dot conf-${v}`} />{label}</span>;
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ value, label }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-sm"
      style={{ fontSize: 11, padding: '2px 8px', color: 'var(--text-tertiary)' }}
      onClick={() => { navigator.clipboard.writeText(value).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      {copied ? t.copied : t.copyValue}
    </button>
  );
}

// ── Identifier chip ───────────────────────────────────────────────────────────
function IdentChip({ id, t }) {
  const typeLabel = { PGP_KEY: t.pgpKey, BTC_ADDRESS: t.wallet, ONION_URL: t.onionUrl };
  const typeCls   = { PGP_KEY: 'badge-warning', BTC_ADDRESS: 'badge-danger', ONION_URL: 'badge-info' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    }}>
      <span className={`badge ${typeCls[id.identifier_type] || 'badge-default'}`} style={{ fontSize: 10, flexShrink: 0 }}>
        {typeLabel[id.identifier_type] || id.identifier_type}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {id.identifier_value}
      </span>
      <CopyBtn value={id.identifier_value} />
    </div>
  );
}

// ── Timeline for a persona ────────────────────────────────────────────────────
function TimelineView({ caseId, personaId, t }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api.getTimeline(caseId, personaId)
      .then(data => { setEvents(data?.events || data || []); setLoading(false); })
      .catch(() => { setEvents([]); setLoading(false); });
  }, [caseId, personaId]);

  const shown = expanded ? events : events.slice(0, 5);

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '12px 0' }}>Loading…</div>;
  if (!events.length) return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '12px 0' }}>{t.noTimeline}</div>;

  return (
    <div>
      <div style={{ position: 'relative', paddingLeft: 28 }}>
        <div className="timeline-line" />
        {shown.map((ev, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.2 }}
            style={{ display: 'flex', gap: 12, marginBottom: 16, position: 'relative' }}
          >
            {/* Dot */}
            <div style={{
              position: 'absolute', left: -20, top: 4,
              width: 8, height: 8, borderRadius: '50%',
              background: ev.event_type === 'first_seen' ? 'var(--success)' : ev.event_type?.includes('pgp') ? 'var(--warning)' : 'var(--accent)',
              border: '1px solid var(--bg-card)',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {(ev.timestamp || ev.date || '').slice(0, 16).replace('T', ' ')}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {ev.event_type || ev.type}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                {ev.description || ev.label || JSON.stringify(ev.payload || {}).slice(0, 100)}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      {events.length > 5 && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 12, color: 'var(--accent)' }}
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? t.showRecent : `${t.showAll} (${events.length} ${t.events})`}
        </button>
      )}
    </div>
  );
}

// ── Actor profile card ────────────────────────────────────────────────────────
function ActorCard({ persona, caseId, selected, onSelect, t, anchorId }) {
  const [identifiers, setIdentifiers] = useState([]);
  const [note, setNote]     = useState('');
  const [noteTab, setNoteTab] = useState(false);
  const [savedNote, setSavedNote] = useState('');
  const [showTimeline, setShowTimeline] = useState(false);
  const isOpen = selected;

  useEffect(() => {
    if (isOpen && !identifiers.length) {
      // Identifiers come with persona data in the list endpoint
      setIdentifiers(persona.identifiers || []);
    }
  }, [isOpen]);

  const saveNote = async () => {
    if (!note.trim()) return;
    try {
      await api.addNote(caseId, {
        entity_type: 'persona',
        entity_id: persona.persona_id,
        entity_label: persona.canonical_handle,
        note_text: note,
        investigator_id: 'current_user',
      });
      setSavedNote(note); setNote('');
    } catch {}
  };

  return (
    <div
      className="card"
      style={{
        overflow: 'hidden',
        border: isOpen ? '1px solid var(--accent)' : '1px solid var(--border)',
        transition: 'border-color 150ms',
      }}
    >
      {/* Header row */}
      <button
        id={anchorId}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', width: '100%', background: 'transparent',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
        onClick={onSelect}
      >
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: `hsl(${(persona.canonical_handle?.charCodeAt(0) || 0) * 7 % 360},40%,90%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 14, color: `hsl(${(persona.canonical_handle?.charCodeAt(0) || 0) * 7 % 360},50%,35%)`,
          flexShrink: 0,
        }}>
          {(persona.canonical_handle || '?')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {persona.canonical_handle}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{persona.platform}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <ConfBadge val={persona.confidence || 'medium'} />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>▾</span>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              {/* Metadata chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 0' }}>
                {[
                  ['Provenance', persona.provenance],
                  ['First seen', persona.first_seen ? persona.first_seen.slice(0, 10) : null],
                  ['Category', persona.threat_type || persona.category],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} style={{
                    display: 'flex', gap: 4, padding: '3px 8px',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-full)', fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>{k}:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
                {[[false, t.identifiers], [true, t.notes]].map(([isNote, label]) => (
                  <button
                    key={label}
                    onClick={() => setNoteTab(isNote)}
                    style={{
                      padding: '6px 14px', fontSize: 12, fontWeight: 500, border: 'none',
                      borderBottom: noteTab === isNote ? '2px solid var(--accent)' : '2px solid transparent',
                      background: 'transparent', cursor: 'pointer',
                      color: noteTab === isNote ? 'var(--accent)' : 'var(--text-tertiary)',
                    }}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => setShowTimeline(s => !s)}
                  style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 500, border: 'none',
                    borderBottom: showTimeline ? '2px solid var(--accent)' : '2px solid transparent',
                    background: 'transparent', cursor: 'pointer',
                    color: showTimeline ? 'var(--accent)' : 'var(--text-tertiary)',
                    marginLeft: 'auto',
                  }}
                >
                  {t.timeline}
                </button>
              </div>

              {!showTimeline ? (
                !noteTab ? (
                  /* Identifiers */
                  identifiers.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {identifiers.map((id, i) => <IdentChip key={i} id={id} t={t} />)}
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No identifiers found.</p>
                  )
                ) : (
                  /* Notes */
                  <div>
                    {savedNote && (
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12,
                        padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                        {savedNote}
                      </div>
                    )}
                    <textarea
                      className="input"
                      rows={3}
                      placeholder={t.addNote}
                      value={note}
                      onChange={e => setNote(e.target.value)}
                    />
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={saveNote}>
                      {t.saveNote}
                    </button>
                  </div>
                )
              ) : (
                /* Timeline */
                <TimelineView caseId={caseId} personaId={persona.persona_id} t={t} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DashboardScreen({ caseData, user, onBack, onSignOut, onReIngest, onOpenGraph }) {
  const { t } = useLang();
  const [personas, setPersonas]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [query, setQuery]           = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab]               = useState('actors'); // actors | infra | notes
  const [infra, setInfra]           = useState([]);
  const [invNote, setInvNote]       = useState('');
  const [savedInvNote, setSavedInvNote] = useState('');
  const [noteMsg, setNoteMsg]       = useState('');
  // 'unknown' until the real status endpoint answers, so the graph entry is
  // never shown on a guess.
  const [corr, setCorr]             = useState({ state: 'unknown', computed: 0, total: 0, found: 0 });

  useEffect(() => {
    setLoading(true);
    api.getPersonas(caseData.case_id)
      .then(data => { setPersonas(Array.isArray(data) ? data : data?.personas || []); setLoading(false); })
      .catch(() => { setPersonas([]); setLoading(false); });

    api.getInfrastructure(caseData.case_id)
      .then(data => setInfra(Array.isArray(data) ? data : data?.indicators || []))
      .catch(() => setInfra([]));
  }, [caseData.case_id]);

  // The graph is only offered once correlation has actually completed.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api.getCorrelationStatus(caseData.case_id)
        .then(s => {
          if (cancelled) return;
          const done = !!s?.done;
          setCorr({
            state: done ? 'done' : (s?.status === 'error' ? 'error' : 'running'),
            computed: s?.computed || 0,
            total: s?.total || 0,
            found: s?.found || 0,
          });
        })
        .catch(() => { if (!cancelled) setCorr(c => ({ ...c, state: 'unknown' })); });
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [caseData.case_id]);

  const graphReady = corr.state === 'done';

  const filtered = personas.filter(p => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (p.canonical_handle || '').toLowerCase().includes(q) ||
           (p.platform || '').toLowerCase().includes(q) ||
           (p.identifiers || []).some(id => (id.identifier_value || '').toLowerCase().includes(q));
  });

  const saveInvNote = async () => {
    if (!invNote.trim()) return;
    try {
      await api.addNote(caseData.case_id, {
        entity_type: 'investigation',
        entity_id: caseData.case_id,
        entity_label: caseData.name,
        note_text: invNote,
        investigator_id: user?.id || 'investigator',
      });
      setSavedInvNote(invNote); setInvNote(''); setNoteMsg(t.noteSaved);
      setTimeout(() => setNoteMsg(''), 2000);
    } catch {}
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', padding: '0 24px',
        height: 68, background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', gap: 12, flexShrink: 0,
      }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Cases</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <img
            src="/logo.png"
            alt="Sutradhar Logo"
            style={{ height: 50, width: 'auto', objectFit: 'contain' }}
          />
          <div style={{ width: 1, height: 26, background: 'var(--border)' }} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>{caseData.name}</div>
        </div>
        <span className="badge badge-success" style={{ fontSize: 10 }}>{t.open}</span>
        {/* Persistent graph entry — available once correlation has completed,
            and survives refresh because it is re-derived from the API. */}
        {onOpenGraph && (
          <button
            id="open-graph-btn"
            className="btn btn-primary btn-sm"
            onClick={onOpenGraph}
            disabled={!graphReady}
            title={
              graphReady
                ? (t.relationshipGraph || 'Relationship Graph')
                : (corr.state === 'running'
                    ? (t.correlationRunning || 'Correlation still running')
                    : (t.runCorrelationFirst || 'Run correlation to build the graph'))
            }
          >
            {corr.state === 'running'
              ? (t.correlationRunning || 'Correlating...')
              : (t.relationshipGraph || 'Relationship Graph')}
          </button>
        )}
        {onReIngest && (
          <button
            id="dash-reingest-btn"
            className="btn btn-secondary btn-sm"
            onClick={onReIngest}
            title={t.ingestMore || 'Ingest more data'}
          >
            + {t.ingestData || 'Ingest Data'}
          </button>
        )}
        <LangToggle />
        {onSignOut && (
          <button className="btn btn-ghost btn-sm" onClick={onSignOut} style={{ color: 'var(--text-tertiary)' }}>
            {t.signOut || 'Sign out'}
          </button>
        )}
      </header>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar — tabs */}
        <nav className="sidebar" style={{ padding: '16px 0' }}>
          {[
            { id: 'actors', icon: '👤', label: t.actors },
            { id: 'infra',  icon: '🌐', label: t.infrastructure },
            { id: 'notes',  icon: '📝', label: t.notes },
          ].map(item => (
            <button
              key={item.id}
              id={`dash-${item.id}-tab`}
              onClick={() => setTab(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
                background: tab === item.id ? 'var(--accent-light)' : 'transparent',
                border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
                color: tab === item.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: tab === item.id ? 600 : 400, fontSize: 14,
                borderRight: tab === item.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

          {/* Search bar */}
          <div style={{ position: 'relative', marginBottom: 28 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: 16 }}>
              🔍
            </span>
            <input
              className="input"
              style={{ paddingLeft: 38, fontSize: 14 }}
              placeholder={t.search}
              value={query}
              onChange={e => setQuery(e.target.value)}
              id="dashboard-search"
            />
          </div>

          {/* ACTORS TAB */}
          {tab === 'actors' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{t.actors}</h2>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{filtered.length} found</span>
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>Loading…</div>
              ) : !filtered.length ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                  {query ? t.noResults : t.noActors}
                </div>
              ) : (
                <div id="dash-actor-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filtered.map((p, i) => (
                    <ActorCard
                      key={p.persona_id}
                      persona={p}
                      caseId={caseData.case_id}
                      selected={selectedId === p.persona_id}
                      onSelect={() => setSelectedId(selectedId === p.persona_id ? null : p.persona_id)}
                      t={t}
                      anchorId={i === 0 ? 'dash-actor-first' : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* INFRA TAB */}
          {tab === 'infra' && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{t.infrastructure}</h2>
              {!infra.length ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 14, padding: '20px 0' }}>
                  No infrastructure indicators found for this case.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {infra.map((item, i) => (
                    <div key={i} className="card" style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span className="badge badge-info" style={{ fontSize: 10 }}>
                        {item.indicator_type || 'INFRA'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.indicator_value || item.url || item.value}
                      </span>
                      {item.scan_date && (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                          {t.lastScan}: {item.scan_date?.slice(0, 10)}
                        </span>
                      )}
                      <CopyBtn value={item.indicator_value || item.url || ''} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NOTES TAB */}
          {tab === 'notes' && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{t.notes}</h2>
              {savedInvNote && (
                <div style={{
                  padding: '12px 16px', marginBottom: 16,
                  background: 'var(--accent-light)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5,
                }}>
                  {savedInvNote}
                </div>
              )}
              <label className="label">{t.investigationNote}</label>
              <textarea
                className="input"
                rows={4}
                placeholder={t.addNote}
                value={invNote}
                onChange={e => setInvNote(e.target.value)}
                id="inv-note"
              />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
                <button className="btn btn-secondary" onClick={saveInvNote}>{t.saveNote}</button>
                {noteMsg && <span style={{ fontSize: 13, color: 'var(--success)' }}>✓ {noteMsg}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
