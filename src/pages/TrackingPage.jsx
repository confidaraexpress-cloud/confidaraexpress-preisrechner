import React, { useState } from "react";
import { API } from "../api/client";
import { Icon } from "../components/ui/Icon";

export default function TrackingPage() {
  const [id, setId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const track = async () => {
    if (!id) return;
    setError(""); setLoading(true); setResult(null);
    try {
      const r = await fetch(`${API}/api/tracking/public/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sendung nicht gefunden");
      setResult(d);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ paddingTop: 88, minHeight: "100vh", background: "var(--gray50)" }}>
      <div className="container" style={{ paddingTop: 48, paddingBottom: 48, maxWidth: 600 }}>
        <div className="text-center mb-32"><h1 className="section-title">Sendung verfolgen</h1></div>
        <div className="calc-panel">
          <div className="calc-panel-body">
            <div className="field">
              <label className="field-label">Sendungs-ID</label>
              <input className="field-input" value={id} onChange={e => setId(e.target.value)} onKeyDown={e => e.key === "Enter" && track()} placeholder="z.B. 12345678901234" />
            </div>
            {error && <div className="alert alert-error mb-16">{error}</div>}
            <button className="btn btn-primary btn-full" onClick={track} disabled={loading || !id}>
              {loading ? <><span className="spinner" /> Suche…</> : <><Icon n="search" s={16} /> Verfolgen</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
