import React, { useMemo, useState } from "react";

export default function ShooterList({ shooters, activeId, onSelect }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = (q || "").trim().toLowerCase();
    if (!t) return shooters;
    return shooters.filter(s =>
      `${s.name} ${s.country || ""} ${s.start_number || ""}`.toLowerCase().includes(t)
    );
  }, [q, shooters]);

  return (
    <div>
      <input
        className="input"
        placeholder="Search (Name/Country/Nr)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div style={{ height: 10 }} />

      <div className="list">
        {filtered.map(s => (
          <div key={s.id} className="item">
            <div className="row">
              <div style={{ minWidth: 220 }}>
                <div className="itemTitle">
                  <span style={{ marginRight: 8, opacity: 0.7 }}>No. {s.start_number || "?"}</span>
                  {s.name}
                </div>
                <div className="small">{s.country || "—"}</div>
              </div>
              <div className="spacer" />
              {activeId === s.id ? (
                <span className="pill">✅ Active</span>
              ) : (
                <button
                  className="btn primary"
                  onClick={() => onSelect(s.id)}
                  onTouchEnd={(e) => { e.preventDefault(); onSelect(s.id); }}
                >
                  Select
                </button>

              )}
            </div>
          </div>
        ))}

        {!filtered.length && (
          <div className="item">
            <div className="small">No results.</div>
          </div>
        )}
      </div>
    </div>
  );
}
