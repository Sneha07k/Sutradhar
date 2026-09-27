import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '../lib/context';
import LangToggle from '../components/LangToggle';
import { api } from '../lib/api';

// ── Node visual config ────────────────────────────────────────────────────────
// The API returns Persona / Identifier / Post / Listing / Case nodes, and an
// Identifier carries an identifier_type. Key on the real shapes so every node
// gets a deliberate style instead of falling through to the default grey.
// Every entity type gets its own hue. These previously collided (ONION_URL
// vs hidden_service, EMAIL vs certificate), which made two legend rows share a
// swatch. Hues are spread around the wheel and kept dark enough to hold up on
// the near-white canvas (#F8F7F5).
const IDENTIFIER_STYLE = {
  PGP_KEY:      { color: '#C2410C', key: 'gPgpKey',    r: 6 },
  BTC_ADDRESS:  { color: '#DC2626', key: 'gWallet',    r: 6 },
  ONION_URL:    { color: '#0E7490', key: 'gOnionUrl',  r: 6 },
  EMAIL:        { color: '#BE185D', key: 'gEmail',     r: 6 },
};

const NODE_CFG = {
  person:         { color: '#4F46E5', key: 'gPerson',        r: 10 },
  organization:   { color: '#0284C7', key: 'gOrganization',  r: 9 },
  vehicle:        { color: '#D97706', key: 'gVehicle',       r: 7 },
  phone:          { color: '#059669', key: 'gPhone',         r: 6 },
  location:       { color: '#DC2626', key: 'gLocation',      r: 8 },
  incident:       { color: '#9333EA', key: 'gIncident',      r: 8 },
  persona:        { color: '#4F46E5', key: 'gPersona',       r: 9 },
  actor:          { color: '#4F46E5', key: 'gPersona',       r: 9 },
  identifier:     { color: '#64748B', key: 'gIdentifier',    r: 6 },
  post:           { color: '#059669', key: 'gPost',          r: 5 },
  listing:        { color: '#B45309', key: 'gListing',       r: 5 },
  case:           { color: '#0F172A', key: 'gCase',          r: 12 },
  server:         { color: '#0F766E', key: 'gServer',        r: 6 },
  certificate:    { color: '#7C3AED', key: 'gCertificate',   r: 5 },
  hidden_service: { color: '#1D4ED8', key: 'gHiddenService',  r: 7 },
};

const EDGE_STYLE = {
  COMMUNICATED_WITH:   { color: '#059669', dash: null,  key: 'gCommunicatedWith' },
  COMMUNICATED:        { color: '#059669', dash: null,  key: 'gCommunicatedWith' },
  CALLED:              { color: '#059669', dash: null,  key: 'gCommunicatedWith' },
  TRANSFERRED_FUNDS:   { color: '#DC2626', dash: null,  key: 'gTransferredFunds' },
  SEEN_TOGETHER:       { color: '#E11D48', dash: '5 3', key: 'gSeenTogether'     },
  INVOLVED_IN:         { color: '#9333EA', dash: '4 2', key: 'gInvolvedIn'       },
  OBSERVED_AT:         { color: '#D97706', dash: '3 2', key: 'gObservedAt'       },
  WORKS_FOR:           { color: '#0284C7', dash: null,  key: 'gWorksFor'         },
  DRIVES_VEHICLE:      { color: '#B45309', dash: null,  key: 'gDrivesVehicle'    },
  OWNS_VEHICLE:        { color: '#B45309', dash: null,  key: 'gDrivesVehicle'    },
  USES_PHONE:          { color: '#059669', dash: null,  key: 'gUsesPhone'        },
  CORRELATED_WITH:     { color: '#15803D', dash: null,  key: 'gCorrelatedWith'   },
  COORDINATED_WITH:    { color: '#7C3AED', dash: '5 3', key: 'gCoordinatedWith'  },
  AUTHORED:            { color: '#059669', dash: null,  key: 'gAuthored'         },
  PUBLISHED:           { color: '#B45309', dash: null,  key: 'gPublished'        },
  USES_IDENTIFIER:     { color: '#C2410C', dash: null,  key: 'gUses'             },
  MENTIONS_IDENTIFIER: { color: '#64748B', dash: '2 3', key: 'gMentions'         },
  PART_OF:             { color: '#94A3B8', dash: '1 4', key: 'gBelongsTo'        },
  HOSTED_ON:           { color: '#0E7490', dash: null,  key: 'gHostedOn'         },
  SERVES_CERTIFICATE:  { color: '#6D28D9', dash: null,  key: 'gServesCert'       },
  CO_HOSTED_SERVER:    { color: '#DB2777', dash: '5 3', key: 'gCoHosted'         },
};

const EDGE_COLOR = {
  high:    '#15803D',
  medium:  '#B45309',
  low:     '#64748B',
  default: '#CBD5E1',
};

// Labels resolve through i18n at render time, so the legend, the description
// panel and the edge labels all follow the active language. `key` is stable
// across languages, which is what the legend groups on.
function nodeStyle(node, t) {
  const type = String(node?.type || '').toLowerCase();
  const label = (cfg, fallback) => (cfg.key && t?.[cfg.key]) || fallback;
  if (type === 'identifier') {
    const sub = IDENTIFIER_STYLE[node.identifier_type];
    if (sub) return { ...sub, label: label(sub, node.identifier_type) };
    return { color: '#64748B', r: 6, label: node.identifier_type || t?.gIdentifier || 'Identifier' };
  }
  const cfg = NODE_CFG[type];
  if (cfg) return { ...cfg, label: label(cfg, node?.type) };
  return { color: '#94A3B8', r: 6, label: node?.type || t?.gEntity || 'Entity' };
}

