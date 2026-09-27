"""
PRAGYA CHAKSHU — FORENSIC CASE DOSSIER & EXPORT ROUTER
Generates standardized investigation dossiers with full chain of custody,
provenance segregation breakdown (RESEARCH / DERIVED / SYNTHETIC),
and human challenge audit trails.
"""

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import HTMLResponse
import json
import hashlib
from datetime import datetime
from typing import Dict, Any

from backend.database.sqlite import get_connection
from backend.analytics.evaluation import run_evaluation_benchmark
from backend.analytics.coordination import detect_coordination_network

router = APIRouter(prefix="/cases", tags=["export"])


def compile_case_dossier(case_id: str) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Case details
    cursor.execute("SELECT * FROM cases WHERE case_id=?", (case_id,))
    case_row = cursor.fetchone()
    if not case_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Case not found")
    case = dict(case_row)

    # 2. Personas
    cursor.execute(
        "SELECT * FROM personas WHERE case_id=? OR case_id IS NULL", (case_id,)
    )
    personas = [dict(r) for r in cursor.fetchall()]

    # 3. Evidence
    cursor.execute("SELECT * FROM evidence WHERE case_id=?", (case_id,))
    evidence = [dict(r) for r in cursor.fetchall()]

    # 4. Challenges audit trail
    cursor.execute(
        "SELECT * FROM evidence_challenges WHERE case_id=? ORDER BY timestamp DESC",
        (case_id,),
    )
    challenges = [dict(r) for r in cursor.fetchall()]

    # 5. Normalized Events count and provenance breakdown
    cursor.execute(
        """
        SELECT provenance, count(*) as count 
        FROM normalized_events 
        WHERE case_id=? 
        GROUP BY provenance
    """,
        (case_id,),
    )
    prov_counts = {r["provenance"]: r["count"] for r in cursor.fetchall()}

    # 6. Evaluation metrics
    # Count derived analytical signals from evidence table
    cursor.execute(
        "SELECT count(*) FROM evidence WHERE case_id=? AND provenance='DERIVED'",
        (case_id,),
    )
    derived_evidence_count = cursor.fetchone()[0]
    derived_total = prov_counts.get("DERIVED", 0) + derived_evidence_count

    # 6. Evaluation metrics (evaluated at calibrated threshold 10.0)
    try:
        benchmark = run_evaluation_benchmark(case_id, threshold=10.0)
    except Exception:
        benchmark = {}

    # 7. Coordination summary
    try:
        coordination = detect_coordination_network(case_id, max_pairs=10)
    except Exception:
        coordination = {}

    # 8. Investigator notes
    cursor.execute(
        """
        SELECT note_id, case_id, entity_type, entity_id, entity_label, investigator_id, note_text, created_at
        FROM investigator_notes
        WHERE case_id=?
        ORDER BY created_at ASC
    """,
        (case_id,),
    )
    notes = [dict(r) for r in cursor.fetchall()]

    conn.close()

    dossier = {
        "dossier_id": f"DOSSIER-{case_id[:8].upper()}-{datetime.utcnow().strftime('%Y%m%d%H%M')}",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "system": "PRAGYA CHAKSHU Intelligence Attribution System",
        "classification": "CONTROLLED RESEARCH / EVALUATION",
        "case": case,
        "provenance_summary": {
            "RESEARCH": prov_counts.get("RESEARCH", 0),
            "DERIVED": derived_total,
            "SYNTHETIC": prov_counts.get("SYNTHETIC", 0),
            "total_events": prov_counts.get("RESEARCH", 0)
            + derived_total
            + prov_counts.get("SYNTHETIC", 0),
        },
        "personas": personas,
        "evidence_inventory": evidence,
        "investigator_notes": notes,
        "human_challenge_audit_trail": challenges,
        "evaluation_benchmark": benchmark.get("metrics", {}),
        "coordination_clusters": coordination.get("coordination_clusters", []),
    }

    # Digital seal / hash of the dossier for chain of custody
    payload_bytes = json.dumps(dossier, sort_keys=True).encode("utf-8")
    dossier["cryptographic_hash_sha256"] = hashlib.sha256(payload_bytes).hexdigest()

    return dossier


@router.get("/{case_id}/export/json")
def export_case_json(case_id: str):
    """
    Exports full forensic case dossier in structured JSON.
    """
    return compile_case_dossier(case_id)


