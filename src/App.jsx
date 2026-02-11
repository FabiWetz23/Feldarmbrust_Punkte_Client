import React, { useEffect, useMemo, useRef, useState } from "react";
import Tabs from "./components/Tabs.jsx";
import Banner from "./components/Banner.jsx";
import CompetitorList from "./components/CompetitorList.jsx";
import RoundPicker from "./components/RoundPicker.jsx";
import ShotPad from "./components/ShotPad.jsx";
import { clearAll } from "./lib/offlineQueue.js";

import { loadSettings, saveSettings } from "./lib/storage.js";
import { uid } from "./lib/uuid.js";
import * as API from "./lib/api.js";
import { enqueue, flushQueue, peekAll } from "./lib/offlineQueue.js";
import { clampInt, getSeries, makeSeriesId, seriesTotal, competitorGrandTotal, normalizeShots, countInnerTens } from "./lib/math.js";


const SHOTS_PER_SERIES = 3;      // 3 shots per series
const MAX_ROUNDS = 10;           // 10 match rounds
const MIN_POINTS = 0;
const MAX_POINTS = 10;           // Max regular points (11 is inner ten)

export default function App() {
  const [tab, setTab] = useState("setup");
  const [settings, setSettings] = useState(loadSettings());
  const [apiBase, setApiBase] = useState(() => {
    const saved = localStorage.getItem("apiBase") || "http://192.168.0.25:8000";
    return saved;
  });

  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem("apiKey") || "1234";
  });

  const updateApiBase = (val) => {
    let url = val.trim();
    if (url && !url.startsWith("http")) {
      url = "http://" + url;
    }
    // Force http for Option B stability
    if (url.startsWith("https://")) {
      url = url.replace("https://", "http://");
    }
    setApiBase(url);
    localStorage.setItem("apiBase", url);
  };

  const updateApiKey = (val) => {
    const trimmed = val.trim();
    setApiKey(trimmed);
    localStorage.setItem("apiKey", trimmed);
  };

  const [state, setState] = useState(null);

  const [online, setOnline] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Not connected yet.");
  const [queueCount, setQueueCount] = useState(peekAll().length);

  const [activeCompetitorId, setActiveCompetitorId] = useState(null);
  // Default to Round 1 (Competition). Sighting are -1, 0.
  const [round, setRound] = useState(1);

  // add competitor form
  const [newName, setNewName] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [newStartNr, setNewStartNr] = useState("");

  const syncTimer = useRef(null);

  // --- OPTIMISTIC UI: mergedState ---
  const mergedState = useMemo(() => {
    const q = peekAll();
    if (!state && !q.length) return null;

    // Deep clone state to avoid mutations, or start with default structure
    const next = state
      ? JSON.parse(JSON.stringify(state))
      : { competition: { shooters: {}, series: {} } };

    if (!next.competition) next.competition = { shooters: {}, series: {} };
    if (!next.competition.shooters) next.competition.shooters = {};
    if (!next.competition.series) next.competition.series = {};

    if (!q.length) return next;

    for (const action of q) {
      if (action.type === "upsertCompetitor") {
        const c = action.payload;
        next.competition.shooters[c.id] = c;
      } else if (action.type === "upsertSeries") {
        const s = action.payload;
        // Don't overwrite if it already exists (it might have optimistic shots)
        if (!next.competition.series[s.id]) {
          next.competition.series[s.id] = { ...s, shot_scores: {} };
        }
      } else if (action.type === "setShot") {
        const { seriesId, shot } = action.payload;
        const ser = next.competition.series[seriesId];
        if (ser) {
          // If the server state has 'shots' as an array, we ensure we don't ignore it
          // normalizeShots prefers 'shots' array over 'shot_scores' dict.
          // To be safe, if 'shots' exists, we update it OR we force usage of shot_scores by deleting 'shots'
          if (Array.isArray(ser.shots)) {
            if (!ser.shot_scores) ser.shot_scores = {};
            ser.shots.forEach(s => {
              const idx = s.shot_number ?? s.index;
              const val = s.score ?? s.value;
              if (idx) ser.shot_scores[String(idx)] = val;
            });
            delete ser.shots;
          }

          if (!ser.shot_scores) ser.shot_scores = {};
          ser.shot_scores[String(shot.shot_number)] = shot.score;
        }
      }
    }
    return next;
  }, [state, queueCount]);

  const competitors = useMemo(() => {
    const dict = mergedState?.competition?.shooters;
    if (dict && typeof dict === "object") return Object.values(dict);
    // Fallback: aus leaderboard ziehen
    const lb = mergedState?.leaderboard;
    if (Array.isArray(lb)) return lb.map(x => x.shooter).filter(Boolean);
    return [];
  }, [mergedState]);


  const activeCompetitor = useMemo(
    () => competitors.find(s => s.id === activeCompetitorId) || null,
    [competitors, activeCompetitorId]
  );

  const activeSeries = useMemo(() => {
    if (!activeCompetitorId) return null;
    return getSeries(mergedState, activeCompetitorId, round);
  }, [mergedState, activeCompetitorId, round]);

  const seriesScore = useMemo(
    () => activeSeries ? seriesTotal(activeSeries, SHOTS_PER_SERIES) : 0,
    [activeSeries]
  );

  const grandScore = useMemo(
    () => activeCompetitorId ? competitorGrandTotal(mergedState, activeCompetitorId, SHOTS_PER_SERIES) : 0,
    [mergedState, activeCompetitorId]
  );

  const innerTensCountDeriv = useMemo(
    () => activeCompetitorId ? countInnerTens(mergedState, activeCompetitorId) : 0,
    [mergedState, activeCompetitorId]
  );

  async function connect() {
    const base = apiBase.trim();
    if (!base) {
      setStatusMsg("Please enter Server URL.");
      setOnline(false);
      return;
    }

    setStatusMsg("Connecting…");
    try {
      const st = await API.getState(base, apiKey);
      setState(st);
      setOnline(true);
      setStatusMsg("Connected.");
      // set default active competitor
      const dict = st?.competition?.shooters;
      const list = dict ? Object.values(dict) : [];
      if (!activeCompetitorId && list.length) setActiveCompetitorId(list[0].id);
      setSettings(s => {
        const next = { ...s, apiBase: base };
        saveSettings(next);
        return next;
      });
    } catch (e) {
      setOnline(false);
      setStatusMsg(`Offline / No Connection: ${e.message}`);
    }
  }

  async function refreshState() {
    if (!apiBase.trim()) return;
    try {
      const st = await API.getState(apiBase.trim(), apiKey);
      setState(st);
      setOnline(true);
      setStatusMsg("Connected.");
    } catch (e) {
      setOnline(false);
      setStatusMsg(`Offline: ${e.message}`);
    }
  }

  async function flush() {
    if (!apiBase.trim()) return { ok: false, flushed: 0, error: "no_server" };

    const res = await flushQueue(async (action) => {
      if (action.type === "upsertCompetitor") {
        await API.upsertCompetitor(apiBase.trim(), action.payload, apiKey);
      } else if (action.type === "upsertSeries") {
        await API.upsertSeries(apiBase.trim(), action.payload, apiKey);
      } else if (action.type === "setShot") {
        await API.setShot(apiBase.trim(), action.payload.seriesId, action.payload.shot, apiKey);
      } else {
        throw new Error("unknown_action");
      }
    });

    setQueueCount(peekAll().length);
    if (res.ok) {
      await refreshState();
    } else {
      setOnline(false);
      setStatusMsg(`Offline: ${res.error}`);
    }
    return res;
  }

  // Periodic auto-sync if online
  useEffect(() => {
    clearInterval(syncTimer.current);
    syncTimer.current = setInterval(async () => {
      if (!apiBase.trim()) return;
      // try flush first (handles coming back online)
      await flush();
    }, 3500);
    return () => clearInterval(syncTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, apiKey]);

  useEffect(() => {
    if (!activeCompetitorId && competitors.length) {
      setActiveCompetitorId(competitors[0].id);
    }
  }, [competitors, activeCompetitorId]);

  // initial connect attempt if saved
  useEffect(() => {
    if (apiBase) connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCompetitor() {
    const name = newName.trim();
    const country = newCountry.trim();
    const startNr = newStartNr.trim();

    if (!name) return;

    const competitor = {
      id: uid("sh"),
      name,
      country: country || null,
      start_number: startNr || null
    };

    try {
      await API.upsertCompetitor(apiBase.trim(), competitor, apiKey);
      await refreshState();
      setActiveCompetitorId(competitor.id);
      setNewName(""); setNewCountry(""); setNewStartNr("");
      setTab("shoot");
    } catch (e) {
      // offline → enqueue
      enqueue({ type: "upsertCompetitor", payload: competitor });
      setQueueCount(peekAll().length);
      setStatusMsg("Offline – Competitor queued.");

      // Optimistic update for UI state
      setActiveCompetitorId(competitor.id);
      setNewName(""); setNewCountry(""); setNewStartNr("");
      setTab("shoot");
    }
  }

  async function ensureSeriesExists(competitorId, r) {
    const id = makeSeriesId(competitorId, r);

    // 1. Check if it already exists in the server state
    if (getSeries(state, competitorId, r)) return id;

    // 2. Check if it's already in the merged state (optimistic)
    if (getSeries(mergedState, competitorId, r)) return id;

    // 3. Fallback check: is it already in the offline queue as an action?
    const queued = peekAll().find(a => a.type === "upsertSeries" && a.payload.id === id);
    if (queued) return id;

    // Server erwartet: round_number, shooter_id, shots_per_series
    const series = {
      id,
      shooter_id: competitorId,
      round_number: r,
      shots_per_series: SHOTS_PER_SERIES
    };

    try {
      await API.upsertSeries(apiBase.trim(), series, apiKey);
      await refreshState();
      return id;
    } catch (e) {
      enqueue({ type: "upsertSeries", payload: series });
      setQueueCount(peekAll().length);
      setStatusMsg("Offline – Series queued.");
      return id;
    }
  }


  async function writeShot(index, valueOrNull) {
    if (!activeCompetitorId) return;

    const seriesId = await ensureSeriesExists(activeCompetitorId, round);

    if (valueOrNull === null) {
      // "Löschen": wir setzen auf 0? oder lassen weg?
      // Am Server gibt's kein Delete-Endpunkt, darum: Setze 0 als "Korrektur".
      // Wenn du echtes Löschen willst: Server-Endpunkt ergänzen.
      valueOrNull = 0;
    }

    const v = clampInt(valueOrNull, MIN_POINTS, MAX_POINTS);
    if (v === null) {
      setStatusMsg(`Invalid: ${MIN_POINTS}–${MAX_POINTS}`);
      return;
    }

    const shot = { shot_number: index, score: v };
    try {
      await API.setShot(apiBase.trim(), seriesId, shot, apiKey);
      await refreshState();
    } catch (e) {
      enqueue({ type: "setShot", payload: { seriesId, shot } });
      setQueueCount(peekAll().length);
      setStatusMsg(`Shot queued: ${e.message}`);
    }
  }

  const connectionBanner = useMemo(() => {
    if (!apiBase.trim()) {
      return <Banner kind="warn" title="Server not set">Enter Server URL (Laptop IP + Port).</Banner>;
    }
    if (online) {
      return (
        <Banner kind="ok" title="Online">
          Connected to <span style={{ fontWeight: 900 }}>{apiBase.trim()}</span>.
          {queueCount ? ` (${queueCount} actions pending)` : ""}
        </Banner>
      );
    }
    return (
      <Banner kind="bad" title="Offline / Unreachable">
        {statusMsg} {queueCount ? `(${queueCount} in queue)` : ""}
      </Banner>
    );
  }, [apiBase, online, statusMsg, queueCount]);

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="h1">Feldarmbrust Score</div>
          <div className="small">Touch-optimized • Offline-Queue</div>
        </div>

        <div className="row">
          <span className="pill">Queue: <b style={{ color: "var(--text)" }}>{queueCount}</b></span>
          <button className="btn" onClick={() => refreshState()}>Refresh</button>
        </div>
      </div>

      {connectionBanner}

      <div className="card">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "setup", label: "Setup" },
            { value: "competitors", label: "Competitors" },
            { value: "shoot", label: "Input" }
          ]}
        />

        {tab === "setup" && (
          <div className="grid2">
            <div>
              <div className="small" style={{ marginBottom: 6 }}>Server URL (Laptop)</div>
              <input
                className="input"
                placeholder="http://192.168.0.10:8000"
                value={apiBase}
                onChange={(e) => updateApiBase(e.target.value)}
              />
              <div style={{ height: 12 }} />
              <div className="small" style={{ marginBottom: 6 }}>API Key (Password)</div>
              <input
                className="input"
                type="password"
                placeholder="Password"
                value={apiKey}
                onChange={(e) => updateApiKey(e.target.value)}
              />
              <div style={{ height: 16 }} />
              <div className="row">
                <button className="btn primary" onClick={connect}>Connect</button>
                <button className="btn" onClick={async () => { await flush(); }}>Force Sync</button>
                <button
                  className="btn danger"
                  onClick={() => {
                    clearAll();
                    setQueueCount(0);
                    setStatusMsg("Queue cleared.");
                  }}
                >
                  Clear Queue
                </button>

                <a className="btn" href={apiBase.trim() ? `${apiBase.trim().replace(/\/+$/, "")}/export?key=${apiKey}` : "#"} target="_blank" rel="noreferrer">
                  Excel Export
                </a>
              </div>

              <div className="small" style={{ marginTop: 10 }}>
                Tip: Laptop and Tablet must be in the same WiFi. Find Laptop IP via <b>ipconfig</b>.
              </div>
            </div>

            <div>
              <div className="small" style={{ marginBottom: 6 }}>Status</div>
              <div className="item">
                <div><b>Online:</b> {online ? "Yes" : "No"}</div>
                <div><b>Message:</b> {statusMsg}</div>
                <div><b>Competitors:</b> {competitors.length}</div>
                <div><b>Event:</b> {state?.eventId || "—"}</div>
              </div>
            </div>
          </div>
        )}

        {tab === "competitors" && (
          <div className="grid2">
            <div>
              <div className="small" style={{ marginBottom: 6 }}>Add New Competitor</div>
              <div className="row">
                <input
                  className="input"
                  placeholder="No"
                  value={newStartNr}
                  onChange={(e) => setNewStartNr(e.target.value)}
                  style={{ width: "80px", marginRight: "8px" }}
                />
                <input
                  className="input"
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>

              <div style={{ height: 8 }} />
              <input
                className="input"
                placeholder="Country (optional)"
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
              />
              <div style={{ height: 10 }} />
              <button className="btn primary" onClick={createCompetitor}>Add Competitor</button>

              <div className="small" style={{ marginTop: 10 }}>
                Offline? No problem: will be queued and synced later.
              </div>
            </div>

            <div>
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="pill">Active</span>
                <b>{activeCompetitor ? `${activeCompetitor.name} (${activeCompetitor.country || "—"})` : "—"}</b>
              </div>
              <CompetitorList
                competitors={competitors}
                activeId={activeCompetitorId}
                onSelect={(id) => { setActiveCompetitorId(id); setTab("shoot"); }}
              />
            </div>
          </div>
        )}

        {tab === "shoot" && (
          <div>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="pill">Competitor</span>
              <b>{activeCompetitor ? `${activeCompetitor.name} (${activeCompetitor.country || "—"})` : "— select —"}</b>
              <div className="spacer" />
              <button className="btn" onClick={() => setTab("competitors")}>Change</button>
            </div>

            <div className="row" style={{ marginBottom: 10 }}>
              <RoundPicker round={round} onRound={setRound} maxRounds={MAX_ROUNDS} />
              <div className="spacer" />
              <span className="pill">Series: <b style={{ color: "var(--text)" }}>{seriesScore}</b></span>
              <span className="pill">Inner Tens: <b style={{ color: "var(--text)" }}>{innerTensCountDeriv}</b></span>
              <span className="pill">Total: <b style={{ color: "var(--text)" }}>{grandScore}</b></span>
            </div>

            {!activeCompetitor && (
              <Banner kind="warn" title="No Competitor Active">
                Go to "Competitors" and select an active competitor.
              </Banner>
            )}

            {activeCompetitor && (
              <div className="shotGrid">
                {Array.from({ length: SHOTS_PER_SERIES }, (_, i) => i + 1).map(idx => {
                  const shots = normalizeShots(activeSeries);
                  const existing = shots.find(s => s.index === idx);
                  const currentValue = Number.isInteger(existing?.value) ? existing.value : null;


                  return (
                    <div key={idx} className="shotBox">
                      <div className="row" style={{ marginBottom: 6 }}>
                        <div className="shotIndex">Shot {idx}</div>
                        <div className="spacer" />
                        {Number.isInteger(currentValue) ? (
                          <span className="pill">Score: <b style={{ color: "var(--text)" }}>{currentValue === 11 ? "⑩" : currentValue}</b></span>
                        ) : (
                          <span className="pill">empty</span>
                        )}
                      </div>

                      <ShotPad
                        currentValue={Number.isInteger(currentValue) ? currentValue : null}
                        min={MIN_POINTS}
                        max={MAX_POINTS}
                        onSet={(v) => writeShot(idx, v)}
                        onClear={() => writeShot(idx, null)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ height: 12 }} />
            <div className="small">
              Note: ⌫ sets value to <b>0</b> (Server has no delete endpoint).
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 12 }} />
      <div className="card">
        <div className="row">
          <div className="pill">Debug JSON</div>
          <div className="spacer" />
          <button className="btn" onClick={() => navigator.clipboard?.writeText(JSON.stringify(state || {}, null, 2))}>
            Copy
          </button>
        </div>
        <pre style={{ margin: 0, marginTop: 10, whiteSpace: "pre-wrap" }}>
          {mergedState ? JSON.stringify(mergedState, null, 2) : "—"}
        </pre>
      </div>
    </div>
  );
}