function edgeStyle(edge, t) {
  const label = edge?.label || '';
  if (label === 'CORRELATED_WITH') {
    // `confidence` is the 0..1 link strength; `score` is a 0..100 stylometry
    // distance, so it must never be read as a 0..1 ratio.
    const confidence = Number(edge.confidence ?? 0);
    const pct = Math.round(confidence * 100);
    const color = confidence >= 0.8 ? EDGE_COLOR.high : confidence >= 0.5 ? EDGE_COLOR.medium : EDGE_COLOR.low;
    const tpl = t?.gCorrelatedWith || 'correlated {pct}%';
    return { color, dash: null, label: tpl.replace('{pct}', pct) };
  }
  const cfg = EDGE_STYLE[label];
  if (cfg) return { ...cfg, label: (cfg.key && t?.[cfg.key]) || cfg.key };
  return { color: EDGE_COLOR.default, dash: null, label: label.toLowerCase().replace(/_/g, ' ') };
}

// ── Force layout ──────────────────────────────────────────────────────────────
// Runs to completion in one pass (no rAF loop): the old version never converged,
// so it kept spreading the layout off-screen at 60fps. Repulsion is limited to
// nearby grid cells so cost stays near-linear instead of O(n^2) per frame.
const GRID_CELL = 140;
const ITERATIONS = 240;

function simulate(nodes, edges) {
  const n = nodes.length;
  const out = {};
  if (!n) return out;

  const index = new Map();
  nodes.forEach((d, i) => index.set(d.id, i));

  // Deterministic phyllotaxis start: no Math.random, so the same investigation
  // always lays out the same way.
  const P = new Float64Array(n * 2);
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = 26 * Math.sqrt(i + 0.5);
    P[i * 2]     = Math.cos(i * GA) * r;
    P[i * 2 + 1] = Math.sin(i * GA) * r;
  }

  const links = [];
  for (const e of edges) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a !== undefined && b !== undefined && a !== b) links.push(a, b);
  }

  const F = new Float64Array(n * 2);
  const grid = new Map();

  for (let step = 0; step < ITERATIONS; step++) {
    const cool = 1 - step / ITERATIONS;
    F.fill(0);

    grid.clear();
    for (let i = 0; i < n; i++) {
      const k = `${Math.floor(P[i * 2] / GRID_CELL)},${Math.floor(P[i * 2 + 1] / GRID_CELL)}`;
      let cell = grid.get(k);
      if (!cell) grid.set(k, (cell = []));
      cell.push(i);
    }
    for (let i = 0; i < n; i++) {
      const x = P[i * 2], y = P[i * 2 + 1];
      const cx = Math.floor(x / GRID_CELL), cy = Math.floor(y / GRID_CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const cell = grid.get(`${cx + ox},${cy + oy}`);
          if (!cell) continue;
          for (const j of cell) {
            if (j === i) continue;
            let dx = x - P[j * 2], dy = y - P[j * 2 + 1];
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { dx = (i - j) || 1; dy = 0.5; d2 = dx * dx + dy * dy; }
            const d = Math.sqrt(d2);
            const f = 900 / d2;
            F[i * 2]     += (dx / d) * f;
            F[i * 2 + 1] += (dy / d) * f;
          }
        }
      }
    }

    for (let k = 0; k < links.length; k += 2) {
      const a = links[k], b = links[k + 1];
      const dx = P[b * 2] - P[a * 2], dy = P[b * 2 + 1] - P[a * 2 + 1];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 70) * 0.05;
      F[a * 2]     += (dx / d) * f;
      F[a * 2 + 1] += (dy / d) * f;
      F[b * 2]     -= (dx / d) * f;
      F[b * 2 + 1] -= (dy / d) * f;
    }

    // Gentle pull to origin so disconnected fragments stay in frame.
    for (let i = 0; i < n; i++) {
      F[i * 2]     -= P[i * 2] * 0.006;
      F[i * 2 + 1] -= P[i * 2 + 1] * 0.006;
    }

    for (let i = 0; i < n; i++) {
      let vx = F[i * 2] * cool, vy = F[i * 2 + 1] * cool;
      const sp = Math.sqrt(vx * vx + vy * vy);
      if (sp > 18) { vx = (vx / sp) * 18; vy = (vy / sp) * 18; }
      P[i * 2] += vx;
      P[i * 2 + 1] += vy;
    }
  }

  for (let i = 0; i < n; i++) out[nodes[i].id] = { x: P[i * 2], y: P[i * 2 + 1] };
  return out;
}

/**
 * Scale + translate that frames the whole graph inside the viewport. This is
 * what makes the graph actually visible: without it a force layout happily
 * spreads to a few thousand units and 90% of it sits outside the element.
 */
function fitTransform(positions, nodes, w, h, t, pad = 44) {
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const p = positions[n.id];
    if (!p) continue;
    const r = nodeStyle(n, t).r + 6;
    if (p.x - r < minX) minX = p.x - r;
    if (p.x + r > maxX) maxX = p.x + r;
    if (p.y - r < minY) minY = p.y - r;
    if (p.y + r > maxY) maxY = p.y + r;
  }
  if (!isFinite(minX)) return { scale: 1, tx: w / 2, ty: h / 2 };

  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);
  const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh, 1.5);
  return {
    scale,
    tx: w / 2 - ((minX + maxX) / 2) * scale,
    ty: h / 2 - ((minY + maxY) / 2) * scale,
  };
}

// Clear space to leave between two node circles, in on-screen pixels. A force
// layout only balances globally, so a dense cluster can still end up with
// overlapping circles once the graph is squeezed into the side panel.
const MIN_GAP = 9;

/**
 * Nudge apart any pair that would render closer than MIN_GAP. Works in layout
 * units, converting the pixel budget through `scale`, and leaves the overall
 * structure alone because it only ever corrects overlaps.
 */