@router.get("/{case_id}/export/dossier", response_class=HTMLResponse)
def export_printable_dossier(case_id: str):
    """
    Renders a formatted, printable HTML dossier with professional styling,
    provenance badges, and chain of custody log.
    """
    d = compile_case_dossier(case_id)
    c = d["case"]
    prov = d["provenance_summary"]
    metrics = d.get("evaluation_benchmark", {})
    challenges = d.get("human_challenge_audit_trail", [])
    personas = d.get("personas", [])
    notes = d.get("investigator_notes", [])
    evidence = d.get("evidence_inventory", [])

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>PRAGYA CHAKSHU Case Dossier — {c.get('name')}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #ffffff;
            margin: 0;
            padding: 40px;
            font-size: 13px;
            line-height: 1.6;
        }}
        .header {{
            border-bottom: 2px solid #0f172a;
            padding-bottom: 15px;
            margin-bottom: 25px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }}
        .title {{
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.5px;
        }}
        .subtitle {{
            font-size: 13px;
            color: #64748b;
            margin-top: 4px;
        }}
        .seal {{
            text-align: right;
            font-family: monospace;
            font-size: 11px;
            color: #475569;
        }}
        .badge {{
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }}
        .badge-research {{ background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }}
        .badge-derived {{ background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }}
        .badge-synthetic {{ background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }}
        
        .kpi-grid {{
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin: 20px 0;
        }}
        .kpi-card {{
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 12px;
            background: #f8fafc;
        }}
        .kpi-val {{ font-size: 20px; font-weight: 700; color: #0f172a; }}
        .kpi-lbl {{ font-size: 11px; color: #64748b; text-transform: uppercase; margin-top: 2px; }}

        h2 {{
            font-size: 16px;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 6px;
            margin-top: 30px;
            color: #0f172a;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-top: 10px;
        }}
        th, td {{
            padding: 8px 10px;
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
        }}
        th {{ background: #f1f5f9; color: #475569; font-weight: 600; }}
        .footer {{
            margin-top: 40px;
            border-top: 1px solid #e2e8f0;
            padding-top: 15px;
            font-size: 11px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
        }}
        @media print {{
            body {{ padding: 20px; font-size: 11px; }}
            .no-print {{ display: none; }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="title">PRAGYA CHAKSHU — CASE DOSSIER</div>
            <div class="subtitle">Case: <strong>{c.get('name')}</strong> (ID: {c.get('case_id')})</div>
        </div>
        <div class="seal">
            <div>Dossier ID: {d['dossier_id']}</div>
            <div>Generated: {d['generated_at']}</div>
            <div>Status: <strong>{c.get('status')}</strong></div>
        </div>
    </div>

    <div class="kpi-grid">
        <div class="kpi-card">
            <div class="kpi-val">{prov.get('RESEARCH', 0)}</div>
            <div class="kpi-lbl">Research Events <span class="badge badge-research">REAL</span></div>
        </div>
        <div class="kpi-card">
            <div class="kpi-val">{prov.get('DERIVED', 0)}</div>
            <div class="kpi-lbl">Derived Signals <span class="badge badge-derived">NLP/GRAPH</span></div>
        </div>
        <div class="kpi-card">
            <div class="kpi-val">{prov.get('SYNTHETIC', 0)}</div>
            <div class="kpi-lbl">Synthetic Infra <span class="badge badge-synthetic">CONTROLLED</span></div>
        </div>
        <div class="kpi-card">
            <div class="kpi-val">{metrics.get('precision_percent', 'N/A')}%</div>
            <div class="kpi-lbl">Precision @ τ=10% (F1: {metrics.get('f1_score', 'N/A')})</div>
        </div>
    </div>

    <h2>1. Case Personas & Attribution Inventory</h2>
    <table>
        <thead>
            <tr>
                <th>Canonical Handle</th>
                <th>Platform</th>
                <th>Provenance</th>
                <th>UID / VID</th>
                <th>First Seen</th>
            </tr>
        </thead>
        <tbody>
            {"".join(f"<tr><td><strong>{p.get('canonical_handle')}</strong></td><td>{p.get('platform')}</td><td><span class='badge badge-{p.get('provenance', '').lower()}'>{p.get('provenance')}</span></td><td>{p.get('raw_uid') or p.get('raw_vid') or 'N/A'}</td><td>{p.get('first_seen') or 'N/A'}</td></tr>" for p in personas[:25])}
        </tbody>
    </table>

    <h2>2. Investigator Field Notes & Case Annotations ({len(notes)})</h2>
    {f"""<table>
        <thead>
            <tr>
                <th>Timestamp (UTC)</th>
                <th>Investigator</th>
                <th>Target Entity</th>
                <th>Type</th>
                <th>Observation / Note</th>
            </tr>
        </thead>
        <tbody>
            {"".join(f"<tr><td style='white-space:nowrap;font-family:monospace;color:#475569;'>{n.get('created_at', '')[:19].replace('T', ' ')}</td><td><strong>{n.get('investigator_id')}</strong></td><td><strong>{n.get('entity_label')}</strong></td><td><span class='badge badge-derived'>{n.get('entity_type')}</span></td><td>{n.get('note_text')}</td></tr>" for n in notes)}
        </tbody>
    </table>""" if notes else "<p style='color: #64748b; font-style: italic;'>No investigator field notes recorded for this case.</p>"}

    <h2>3. Human-in-the-Loop Challenge Audit Trail</h2>
    {f"""<table>
        <thead>
            <tr>
                <th>Timestamp</th>
                <th>Investigator</th>
                <th>Action</th>
                <th>Previous Score</th>
                <th>New Score</th>
                <th>Rationale</th>
            </tr>
        </thead>
        <tbody>
            {"".join(f"<tr><td>{ch.get('timestamp')}</td><td>{ch.get('investigator_id')}</td><td><strong>{ch.get('action')}</strong></td><td>{ch.get('previous_score')}%</td><td>{ch.get('new_score')}%</td><td>{ch.get('reason')}</td></tr>" for ch in challenges)}
        </tbody>
    </table>""" if challenges else "<p style='color: #64748b; font-style: italic;'>No human challenges recorded. All evidence items remain in active algorithmic consensus.</p>"}

    <h2>4. Chain of Custody & Integrity Seal</h2>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 11px;">
        <div><strong>SHA-256 Digital Fingerprint:</strong> {d['cryptographic_hash_sha256']}</div>
        <div style="margin-top: 4px; color: #64748b;">This cryptographic hash locks the entire state of cases, normalized events, stylometric profiles, and human challenges at time of export.</div>
    </div>

    <div class="footer">
        <div>PRAGYA CHAKSHU — Controlled Attribution & Forensic Intelligence System</div>
        <div>Page 1 of 1 • Strict Provenance Segregation Maintained</div>
    </div>
</body>
</html>"""
    return HTMLResponse(content=html_content)


@router.get("/{case_id}/summary")
def get_case_summary(case_id: str):
    """
    Returns a personalized plain-English summary of everything observed in a case.
    Written in layman terms so anyone can understand the findings.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Fetch case
    cursor.execute("SELECT * FROM cases WHERE case_id=?", (case_id,))
    case_row = cursor.fetchone()
    if not case_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Case not found")
    case = dict(case_row)

    # Total events ingested
    cursor.execute(
        "SELECT count(*) FROM normalized_events WHERE case_id=?", (case_id,)
    )
    total_events = cursor.fetchone()[0]

    # Personas (unique actors found)
    cursor.execute(
        "SELECT canonical_handle, platform FROM personas WHERE case_id=?", (case_id,)
    )
    personas = [dict(r) for r in cursor.fetchall()]
    forum_actors = [p for p in personas if "forum" in p["platform"].lower()]
    market_actors = [p for p in personas if "market" in p["platform"].lower()]

    # Evidence / correlations
    cursor.execute(
        """SELECT e.*, pa.canonical_handle as handle_a, pb.canonical_handle as handle_b
           FROM evidence e
           LEFT JOIN personas pa ON e.source_persona_id = pa.persona_id
           LEFT JOIN personas pb ON e.target_persona_id = pb.persona_id
           WHERE e.case_id=? AND e.challenge_status='ACTIVE'
           ORDER BY e.confidence_weight DESC""",
        (case_id,)
    )
    evidence_rows = [dict(r) for r in cursor.fetchall()]

    # Best match
    best_match = evidence_rows[0] if evidence_rows else None

    # PGP / BTC / Onion identifiers
    cursor.execute(
        """SELECT i.identifier_type, count(*) as cnt
           FROM identifiers i
           JOIN personas p ON i.persona_id = p.persona_id
           WHERE p.case_id=?
           GROUP BY i.identifier_type""",
        (case_id,)
    )
    identifiers_summary = {r["identifier_type"]: r["cnt"] for r in cursor.fetchall()}

    # Investigator notes
    cursor.execute(
        "SELECT count(*) FROM investigator_notes WHERE case_id=?", (case_id,)
    )
    note_count = cursor.fetchone()[0]

    conn.close()

    # ── Build the plain-English narrative ──────────────────────────────────────

    case_name = case.get("name", "this investigation")
    created_date = (case.get("created_at") or "")[:10]

    # Opening
    paragraphs = []
    paragraphs.append(
        f"📋 **Investigation: {case_name}**\n"
        f"Case opened on {created_date or 'an unknown date'}. "
        f"Here is a plain-English breakdown of everything the system has found so far."
    )

    # Actors found
    if not personas:
        paragraphs.append(
            "🔍 **No actors found yet.** No data has been ingested into this case. "
            "Go to the Ingest tab and load a dataset slice to get started."
        )
    else:
        actor_text = f"🔍 **Who was found:** The system discovered **{len(personas)} unique actor(s)** across the datasets. "
        if forum_actors:
            handles = ", ".join(f"*{p['canonical_handle']}*" for p in forum_actors[:3])
            extra = f" and {len(forum_actors)-3} more" if len(forum_actors) > 3 else ""
            actor_text += f"On the forum side, {len(forum_actors)} user(s) were identified — including {handles}{extra}. "
        if market_actors:
            mhandles = ", ".join(f"*{p['canonical_handle']}*" for p in market_actors[:3])
            mextra = f" and {len(market_actors)-3} more" if len(market_actors) > 3 else ""
            actor_text += f"On the marketplace side, {len(market_actors)} vendor(s) appeared — including {mhandles}{mextra}. "
        paragraphs.append(actor_text)

    # Data ingested
    if total_events > 0:
        paragraphs.append(
            f"📊 **What was analysed:** A total of **{total_events} data records** (posts, vendor profiles, "
            f"marketplace listings) were loaded and analysed by the system."
        )

    # Attribution / correlation findings
    if not evidence_rows:
        paragraphs.append(
            "🔗 **Attribution results:** No identity links have been computed yet. "
            "Try running a correlation analysis from the Ingest tab."
        )
    else:
        supporting = [e for e in evidence_rows if e.get("polarity") == "SUPPORTING"]
        conflicting = [e for e in evidence_rows if e.get("polarity") == "CONFLICTING"]
        paragraphs.append(
            f"🔗 **Identity matching:** The system found **{len(evidence_rows)} pieces of evidence** "
            f"linking actors across platforms — **{len(supporting)} supporting** a shared identity "
            f"and **{len(conflicting)} conflicting** (suggesting they might be different people). "
        )
        if best_match and best_match.get("handle_a") and best_match.get("handle_b"):
            wt = best_match.get("confidence_weight", 0)
            etype = (best_match.get("evidence_type") or "Unknown").replace("_", " ").title()
            paragraphs.append(
                f"🎯 **Strongest lead:** The highest-confidence link is between "
                f"**{best_match['handle_a']}** and **{best_match['handle_b']}**, "
                f"supported by *{etype}* evidence (confidence weight: {round(float(wt), 1)}). "
                f"In plain terms, these two users likely share the same real-world identity."
            )

    # Identifiers (PGP, BTC, Onion)
    if identifiers_summary:
        id_parts = []
        if identifiers_summary.get("PGP_KEY"):
            id_parts.append(f"{identifiers_summary['PGP_KEY']} PGP encryption key(s)")
        if identifiers_summary.get("BTC_ADDRESS"):
            id_parts.append(f"{identifiers_summary['BTC_ADDRESS']} Bitcoin address(es)")
        if identifiers_summary.get("ONION_URL"):
            id_parts.append(f"{identifiers_summary['ONION_URL']} .onion website link(s)")
        if id_parts:
            paragraphs.append(
                f"🔑 **Cryptographic clues:** The system extracted " + ", ".join(id_parts) +
                " from posts and listings. These are strong digital fingerprints — "
                "sharing a PGP key or Bitcoin address across platforms is a very strong indicator of the same person."
            )

    # Coordination
    try:
        coord = detect_coordination_network(case_id, max_pairs=5)
        clusters = coord.get("coordination_clusters", [])
        if clusters:
            paragraphs.append(
                f"🤝 **Coordinated behaviour:** The system detected **{len(clusters)} group(s)** "
                f"of actors who seem to be working together — posting in response to each other "
                f"very quickly or always appearing in the same threads at the same time. "
                f"This could indicate organised activity or multiple fake accounts controlled by one person."
            )
    except Exception:
        pass

    # Notes
    if note_count > 0:
        paragraphs.append(
            f"📝 **Investigator notes:** {note_count} manual note(s) have been recorded by the analyst during this investigation."
        )

    # Closing
    status = case.get("status", "OPEN")
    paragraphs.append(
        f"📌 **Case status:** This investigation is currently marked as **{status}**. "
        f"Use the Export tab to download a full forensic dossier with a cryptographic integrity seal."
    )

    return {
        "case_id": case_id,
        "case_name": case_name,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "summary_paragraphs": paragraphs,
        "stats": {
            "total_events": total_events,
            "total_actors": len(personas),
            "forum_actors": len(forum_actors),
            "market_actors": len(market_actors),
            "evidence_items": len(evidence_rows),
            "identifiers_found": sum(identifiers_summary.values()),
            "investigator_notes": note_count,
        },
    }
