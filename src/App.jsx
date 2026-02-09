import React, { useEffect, useMemo, useRef, useState } from "react";
import Tabs from "./components/Tabs.jsx";
import Banner from "./components/Banner.jsx";
import ShooterList from "./components/ShooterList.jsx";
import RoundPicker from "./components/RoundPicker.jsx";
import ShotPad from "./components/ShotPad.jsx";
import { clearAll } from "./lib/offlineQueue.js";

import { loadSettings, saveSettings } from "./lib/storage.js";
import { uid } from "./lib/uuid.js";
import * as API from "./lib/api.js";
import { enqueue, flushQueue, peekAll } from "./lib/offlineQueue.js";
import { clampInt, getSeries, makeSeriesId, seriesTotal, shooterGrandTotal, normalizeShots } from "./lib/math.js";


const SHOTS_PER_SERIES = 6;      // <- anpassen
const MAX_ROUNDS = 10;           // <- anpassen
const MIN_POINTS = 0;            // <- anpassen
const MAX_POINTS = 10;           // <- anpassen

export default function App() {
  const [tab, setTab] = useState("setup");
  const [settings, setSettings] = useState(loadSettings());
  const [apiBase, setApiBase] = useState(settings.apiBase || "");
  const [state, setState] = useState(null);

  const [online, setOnline] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Noch nicht verbunden.");
  const [queueCount, setQueueCount] = useState(peekAll().length);

  const [activeShooterId, setActiveShooterId] = useState(null);
  const [round, setRound] = useState(1);

  // add shooter form
  const [newName, setNewName] = useState("");
  const [newClub, setNewClub] = useState("");

  const syncTimer = useRef(null);

  const shooters = useMemo(() => {
    const dict = state?.competition?.shooters;
    if (dict && typeof dict === "object") return Object.values(dict);
    // Fallback: aus leaderboard ziehen
    const lb = state?.leaderboard;
    if (Array.isArray(lb)) return lb.map(x => x.shooter).filter(Boolean);
    return [];
  }, [state]);


  const activeShooter = useMemo(
    () => shooters.find(s => s.id === activeShooterId) || null,
    [shooters, activeShooterId]
  );

  const activeSeries = useMemo(() => {
    if (!activeShooterId) return null;
    return getSeries(state, activeShooterId, round);
  }, [state, activeShooterId, round]);

  const seriesScore = useMemo(
    () => activeSeries ? seriesTotal(activeSeries, SHOTS_PER_SERIES) : 0,
    [activeSeries]
  );

  const grandScore = useMemo(
    () => activeShooterId ? shooterGrandTotal(state, activeShooterId, SHOTS_PER_SERIES) : 0,
    [state, activeShooterId]
  );

  async function connect() {
    const base = apiBase.trim();
    if (!base) {
      setStatusMsg("Bitte Server-URL eingeben (z. B. http://192.168.0.10:8000).");
      setOnline(false);
      return;
    }

    setStatusMsg("Verbinde…");
    try {
      const st = await API.getState(base);
      setState(st);
      setOnline(true);
      setStatusMsg("Verbunden.");
      // set default active shooter
      const dict = st?.competition?.shooters;
      const list = dict ? Object.values(dict) : [];
      if (!activeShooterId && list.length) setActiveShooterId(list[0].id);
      setSettings(s => {
        const next = { ...s, apiBase: base };
        saveSettings(next);
        return next;
      });
    } catch (e) {
      setOnline(false);
      setStatusMsg(`Offline / keine Verbindung: ${e.message}`);
    }
  }

  async function refreshState() {
    if (!apiBase.trim()) return;
    try {
      const st = await API.getState(apiBase.trim());
      setState(st);
      setOnline(true);
      setStatusMsg("Verbunden.");
    } catch (e) {
      setOnline(false);
      setStatusMsg(`Offline: ${e.message}`);
    }
  }

  async function flush() {
    if (!apiBase.trim()) return { ok: false, flushed: 0, error: "no_server" };

    const res = await flushQueue(async (action) => {
      if (action.type === "upsertShooter") {
        await API.upsertShooter(apiBase.trim(), action.payload);
      } else if (action.type === "upsertSeries") {
        await API.upsertSeries(apiBase.trim(), action.payload);
      } else if (action.type === "setShot") {
        await API.setShot(apiBase.trim(), action.payload.seriesId, action.payload.shot);
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
  }, [apiBase]);

  useEffect(() => {
        if (!activeShooterId && shooters.length) {
          setActiveShooterId(shooters[0].id);
        }
      }, [shooters, activeShooterId]);

  // initial connect attempt if saved
  useEffect(() => {
    if (apiBase) connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createShooter() {
    const name = newName.trim();
    const club = newClub.trim();
    if (!name) return;

    const shooter = club ? { id: uid("sh"), name, club } : { id: uid("sh"), name };





    try {
      await API.upsertShooter(apiBase.trim(), shooter);
      await refreshState();
      setActiveShooterId(shooter.id);
      setNewName(""); setNewClub("");
      setTab("shoot");
    } catch (e) {
      // offline → enqueue
      enqueue({ type: "upsertShooter", payload: shooter });
      setQueueCount(peekAll().length);
      setStatusMsg("Offline – Schütze gepuffert, wird synchronisiert.");
      setNewName(""); setNewClub("");
    }
  }

  async function ensureSeriesExists(shooterId, r) {
    const id = makeSeriesId(shooterId, r);

    // Server erwartet: round_number, shooter_id, shots_per_series
    const series = {
      id,
      shooter_id: shooterId,
      round_number: r,
      shots_per_series: SHOTS_PER_SERIES
    };

    try {
      await API.upsertSeries(apiBase.trim(), series);
      await refreshState();
      return id;
    } catch (e) {
      enqueue({ type: "upsertSeries", payload: series });
      setQueueCount(peekAll().length);
      setStatusMsg("Offline – Serie gepuffert.");
      return id;
    }
  }


  async function writeShot(index, valueOrNull) {
    if (!activeShooterId) return;

    const seriesId = await ensureSeriesExists(activeShooterId, round);

    if (valueOrNull === null) {
      // "Löschen": wir setzen auf 0? oder lassen weg?
      // Am Server gibt's kein Delete-Endpunkt, darum: Setze 0 als "Korrektur".
      // Wenn du echtes Löschen willst: Server-Endpunkt ergänzen.
      valueOrNull = 0;
    }

    const v = clampInt(valueOrNull, MIN_POINTS, MAX_POINTS);
    if (v === null) {
      setStatusMsg(`Ungültig: ${MIN_POINTS}–${MAX_POINTS}`);
      return;
    }

    const shot = { shot_number: index, score: v };
    await API.setShot(apiBase.trim(), seriesId, shot);
  }

  const connectionBanner = useMemo(() => {
    if (!apiBase.trim()) {
      return <Banner kind="warn" title="Server nicht gesetzt">Gib die Server-URL ein (Laptop-IP + Port).</Banner>;
    }
    if (online) {
      return (
        <Banner kind="ok" title="Online">
          Verbunden mit <span style={{ fontWeight: 900 }}>{apiBase.trim()}</span>.
          {queueCount ? ` (${queueCount} Aktionen warten)` : ""}
        </Banner>
      );
    }
    return (
      <Banner kind="bad" title="Offline / nicht erreichbar">
        {statusMsg} {queueCount ? `(${queueCount} Aktionen in Warteschlange)` : ""}
      </Banner>
    );
  }, [apiBase, online, statusMsg, queueCount]);

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="h1">Punkteerfassung (Tablet)</div>
          <div className="small">Touch-optimiert • Offline-Queue • WLAN zum Laptop</div>
        </div>

        <div className="row">
          <span className="pill">Queue: <b style={{ color: "var(--text)" }}>{queueCount}</b></span>
          <button className="btn" onClick={() => refreshState()}>Aktualisieren</button>
        </div>
      </div>

      {connectionBanner}

      <div className="card">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "setup", label: "Setup" },
            { value: "shooters", label: "Schützen" },
            { value: "shoot", label: "Eingabe" }
          ]}
        />

        {tab === "setup" && (
          <div className="grid2">
            <div>
              <div className="small" style={{ marginBottom: 6 }}>Server-URL (Laptop)</div>
              <input
                className="input"
                placeholder="http://192.168.0.10:8000"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
              />
              <div style={{ height: 10 }} />
              <div className="row">
                <button className="btn primary" onClick={connect}>Verbinden</button>
                <button className="btn" onClick={async () => { await flush(); }}>Sync erzwingen</button>
                <button
                  className="btn danger"
                  onClick={() => {
                    clearAll();
                    setQueueCount(0);
                    setStatusMsg("Queue gelöscht.");
                  }}
                >
                  Queue löschen
                </button>

                <a className="btn" href={apiBase.trim() ? `${apiBase.trim().replace(/\/+$/,"")}/export` : "#"} target="_blank" rel="noreferrer">
                  Excel Export
                </a>
              </div>

              <div className="small" style={{ marginTop: 10 }}>
                Tipp: Laptop und Tablet im gleichen WLAN. Laptop-IP z.B. über <b>ipconfig</b>.
              </div>
            </div>

            <div>
              <div className="small" style={{ marginBottom: 6 }}>Status</div>
              <div className="item">
                <div><b>Online:</b> {online ? "ja" : "nein"}</div>
                <div><b>Meldung:</b> {statusMsg}</div>
                <div><b>Schützen:</b> {shooters.length}</div>
                <div><b>Event:</b> {state?.eventId || "—"}</div>
              </div>
            </div>
          </div>
        )}

        {tab === "shooters" && (
          <div className="grid2">
            <div>
              <div className="small" style={{ marginBottom: 6 }}>Neuen Schützen anlegen</div>
              <input
                className="input"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <div style={{ height: 8 }} />
              <input
                className="input"
                placeholder="Verein (optional)"
                value={newClub}
                onChange={(e) => setNewClub(e.target.value)}
              />
              <div style={{ height: 10 }} />
              <button className="btn primary" onClick={createShooter}>Hinzufügen</button>

              <div className="small" style={{ marginTop: 10 }}>
                Offline? Kein Problem: wird gepuffert und später synchronisiert.
              </div>
            </div>

            <div>
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="pill">Aktiv</span>
                <b>{activeShooter ? `${activeShooter.name} (${activeShooter.club || "—"})` : "—"}</b>
              </div>
              <ShooterList
                shooters={shooters}
                activeId={activeShooterId}
                onSelect={(id) => { setActiveShooterId(id); setTab("shoot"); }}
              />
            </div>
          </div>
        )}

        {tab === "shoot" && (
          <div>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="pill">Aktiver Schütze</span>
              <b>{activeShooter ? `${activeShooter.name} (${activeShooter.club || "—"})` : "— bitte wählen —"}</b>
              <div className="spacer" />
              <button className="btn" onClick={() => setTab("shooters")}>Schütze wechseln</button>
            </div>

            <div className="row" style={{ marginBottom: 10 }}>
              <RoundPicker round={round} onRound={setRound} maxRounds={MAX_ROUNDS} />
              <div className="spacer" />
              <span className="pill">Serie: <b style={{ color: "var(--text)" }}>{seriesScore}</b></span>
              <span className="pill">Gesamt: <b style={{ color: "var(--text)" }}>{grandScore}</b></span>
            </div>

            {!activeShooter && (
              <Banner kind="warn" title="Kein Schütze aktiv">
                Wechsle zu „Schützen“ und wähle einen aktiven Schützen.
              </Banner>
            )}

            {activeShooter && (
              <div className="shotGrid">
                {Array.from({ length: SHOTS_PER_SERIES }, (_, i) => i + 1).map(idx => {
                  const shots = normalizeShots(activeSeries);
                  const existing = shots.find(s => s.index === idx);
                  const currentValue = Number.isInteger(existing?.value) ? existing.value : null;


                  return (
                    <div key={idx} className="shotBox">
                      <div className="row" style={{ marginBottom: 6 }}>
                        <div className="shotIndex">Schuss {idx}</div>
                        <div className="spacer" />
                        {Number.isInteger(currentValue) ? (
                          <span className="pill">aktuell: <b style={{ color: "var(--text)" }}>{currentValue}</b></span>
                        ) : (
                          <span className="pill">leer</span>
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
              Hinweis: ⌫ setzt in dieser Version auf <b>0</b> (weil Server kein Delete-Endpunkt hat).
              Wenn du echtes Löschen willst, sag kurz Bescheid – ich gebe dir das passende Server-Endpoint + Client-Anpassung.
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
            Kopieren
          </button>
        </div>
        <pre style={{ margin: 0, marginTop: 10, whiteSpace: "pre-wrap" }}>
{state ? JSON.stringify(state, null, 2) : "—"}
        </pre>
      </div>
    </div>
  );
}