function enforceSpacing(positions, nodes, t, scale, passes = 24) {
  const n = nodes.length;
  if (n < 2 || !(scale > 0)) return positions;

  const P = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const p = positions[nodes[i].id];
    P[i * 2]     = p ? p.x : 0;
    P[i * 2 + 1] = p ? p.y : 0;
  }
  const R = nodes.map(d => nodeStyle(d, t).r + 5);

  for (let pass = 0; pass < passes; pass++) {
    const cell = Math.max(20, 56 / scale);
    const grid = new Map();
    for (let i = 0; i < n; i++) {
      const k = `${Math.floor(P[i * 2] / cell)},${Math.floor(P[i * 2 + 1] / cell)}`;
      let c = grid.get(k);
      if (!c) grid.set(k, (c = []));
      c.push(i);
    }
    let corrections = 0;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(P[i * 2] / cell), cy = Math.floor(P[i * 2 + 1] / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const c = grid.get(`${cx + ox},${cy + oy}`);
          if (!c) continue;
          for (const j of c) {
            if (j === i) continue;
            let dx = P[i * 2] - P[j * 2], dy = P[i * 2 + 1] - P[j * 2 + 1];
            let d = Math.hypot(dx, dy);
            const minD = (R[i] + R[j] + MIN_GAP) / scale;
            if (d >= minD) continue;
            if (d < 1e-6) { dx = (i - j) || 1; dy = 0.5; d = Math.hypot(dx, dy); }
            const push = (minD - d) / 2 / d;
            P[i * 2]     += dx * push;
            P[i * 2 + 1] += dy * push;
            P[j * 2]     -= dx * push;
            P[j * 2 + 1] -= dy * push;
            corrections++;
          }
        }
      }
    }
    if (!corrections) break;
  }

  const out = {};
  for (let i = 0; i < n; i++) out[nodes[i].id] = { x: P[i * 2], y: P[i * 2 + 1] };
  return out;
}

function bboxOf(positions, nodes, t) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const p = positions[n.id];
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
}

/**
 * Pushing overlapping nodes apart also inflates the whole cloud, and the wider
 * cloud is then scaled down to fit, which re-creates the overlaps. Restoring
 * the original extent keeps the rearrangement local, so the fit scale holds
 * steady. The correction is uniform on both axes, so nodes stay circular.
 */
function matchExtent(positions, reference, nodes, t) {
  const b = bboxOf(positions, nodes, t);
  const r = bboxOf(reference, nodes, t);
  if (!b || !r) return positions;
  const k = Math.min(Math.max(Math.min(r.w / b.w, r.h / b.h), 0.9), 1.1);
  if (Math.abs(k - 1) < 0.005) return positions;
  const cx = (r.minX + r.maxX) / 2, cy = (r.minY + r.maxY) / 2;
  const bcx = (b.minX + b.maxX) / 2, bcy = (b.minY + b.maxY) / 2;
  const out = {};
  for (const n of nodes) {
    const p = positions[n.id];
    if (!p) continue;
    out[n.id] = { x: cx + (p.x - bcx) * k, y: cy + (p.y - bcy) * k };
  }
  return out;
}

/**
 * Widen or heighten the cloud so it matches the viewport's shape. The shifted
 * graph lives in a tall narrow column; without this a roughly square layout is
 * scaled down to fit the column's width and leaves most of the height empty.
 * Scaling x only (never both axes) keeps the final transform uniform, so nodes
 * stay circular.
 */
function matchAspect(positions, nodes, w, h) {
  if (!(w > 0) || !(h > 0) || !nodes.length) return positions;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const p = positions[n.id];
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) return positions;

  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);
  const k = Math.min(Math.max((w / h) / (bw / bh), 0.45), 2.2);
  if (Math.abs(k - 1) < 0.04) return positions;

  const cx = (minX + maxX) / 2;
  const out = {};
  for (const n of nodes) {
    const p = positions[n.id];
    if (!p) continue;
    out[n.id] = { x: cx + (p.x - cx) * k, y: p.y };
  }
  return out;
}

// ── Description panel ─────────────────────────────────────────────────────────

function getEdgeReason(edge, fromNode, toNode) {
  if (edge?.reason) return edge.reason;
  if (edge?.evidence) return edge.evidence;
  if (edge?.detail) return edge.detail;

  const fromName = fromNode?.label || fromNode?.canonical_handle || fromNode?.full_name || fromNode?.name || edge?.source || 'Source';
  const toName = toNode?.label || toNode?.canonical_handle || toNode?.full_name || toNode?.name || edge?.target || 'Target';
  const lbl = String(edge?.label || '').toUpperCase();

  if (lbl === 'COMMUNICATED_WITH' || lbl === 'COMMUNICATED' || lbl === 'CALLED') {
    const dur = edge?.duration ? ` (${edge.duration}s call)` : '';
    const tower = edge?.tower ? ` via cell tower ${edge.tower}` : '';
    return `Frequent telecommunications exchange detected between ${fromName} and ${toName}${dur}${tower}. Direct communications link indicates active operational coordination.`;
  }
  if (lbl === 'TRANSFERRED_FUNDS') {
    const amt = edge?.amount ? ` ₹${Number(edge.amount).toLocaleString('en-IN')}` : '';
    return `Financial transaction trail: Documented transfer of${amt} between ${fromName} and ${toName}. Structured transaction pattern characteristic of Hawala / money laundering conduit.`;
  }
  if (lbl === 'SEEN_TOGETHER') {
    const loc = edge?.location ? ` at ${edge.location}` : '';
    return `Physical surveillance sighting: ${fromName} and ${toName} were observed together in direct proximity${loc} during investigative monitoring.`;
  }
  if (lbl === 'INVOLVED_IN') {
    return `Official police incident report / FIR co-involvement: Links ${fromName} and ${toName} in documented criminal offence record.`;
  }
  if (lbl === 'CORRELATED_WITH') {
    const pct = edge?.confidence ? ` (confidence: ${Math.round(edge.confidence * 100)}%)` : '';
    return `Cross-source entity correlation${pct}: Behavioral and multi-identifier overlap identifies ${fromName} and ${toName} as affiliated operating nodes.`;
  }
  if (lbl === 'OWNS_VEHICLE' || lbl === 'DRIVES_VEHICLE') {
    return `Vehicle transport intelligence: Documented ownership, driver sighting, or transit registry associating ${fromName} with ${toName}.`;
  }
  if (lbl === 'WORKS_FOR' || lbl === 'ASSOCIATED_WITH' || lbl === 'PART_OF') {
    return `Organizational network linkage: Demonstrates operational affiliation, subordinate role, or organizational membership between ${fromName} and ${toName}.`;
  }
  if (lbl === 'VISITED' || lbl === 'OBSERVED_AT') {
    return `Geographic presence: Sighting and location log connecting ${fromName} to ${toName}.`;
  }
  return `Documented relationship (${lbl.toLowerCase().replace(/_/g, ' ')}) between ${fromName} and ${toName} extracted from case intelligence sources.`;
}

