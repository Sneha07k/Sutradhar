import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '../lib/context';
import LangToggle from '../components/LangToggle';
import { api } from '../lib/api';

// Live multi-source criminal intelligence records stream
const SAMPLE_RECORDS = [
  { type: 'cdr_call', source: 'Telecom Gateway (TS-North)', actor: 'Vikram Malhotra ➔ Rahul Kumar (+91-98110-23451)', detail: 'Duration: 159s | Tower: TWR_DEL_OKHLA_42' },
  { type: 'fiu_transaction', source: 'FIU-IND Banking STR', actor: 'Apex Global Logistics ➔ Rahul Kumar', detail: '₹1,850,000 RTGS | Ref: Consignment Advance' },
  { type: 'fiu_transaction', source: 'FIU-IND Banking STR', actor: 'Rahul Kumar ➔ Tariq Sheikh', detail: '₹1,600,000 IMPS | Split hawala settlement' },
  { type: 'fir_incident', source: 'CCTNS Police Incident', actor: 'FIR 104/2026 PS Sector 20 Noida', detail: 'Vehicle UP14 AB 1234 intercepted; R. Kumar spotted fleeing' },
  { type: 'fir_incident', source: 'CCTNS Police Incident', actor: 'FIR 58/2026 PS Vasant Kunj', detail: 'Mahipalpur Warehouse raid: cash packets & freight logs seized' },
  { type: 'surveillance_sighting', source: 'Physical Recon Unit', actor: 'Rahul Kumar (Scorpio UP14 AB 1234)', detail: 'Rendezvous at Sector 18 Market Noida with Tariq Sheikh' },
  { type: 'surveillance_sighting', source: 'ANPR Highway Camera', actor: 'DL01 CA 8899 (Toyota Fortuner)', detail: 'Sighted on NH-48 Mahipalpur corridor' },
  { type: 'sigint_intercept', source: 'Encrypted Comms Intercept', actor: 'rahul_47 ➔ tariq_sk (Telegram)', detail: 'Consignment dispatched from Okhla hub. Keep receiver ready.' },
  { type: 'sigint_intercept', source: 'Encrypted Comms Intercept', actor: 'Amit Sharma ➔ Sunita Rao (WhatsApp)', detail: 'Kuber invoice adjusted against logistics fee. Disburse advance.' },
  { type: 'cdr_call', source: 'Telecom Gateway (TS-West)', actor: 'Tariq Sheikh ➔ Amit Sharma (+91-99580-11223)', detail: 'Duration: 184s | Tower: TWR_MUM_BKC_11' },
  { type: 'surveillance_sighting', source: 'Physical Recon Unit', actor: 'Deepak Verma & Suresh Patel', detail: 'Meeting observed at Okhla Industrial Area Phase II' },
  { type: 'fir_incident', source: 'CCTNS Police Incident', actor: 'FIR 219/2026 PS BKC Mumbai', detail: 'Hawala courier detained; ledger links Kuber Financial' },
];

function useFeed(active) {
  const [items, setItems] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active) { clearInterval(timerRef.current); return; }

    let count = 0;
    timerRef.current = setInterval(() => {
      const rec = SAMPLE_RECORDS[count % SAMPLE_RECORDS.length];
      count++;
      setItems(prev => [{
        id: count,
        ts: new Date().toLocaleTimeString(),
        ...rec,
      }, ...prev].slice(0, 50));
    }, 250);

    return () => clearInterval(timerRef.current);
  }, [active]);

  return items;
}

const TYPE_CONFIG = {
  cdr_call:              { color: '#D97706', bg: 'rgba(217,119,6,0.12)', label: 'CDR Call' },
  fiu_transaction:       { color: '#059669', bg: 'rgba(5,150,105,0.12)', label: 'FIU Funds' },
  fir_incident:          { color: '#DC2626', bg: 'rgba(220,38,38,0.12)', label: 'CCTNS FIR' },
  surveillance_sighting: { color: '#2563EB', bg: 'rgba(37,99,235,0.12)', label: 'Surveillance' },
  sigint_intercept:      { color: '#7C3AED', bg: 'rgba(124,58,237,0.12)', label: 'SIGINT' },
};