function EdgeDescPanel({ edge, fromNode, toNode, caseId, user, t }) {
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(true);

  const fromName = fromNode?.label || fromNode?.canonical_handle || fromNode?.full_name || fromNode?.name || edge?.source;
  const toName = toNode?.label || toNode?.canonical_handle || toNode?.full_name || toNode?.name || edge?.target;
  const edgeKey = edge?.id || `${edge?.source}_${edge?.target}_${edge?.label}`;
  const reason = getEdgeReason(edge, fromNode, toNode);
  const style = edgeStyle(edge, t);

  const loadNotes = useCallback(async () => {
    try {
      setLoadingNotes(true);
      const res = await api.getNotes(caseId, edgeKey);
      setNotes(res?.notes || []);
    } catch {
      setNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  }, [caseId, edgeKey]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const fullNoteContent = `Correlated Parties: ${fromName} ↔ ${toName}\nCorrelation Reason: ${reason}\n\nInvestigator Observation:\n${noteText.trim()}`;
      await api.addNote(caseId, {
        entity_type: 'RELATIONSHIP',
        entity_id: edgeKey,
        entity_label: `${fromName} ↔ ${toName} (${edge.label || 'LINK'})`,
        note_text: fullNoteContent,
        investigator_id: user?.id || 'investigator_1',
      });
      setNoteText('');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      loadNotes();
    } catch (err) {
      alert('Failed to save note: ' + err.message);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <motion.div
      key={edgeKey}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={{ padding: '24px' }}
    >
      {/* Header Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 6,
          background: (style.color || '#4F46E5') + '18', border: `1px solid ${(style.color || '#4F46E5')}50`,
          color: style.color || '#4F46E5', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em'
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: style.color || '#4F46E5' }} />
          {style.label || edge.label}
        </span>
        {edge.confidence && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
            Confidence: {Math.round(edge.confidence * 100)}%
          </span>
        )}
      </div>

      {/* Correlated Parties Cards */}
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '14px', marginBottom: 20
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Correlated Entities
        </div>

        {/* Party A */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: nodeStyle(fromNode, t).color,
            color: '#fff', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>A</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fromName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {nodeStyle(fromNode, t).label} {fromNode?.role ? `· ${fromNode.role}` : ''}
            </div>
          </div>
        </div>

        {/* Link arrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, margin: '6px 0', color: style.color, fontSize: 11, fontWeight: 600 }}>
          <div style={{ width: 2, height: 16, background: style.color, opacity: 0.6 }} />
          <span>{edge.label ? edge.label.replace(/_/g, ' ') : 'connected to'}</span>
        </div>

        {/* Party B */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: nodeStyle(toNode, t).color,
            color: '#fff', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>B</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {toName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {nodeStyle(toNode, t).label} {toNode?.role ? `· ${toNode.role}` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Correlation Reason & Evidence */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Why They Are Correlated
        </div>
        <div style={{
          fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5,
          background: 'var(--bg-card)', padding: '12px 14px', borderRadius: 6,
          border: '1px solid var(--border)', borderLeft: `3px solid ${style.color || '#4F46E5'}`
        }}>
          {reason}
        </div>
      </div>

      {/* Metadata fields */}
      {(edge.platform || edge.provenance || edge.timestamp || edge.amount) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border)' }}>
          {edge.platform && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Platform / Channel</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{edge.platform}</span>
            </div>
          )}
          {edge.amount && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Transaction Amount</span>
              <span style={{ fontWeight: 600, color: '#DC2626' }}>₹{Number(edge.amount).toLocaleString('en-IN')}</span>
            </div>
          )}
          {edge.timestamp && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Observed Time</span>
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{edge.timestamp}</span>
            </div>
          )}
          {edge.provenance && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Provenance</span>
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{edge.provenance}</span>
            </div>
          )}
        </div>
      )}

      {/* Investigator Notes & Annotation Form */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            Investigator Field Note
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Included in final report
          </span>
        </div>

        <form onSubmit={handleSaveNote}>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={`Document findings or hypothesis regarding ${fromName} and ${toName}...`}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', fontSize: 12, borderRadius: 6,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', resize: 'vertical',
              marginBottom: 10, fontFamily: 'inherit'
            }}
          />
          <button
            type="submit"
            disabled={savingNote || !noteText.trim()}
            className="btn btn-primary btn-sm"
            style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
          >
            {savingNote ? 'Saving Note to Dossier...' : 'Save Note to Dossier & Report'}
          </button>
        </form>

        {savedSuccess && (
          <div style={{ marginTop: 8, padding: '7px 12px', borderRadius: 4, background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 600 }}>
            ✓ Note saved! Included in case dossier & final export.
          </div>
        )}

        {/* Existing Notes for this Edge */}
        {notes.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>
              Recorded Notes ({notes.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notes.map(n => (
                <div key={n.note_id} style={{
                  padding: '10px 12px', borderRadius: 6,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  fontSize: 12
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)', fontSize: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{n.investigator_id}</span>
                    <span>{(n.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                    {n.note_text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function DescPanel({ node, t }) {
  if (!node) return (
    <div style={{ padding: '28px 24px', color: 'var(--text-tertiary)', fontSize: 14, textAlign: 'center' }}>
      {t.clickNode}
    </div>
  );

  const cfg = nodeStyle(node, t);

  const fields = [
    [t.gType || 'Type',        cfg.label],
    ['Full Name',              node.full_name],
    ['Role / Title',           node.role],
    ['Group / Affiliation',    node.affiliation],
    ['Primary Phone',          node.phone],
    ['Vehicle',                node.vehicle || node.plate],
    ['Make / Model',           node.make_model],
    ['Organization',           node.org || node.name],
    ['Org Type',               node.org_type || node.type],
    ['Aliases',                node.aliases],
    ['Address / City',         node.address || node.city],
    ['FIR Number',             node.fir_number],
    ['Police Station',         node.police_station],
    ['Offence Type',           node.incident_type],
    [t.source,                 node.source || node.provenance],
    [t.platform,               node.platform],
    [t.lastScan,               node.last_scan || node.last_seen],
    [t.gValue,                 node.value],
    [t.gCategory,              node.category || node.threat_type],
    [t.confidence,             node.confidence],
  ].filter(([, v]) => v);

  return (
    <motion.div
      key={node.id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={{ padding: '24px' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: cfg.color + '20',
          border: `2px solid ${cfg.color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: cfg.color }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.2, wordBreak: 'break-word' }}>
            {node.label || node.canonical_handle || node.id}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{cfg.label}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {fields.map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-all', fontFamily: typeof val === 'string' && val.length > 20 ? 'var(--font-mono)' : 'inherit' }}>
              {val}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend({ nodes, edges, t }) {
  // Grouped on the i18n key rather than the rendered label, so counts stay
  // correct and the legend re-renders when the language changes.
  const nodeKinds = useMemo(() => {
    const m = new Map();
    for (const n of nodes) {
      const s = nodeStyle(n, t);
      const k = s.key || s.label;
      const prev = m.get(k);
      if (prev) prev.count++;
      else m.set(k, { count: 1, label: s.label, color: s.color });
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [nodes, t]);

  const edgeKinds = useMemo(() => {
    const m = new Map();
    for (const e of edges) {
      const s = edgeStyle(e, t);
      const k = s.key || s.label;
      const prev = m.get(k);
      if (prev) prev.count++;
      else m.set(k, { count: 1, label: s.label, color: s.color, dash: s.dash });
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [edges, t]);

  return (
    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, pointerEvents: 'none' }}>
      <div className="card" style={{ padding: '10px 12px', maxWidth: 190, pointerEvents: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
          {t.entityTypes}
        </div>
        {nodeKinds.map(([key, { count, label, color }]) => {
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{label}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{count}</span>
            </div>
          );
        })}
        {edgeKinds.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '8px 0 6px' }}>
              {t.relationships}
            </div>
            {edgeKinds.map(([key, { count, label, color, dash }]) => {
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>
                  <span style={{ width: 12, height: 0, borderTop: `2px ${dash ? 'dashed' : 'solid'} ${color}`, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{label}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{count}</span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main graph screen ─────────────────────────────────────────────────────────
export default function GraphScreen({ caseData, user, onDone }) {
  const { t } = useLang();
  const [graphData, setGraphData]     = useState({ nodes: [], edges: [] });
  const [loadingGraph, setLoadingGraph] = useState(true);
  const [loadError, setLoadError]    = useState(false);
  const [shifted, setShifted]         = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [hoveredEdge, setHoveredEdge]   = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [showAllLabels, setShowAllLabels] = useState(true);
  const [zoom, setZoom]               = useState(1);
  const [pan, setPan]                 = useState({ x: 0, y: 0 });
  const [dragging, setDragging]       = useState(null);
  const [size, setSize] = useState({ w: 600, h: 500 });
  const wrapRef = useRef(null);

  // Fetch graph
  useEffect(() => {
    let cancelled = false;
    let shiftTimer = null;
    setLoadingGraph(true);
    setLoadError(false);
    api.getGraph(caseData.case_id)
      .then(data => {
        if (cancelled) return;
        let rawNodes = data?.nodes || data?.graph?.nodes || [];
        let rawEdges = data?.edges || data?.graph?.edges || data?.links || [];

        // Normalize Cytoscape-format: { data: { id, type, label, ... } } -> flat
        rawNodes = rawNodes.map(n => (n.data ? { ...n.data } : n));
        rawEdges = rawEdges.map(e => (e.data ? { ...e.data } : e));

        // Cap for rendering performance, preferring the most-connected nodes so
        // the visible graph is the informative part of the investigation.
        if (rawNodes.length > 300) {
          const degree = new Map();
          rawEdges.forEach(e => {
            degree.set(e.source, (degree.get(e.source) || 0) + 1);
            degree.set(e.target, (degree.get(e.target) || 0) + 1);
          });
          rawNodes = [...rawNodes]
            .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
            .slice(0, 300);
          const nodeIds = new Set(rawNodes.map(n => n.id));
          rawEdges = rawEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)).slice(0, 600);
        }

        setGraphData({ nodes: rawNodes, edges: rawEdges });
        setLoadingGraph(false);
        // Auto-shift to top-right after generation (flow.md step 4)
        shiftTimer = setTimeout(() => { if (!cancelled) setShifted(true); }, 1200);
      })
      .catch(() => {
        if (cancelled) return;
        setGraphData({ nodes: [], edges: [] });
        shiftTimer = setTimeout(() => { if (!cancelled) { setLoadError(true); setLoadingGraph(false); } }, 600);
      });
    return () => { cancelled = true; if (shiftTimer) clearTimeout(shiftTimer); };
  }, [caseData.case_id]);

  // One deterministic layout pass, recomputed only when the data changes.
  // Simulate once per dataset, then reshape for whatever space the graph
  // currently has. The viewport changes shape when the panel shifts, so the
  // spacing pass and the fit are redone whenever the size changes.
  const layout = useMemo(() => {
    const raw = simulate(graphData.nodes, graphData.edges);
    if (!graphData.nodes.length) {
      return { positions: raw, fit: { scale: 1, tx: 0, ty: 0 } };
    }
    const shaped = matchAspect(raw, graphData.nodes, size.w, size.h);
    // Spreading the nodes enlarges the bounding box, which makes the fitting
    // scale shrink and quietly undo part of the separation. So alternate until
    // the scale settles; the gaps are then measured in the scale actually used
    // to render, and no pair can end up overlapping.
    let positions = shaped;
    let fit = fitTransform(positions, graphData.nodes, size.w, size.h, t);
    for (let pass = 0; pass < 3; pass++) {
      const spaced = enforceSpacing(positions, graphData.nodes, t, fit.scale);
      const next = matchExtent(spaced, positions, graphData.nodes, t);
      const nextFit = fitTransform(next, graphData.nodes, size.w, size.h, t);
      const settled = Math.abs(nextFit.scale - fit.scale) < fit.scale * 0.002;
      positions = next;
      fit = nextFit;
      if (settled) break;
    }
    return { positions, fit };
  }, [graphData.nodes, graphData.edges, size.w, size.h, t]);

  const positions = layout.positions;
  const fit = layout.fit;
  const scale = fit.scale * zoom;

  const nodeMap = useMemo(() => new Map(graphData.nodes.map(n => [String(n.id), n])), [graphData.nodes]);
  const selectedEdgeNodes = useMemo(() => {
    if (!selectedEdge) return null;
    return new Set([String(selectedEdge.source || selectedEdge.from), String(selectedEdge.target || selectedEdge.to)]);
  }, [selectedEdge]);

  // Responsive size. The auto-shift animates the viewport width, which makes
  // ResizeObserver report intermediate (and occasionally non-finite) rects, so
  // only accept sane measurements and keep the last good size otherwise.
  useEffect(() => {
    const ob = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const width  = Number(rect.width);
      const height = Number(rect.height);
      if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) return;
      setSize(prev => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    });
    if (wrapRef.current) ob.observe(wrapRef.current);
    return () => ob.disconnect();
  }, []);

  const onMouseDown = useCallback(e => {
    // The hit circle is a child of the [data-node] group, so testing
    // e.target.dataset.node missed it and a node click also started a pan.
    const hit = e.target.closest && e.target.closest('[data-node]');
    if (hit) return;
    setDragging({ sx: e.clientX - pan.x, sy: e.clientY - pan.y });
  }, [pan]);
  const onMouseMove = useCallback(e => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragging.sx, y: e.clientY - dragging.sy });
  }, [dragging]);
  const onMouseUp = useCallback(() => setDragging(null), []);
  const onWheel   = useCallback(e => {
    e.preventDefault();
    setZoom(z => Math.min(4, Math.max(0.3, z * (e.deltaY < 0 ? 1.12 : 0.89))));
  }, []);

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  // Hovering focuses a node just like selecting it does, so the graph can be
  // explored without committing to a selection.
  const focusedId = selectedNode?.id || hoveredId;
  const focusedNode = useMemo(
    () => (focusedId ? graphData.nodes.find(n => n.id === focusedId) || null : null),
    [focusedId, graphData.nodes],
  );

  // Edges touching the focused node, so the relationship types are readable.
  const incidentEdges = useMemo(() => {
    if (!focusedId) return null;
    return new Set(
      graphData.edges
        .filter(e => e.source === focusedId || e.target === focusedId)
        .map(e => `${e.source}|${e.target}|${e.label}`),
    );
  }, [focusedId, graphData.edges]);

  // Neighbours of the focused node keep their labels so a relationship can be
  // read without clicking through everything.
  const labelledIds = useMemo(() => {
    if (!focusedId) return null;
    const set = new Set([focusedId]);
    for (const e of graphData.edges) {
      if (e.source === focusedId) set.add(e.target);
      else if (e.target === focusedId) set.add(e.source);
    }
    return set;
  }, [focusedId, graphData.edges]);

  // In the narrow side panel the fit scale is small, so blanket labels would
  // be unreadable clutter; they come back as soon as there is room (or when
  // the user asks for them).
  const showLabels = showAllLabels && scale > 0.34;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', padding: '0 24px',
        height: 68, background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <img
            src="/logo.png"
            alt="Sutradhar Logo"
            style={{ height: 50, width: 'auto', objectFit: 'contain' }}
          />
          <div style={{ width: 1, height: 26, background: 'var(--border)' }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>{caseData.name}</div>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t.graphTitle}</span>
        <LangToggle />
        <button className="btn btn-primary" onClick={onDone} id="open-workspace-btn">
          {t.gOpenWorkspace || 'Open Workspace'} →
        </button>
      </header>

      {/* Body — graph left/top-right + panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Graph viewport — animates to top-right */}
        <motion.div
          animate={shifted ? {
            position: 'absolute',
            top: 0, right: 0,
            // 70% of the row, mirroring the description panel's 30%.
            width: '70%',
            height: '100%',
          } : {
            position: 'relative',
            width: '100%',
            height: '100%',
          }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: 'var(--bg)',
            borderLeft: shifted ? '1px solid var(--border)' : 'none',
          }}
        >
          <div id="graph-canvas-wrap" ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            {/* Focus chip -- names the hovered/selected entity */}
            {focusedNode && (
              <div style={{
                position: 'absolute', bottom: 36, left: 12, zIndex: 3, pointerEvents: 'none',
                display: 'flex', alignItems: 'center', gap: 8, maxWidth: 'calc(100% - 24px)',
                padding: '7px 11px', borderRadius: 8,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                boxShadow: '0 2px 10px rgba(15,23,42,0.10)',
              }}>
                <span style={{
                  width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                  background: nodeStyle(focusedNode, t).color,
                }} />
                <span style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {(focusedNode.label || focusedNode.canonical_handle || focusedNode.id || '').slice(0, 26)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                  {nodeStyle(focusedNode, t).label}
                </span>
              </div>
            )}
            {/* Dot grid */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.4, pointerEvents: 'none' }}>
              <defs>
                <pattern id="dots-g" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="12" cy="12" r="0.7" fill="#CBD5E1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#dots-g)" />
            </svg>

            {/* Controls Toolbar with Recentre Graph button */}
            <div style={{
              position: 'absolute', top: 12, left: 12,
              display: 'flex', alignItems: 'center', gap: 6, zIndex: 10,
              background: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'blur(8px)',
              padding: '4px 6px', borderRadius: 8, border: '1px solid var(--border)',
              boxShadow: '0 2px 10px rgba(15,23,42,0.10)'
            }}>
              <button
                onClick={() => setZoom(z => Math.min(4, z * 1.2))}
                className="btn btn-ghost btn-sm"
                title="Zoom In"
                style={{ width: 28, height: 28, padding: 0, justifyContent: 'center', fontSize: 15, fontWeight: 700 }}
              >
                +
              </button>
              <button
                onClick={() => setZoom(z => Math.max(0.3, z / 1.2))}
                className="btn btn-ghost btn-sm"
                title="Zoom Out"
                style={{ width: 28, height: 28, padding: 0, justifyContent: 'center', fontSize: 15, fontWeight: 700 }}
              >
                −
              </button>
              <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
              <button
                id="recentre-graph-btn"
                onClick={resetView}
                className="btn btn-ghost btn-sm"
                title="Recentre and fit graph to viewport"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', fontSize: 12, fontWeight: 600,
                  color: 'var(--text-primary)', height: 28
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                  <line x1="12" y1="2" x2="12" y2="5" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="5" y2="12" />
                  <line x1="19" y1="12" x2="22" y2="12" />
                </svg>
                Recentre Graph
              </button>
              <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
              <button
                onClick={() => setShowAllLabels(v => !v)}
                className="btn btn-ghost btn-sm"
                title={showAllLabels ? (t.gHideLabels || 'Hide labels') : (t.gShowLabels || 'Show labels')}
                aria-pressed={showAllLabels}
                style={{
                  width: 28, height: 28, padding: 0, justifyContent: 'center', fontSize: 11, fontWeight: 600,
                  color: showAllLabels ? 'var(--accent)' : 'var(--text-tertiary)',
                }}
              >
                Aa
              </button>
            </div>

            {/* Legend */}
            {!loadingGraph && graphData.nodes.length > 0 && (
              <Legend nodes={graphData.nodes} edges={graphData.edges} t={t} />
            )}

            {/* Stats */}
            {!loadingGraph && graphData.nodes.length > 0 && (
              <div style={{ position: 'absolute', bottom: 12, left: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
                {graphData.nodes.length} {t.nodes} | {graphData.edges.length} {t.edges}
              </div>
            )}

            {/* SVG canvas */}
            <svg
              style={{ width: '100%', height: '100%', cursor: dragging ? 'grabbing' : 'grab' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onWheel={onWheel}
            >
              <g transform={`translate(${fit.tx + pan.x},${fit.ty + pan.y}) scale(${fit.scale * zoom})`}>
                {/* Edges */}
                {graphData.edges.map((edge, i) => {
                  const fromId = String(edge.source || edge.from);
                  const toId   = String(edge.target || edge.to);
                  const f      = positions[fromId];
                  const to     = positions[toId];
                  if (!f || !to) return null;
                  const style  = edgeStyle(edge, t);
                  const key    = `${fromId}|${toId}|${edge.label}`;
                  const isIncident = incidentEdges?.has(key);
                  const isSelectedEdge = selectedEdge && (
                    (selectedEdge.id && selectedEdge.id === edge.id) ||
                    (String(selectedEdge.source || selectedEdge.from) === fromId && String(selectedEdge.target || selectedEdge.to) === toId && selectedEdge.label === edge.label) ||
                    (String(selectedEdge.source || selectedEdge.from) === toId && String(selectedEdge.target || selectedEdge.to) === fromId && selectedEdge.label === edge.label)
                  );
                  const isHoveredEdge = hoveredEdge && (
                    (hoveredEdge.id && hoveredEdge.id === edge.id) ||
                    (String(hoveredEdge.source || hoveredEdge.from) === fromId && String(hoveredEdge.target || hoveredEdge.to) === toId) ||
                    (String(hoveredEdge.source || hoveredEdge.from) === toId && String(hoveredEdge.target || hoveredEdge.to) === fromId)
                  );
                  const midX = (f.x + to.x) / 2;
                  const midY = (f.y + to.y) / 2;
                  const showEdgeLabel = isIncident || isSelectedEdge || isHoveredEdge || (showAllLabels && graphData.edges.length < 40);

                  return (
                    <g key={edge.id || key} data-edge="1">
                      {/* Invisible wider hitbox for easy clicking */}
                      <line
                        x1={f.x} y1={f.y} x2={to.x} y2={to.y}
                        stroke="transparent"
                        strokeWidth={16 / Math.max(scale, 0.35)}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEdge(isSelectedEdge ? null : edge);
                          setSelectedNode(null);
                          if (!shifted) setShifted(true);
                        }}
                        onMouseEnter={() => setHoveredEdge(edge)}
                        onMouseLeave={() => setHoveredEdge(null)}
                      />
                      {/* Visible relationship line */}
                      <line
                        x1={f.x} y1={f.y} x2={to.x} y2={to.y}
                        stroke={isSelectedEdge ? '#2563EB' : isHoveredEdge ? style.color : style.color}
                        strokeWidth={(isSelectedEdge ? 3.2 : isHoveredEdge ? 2.2 : isIncident ? 2.2 : 1.1) / Math.max(scale, 0.35)}
                        strokeOpacity={selectedEdge ? (isSelectedEdge ? 1 : 0.12) : incidentEdges ? (isIncident ? 0.95 : 0.07) : isHoveredEdge ? 1 : 0.55}
                        strokeDasharray={style.dash || undefined}
                        strokeLinecap="round"
                        style={{ pointerEvents: 'none', transition: 'stroke-width 150ms, stroke-opacity 150ms' }}
                      />
                      {showEdgeLabel && (
                        <text
                          x={midX} y={midY - 6 / Math.max(scale, 0.35)}
                          textAnchor="middle"
                          fontSize={(isSelectedEdge ? 12 : 10) / Math.max(scale, 0.35)}
                          fontWeight={isSelectedEdge || isHoveredEdge ? 700 : 600}
                          fill={isSelectedEdge ? '#1D4ED8' : style.color}
                          stroke="#F8F7F5" strokeWidth={3 / Math.max(scale, 0.35)}
                          paintOrder="stroke"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          {style.label || edge.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Nodes */}
                {graphData.nodes.map(node => {
                  const pos = positions[node.id];
                  if (!pos) return null;
                  const cfg  = nodeStyle(node, t);
                  const isSelected = selectedNode?.id === node.id;
                  const isHovered  = hoveredId === node.id;
                  const isFocused  = isSelected || isHovered;
                  const dimmed     = Boolean(labelledIds) && !labelledIds.has(node.id);
                  // Keep the pointer target at least ~11px on screen even when
                  // the fit scale is small, so nodes stay easy to hit in the
                  // narrow panel.
                  const hitR = Math.max(cfg.r, 11 / Math.max(scale, 0.2));
                  const showNodeLabel = (showLabels || labelledIds?.has(node.id)) && !dimmed;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x},${pos.y})`}
                      data-node="1"
                      style={{ cursor: 'pointer' }}
                      onClick={() => { setSelectedNode(isSelected ? null : node); setSelectedEdge(null); }}
                      onMouseEnter={() => setHoveredId(node.id)}
                      onMouseLeave={() => setHoveredId(cur => (cur === node.id ? null : cur))}
                    >
                      <circle r={hitR} fill="transparent" />
                      {isFocused && (
                        <circle
                          r={cfg.r + 4} fill="none" stroke={cfg.color}
                          strokeWidth={1.5} strokeOpacity={0.45}
                        />
                      )}
                      <circle
                        r={cfg.r + (isSelected ? 3 : 0)}
                        fill={cfg.color}
                        fillOpacity={dimmed ? 0.2 : isSelected ? 1 : 0.88}
                        stroke={isSelected ? '#FFFFFF' : cfg.color}
                        strokeWidth={(isSelected ? 2 : 1) / Math.max(scale, 0.35)}
                        style={{ transition: 'r 150ms, fill-opacity 150ms' }}
                      />
                      {showNodeLabel && (
                        <text
                          y={cfg.r + 13 / Math.max(scale, 0.35)}
                          textAnchor="middle"
                          fontSize={(isFocused ? 11 : 9) / Math.max(scale, 0.45)}
                          fontWeight={isFocused ? 600 : 400}
                          fill={isFocused ? '#0F172A' : '#475569'}
                          stroke="#F8F7F5" strokeWidth={2.5 / Math.max(scale, 0.45)}
                          paintOrder="stroke"
                          fontFamily="Inter, sans-serif"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          {(node.label || node.canonical_handle || node.id || '').slice(0, 18)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Loading spinner */}
            {loadingGraph && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
              }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  style={{ width: 28, height: 28, border: '3px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%' }}
                />
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t.generating}</span>
              </div>
            )}

            {/* Empty / error state — never leave a blank canvas */}
            {!loadingGraph && graphData.nodes.length === 0 && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, textAlign: 'center',
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {loadError ? (t.graphLoadFailed || 'Could not load the graph') : (t.graphEmpty || 'No graph data yet')}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', maxWidth: 320, lineHeight: 1.6 }}>
                  {loadError
                    ? (t.graphLoadFailedBody || 'The graph could not be fetched. Check that the backend is running, then try again.')
                    : (t.graphEmptyBody || 'Ingest data and run correlation to build the relationship graph for this investigation.')}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={onDone} style={{ marginTop: 6 }}>
                  {t.backToWorkspace || 'Back to workspace'}
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Description panel — appears as graph shifts */}
        <AnimatePresence>
          {shifted && (
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: '30%',
                height: '100%',
                overflowY: 'auto',
                background: 'var(--bg-card)',
                borderRight: '1px solid var(--border)',
              }}
            >
              {/* Panel header */}
              <div style={{
                padding: '18px 24px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                    {selectedEdge ? 'Correlation Intelligence' : selectedNode ? t.selected : t.graphTitle}
                  </div>
                  {!selectedNode && !selectedEdge && (
                    <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {t.graphReady} · {graphData.nodes.length} {t.nodes}, {graphData.edges.length} {t.edges}
                    </div>
                  )}
                  {selectedEdge && (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      Inspect link rationale & attach dossier notes
                    </div>
                  )}
                </div>
                {(selectedNode || selectedEdge) && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setSelectedNode(null); setSelectedEdge(null); }}
                    style={{ fontSize: 11, padding: '3px 8px' }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {selectedEdge ? (
                <EdgeDescPanel
                  edge={selectedEdge}
                  fromNode={nodeMap.get(String(selectedEdge.source || selectedEdge.from))}
                  toNode={nodeMap.get(String(selectedEdge.target || selectedEdge.to))}
                  caseId={caseData.case_id}
                  user={user}
                  t={t}
                />
              ) : (
                <DescPanel
                  node={selectedNode}
                  t={t}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