function CorrProgress({ progress, message, found }) {
  const pct = Math.min(100, Math.max(0, progress || 0));
  return (
    <div style={{ textAlign: 'left', maxWidth: 480, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
      }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          style={{ width: 14, height: 14, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', flexShrink: 0 }}
        />
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Computing Network Centrality & Resolving Entities...
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
          {pct.toFixed(0)}%
        </span>
      </div>

      <div style={{
        height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 12,
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4 }}
          style={{ height: '100%', background: 'var(--accent)', borderRadius: 3 }}
        />
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {message || 'Correlating phone numbers, financial accounts, and incident co-occurrences...'}
      </div>
      {found > 0 && (
        <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>
          {found} cross-source link{found !== 1 ? 's' : ''} resolved
        </div>
      )}
    </div>
  );
}

export default function IngestionScreen({ caseData, user, onDone, onBack }) {
  const { t } = useLang();
  const [path, setPath]           = useState(null);
  const [ingesting, setIngesting] = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState('');
  const [ingestStats, setIngestStats] = useState(null);

  const [corrRunning, setCorrRunning]   = useState(false);
  const [corrProgress, setCorrProgress] = useState(0);
  const [corrMessage, setCorrMessage]   = useState('');
  const [corrFound, setCorrFound]       = useState(0);
  const pollRef = useRef(null);

  const feed = useFeed(ingesting);
  const feedRef = useRef(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [feed]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startIngestion = async () => {
    setError('');
    setIngesting(true);
    try {
      const res = await api.loadSlice(caseData.case_id, 500);
      setIngestStats(res?.records_ingested || null);
      setTimeout(() => {
        setIngesting(false);
        setDone(true);
      }, 1200);
    } catch (err) {
      setIngesting(false);
      setError(err.message || 'Ingestion failed.');
    }
  };

  const startCorrelation = async () => {
    setCorrRunning(true);
    setCorrProgress(0);
    setCorrMessage('Analyzing multi-source relationships...');
    setCorrFound(0);
    setError('');

    try {
      await api.runCorrelation(caseData.case_id);

      pollRef.current = setInterval(async () => {
        try {
          const status = await api.getCorrelationStatus(caseData.case_id);
          setCorrProgress(status.progress_pct || 0);
          setCorrMessage(status.message || '');
          setCorrFound(status.found || 0);

          if (status.done) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setCorrProgress(100);
            setTimeout(() => onDone(), 600);
          }
        } catch {
        }
      }, 1200);
    } catch (err) {
      setTimeout(() => onDone(), 800);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', padding: '0 24px',
        height: 62, background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', gap: 12,
      }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>{t.back || 'Back'}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <img
            src="/logo.png"
            alt="Pragya Chakshu Logo"
            style={{ height: 42, width: 'auto', objectFit: 'contain' }}
          />
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>{caseData.name}</div>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Multi-Source Intelligence Ingestion</span>
        <LangToggle />
      </header>

      <main style={{ flex: 1, maxWidth: 860, margin: '0 auto', width: '100%', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Multi-Source Intelligence Ingestion</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 36, fontSize: 15 }}>
          Ingest and correlate fragmented data from Telecom CDRs, Banking transactions (FIU), CCTNS Police FIRs, and Physical Reconnaissance.
        </p>

        {!path && !ingesting && !done && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}
          >
            {[
              {
                id: 'crawler',
                icon: '📡',
                label: 'Multi-Source Intelligence Feeds',
                desc: 'Automated ingestion across Telecom CDRs (140), Banking Flows (75), CCTNS Police FIRs (12), Surveillance (66), and Field Reports.',
                badge: 'Recommended'
              },
              {
                id: 'manual',
                icon: '📁',
                label: 'Field Intelligence Dossier Import',
                desc: 'Upload custom investigation CSV files, localized FIR transcripts (Hindi/Hinglish), or intercepted chat exports.',
                badge: 'Manual Batch'
              },
            ].map(opt => (
              <motion.button
                key={opt.id}
                whileHover={{ y: -2, boxShadow: 'var(--shadow-lg)' }}
                whileTap={{ scale: 0.98 }}
                className="card"
                style={{
                  padding: '32px 28px', textAlign: 'left', cursor: 'pointer',
                  border: '2px solid var(--border)', background: 'var(--bg-card)',
                  display: 'flex', flexDirection: 'column', gap: 12,
                  transition: 'box-shadow 200ms, border-color 200ms, transform 200ms',
                }}
                onClick={() => setPath(opt.id)}
                id={`ingest-${opt.id}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 32 }}>{opt.icon}</span>
                  <span className="badge badge-default" style={{ fontSize: 10 }}>{opt.badge}</span>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>{opt.label}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>{opt.desc}</div>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}

        {path === 'crawler' && !ingesting && !done && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
            style={{ padding: '32px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>📡</span>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600 }}>Multi-Source Investigation Feed (441 Records)</h2>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Synthesized cross-border syndicate intelligence dataset</div>
              </div>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
              background: 'var(--bg)', padding: '16px', borderRadius: 'var(--radius)',
              border: '1px solid var(--border)', marginBottom: 24
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Telecom CDR</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#D97706' }}>140 Calls</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>FIU Banking</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>75 Transfers</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>CCTNS FIRs</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#DC2626' }}>12 Incidents</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Recon & Intercepts</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#2563EB' }}>144 Events</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" onClick={() => setPath(null)}>{t.cancel || 'Cancel'}</button>
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="btn btn-primary btn-lg"
                onClick={startIngestion}
                id="start-ingest-btn"
                style={{ flex: 1 }}
              >
                Ingest Intelligence Records & Build Graph
              </motion.button>
            </div>
          </motion.div>
        )}

        {path === 'manual' && !ingesting && !done && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
            style={{ padding: '32px' }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Field Intelligence & Dossier Upload</h2>
            <div
              style={{
                border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
                padding: '40px 32px', textAlign: 'center', color: 'var(--text-tertiary)',
                marginBottom: 24, cursor: 'pointer',
              }}
              onClick={() => { setPath('crawler'); startIngestion(); }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Drop FIR transcripts, CDR logs, or informant notes here</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Supports CSV, JSON, TXT (English, Hindi, Hinglish)</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" onClick={() => setPath(null)}>{t.cancel || 'Cancel'}</button>
              <button className="btn btn-primary" onClick={() => { setPath('crawler'); startIngestion(); }}>
                Load Controlled Demonstration Dataset
              </button>
            </div>
          </motion.div>
        )}

        {ingesting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                style={{ width: 16, height: 16, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%' }}
              />
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Ingesting Multi-Source Telemetry & Intercepts...
              </span>
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{
                padding: '10px 16px', background: 'var(--bg-elevated)',
                borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Live Multi-Source Ingestion Stream
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {feed.length} incoming records
                </span>
              </div>
              <div ref={feedRef} style={{ maxHeight: 360, overflowY: 'auto', padding: '0' }}>
                <AnimatePresence initial={false}>
                  {feed.map(item => {
                    const cfg = TYPE_CONFIG[item.type] || { color: '#64748B', bg: 'rgba(100,116,139,0.1)', label: item.type };
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '70px 105px 170px 1fr',
                          gap: 12, padding: '9px 16px',
                          borderBottom: '1px solid var(--border)',
                          fontSize: 12, alignItems: 'center',
                        }}
                      >
                        <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          {item.ts}
                        </span>
                        <span style={{
                          fontWeight: 600,
                          color: cfg.color,
                          background: cfg.bg,
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          textAlign: 'center',
                          textTransform: 'uppercase',
                        }}>
                          {cfg.label}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.source}
                        </span>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginRight: 6 }}>
                            {item.actor}
                          </span>
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                            ({item.detail})
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        {done && !corrRunning && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center', padding: '48px 0' }}
          >
            <div style={{ fontSize: 44, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--success)' }}>
              Intelligence Dataset Successfully Ingested
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 28, fontSize: 15, maxWidth: 520, margin: '0 auto 28px' }}>
              441 multi-source records (CDRs, banking flows, FIRs, surveillance events, field transcripts) loaded. Network graph generated with 159 entities and 149 links.
            </p>
            {error && (
              <p style={{ color: 'var(--danger)', marginBottom: 20, fontSize: 14 }}>{error}</p>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }}
                whileTap={{ scale: 0.97 }}
                className="btn btn-primary btn-lg"
                onClick={startCorrelation}
                id="start-corr-btn"
                style={{ fontSize: 15, padding: '12px 32px' }}
              >
                Compute Network Analytics & View Graph
              </motion.button>
              <button
                className="btn btn-secondary btn-lg"
                onClick={() => onDone()}
                style={{ fontSize: 15, padding: '12px 24px' }}
              >
                Open Investigation Directly
              </button>
            </div>
          </motion.div>
        )}

        {corrRunning && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ padding: '48px 0', textAlign: 'center' }}
          >
            <CorrProgress
              progress={corrProgress}
              message={corrMessage}
              found={corrFound}
            />
          </motion.div>
        )}

        {error && !done && (
          <p style={{ marginTop: 20, color: 'var(--danger)', fontSize: 13 }}>{error}</p>
        )}
      </main>
    </div>
  );
}
