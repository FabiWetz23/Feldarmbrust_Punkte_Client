// 11 is used for "Inner Ten" (scored as 10)
export function clampInt(v, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  // allow 11 for inner ten even if max is 10
  if ((n < min || n > max) && n !== 11) return null;
  return n;
}

// macht aus allen Varianten ein einheitliches Array: [{index, value}]
export function normalizeShots(series) {
  if (!series) return [];

  const raw = series.shots ?? series.shot_scores ?? series.scores ?? null;

  // Variante A: shots als Array von Objekten
  if (Array.isArray(raw)) {
    return raw
      .map(s => ({
        index: Number.isInteger(s.index) ? s.index : s.shot_number,
        value: Number.isInteger(s.value) ? s.value : s.score
      }))
      .filter(x => Number.isInteger(x.index) && Number.isInteger(x.value))
      .sort((a, b) => a.index - b.index);
  }

  // Variante B: shots als Dict { "1": 10, "2": 9, ... }
  if (raw && typeof raw === "object") {
    return Object.entries(raw)
      .map(([k, v]) => ({ index: parseInt(k, 10), value: Number(v) }))
      .filter(x => Number.isInteger(x.index) && Number.isFinite(x.value))
      .sort((a, b) => a.index - b.index);
  }

  // Variante C: Series enthält direkt Felder wie shot_1, shot_2 ...
  const out = [];
  for (const [k, v] of Object.entries(series)) {
    const m = /^shot_(\d+)$/.exec(k);
    if (m) out.push({ index: parseInt(m[1], 10), value: Number(v) });
  }
  return out
    .filter(x => Number.isInteger(x.index) && Number.isFinite(x.value))
    .sort((a, b) => a.index - b.index);
}

export function getAllSeries(state) {
  // Dein Server: competition.series ist Dict
  const dict = state?.competition?.series;
  if (dict && typeof dict === "object") return Object.values(dict);

  // Fallback: altes Format
  if (Array.isArray(state?.series)) return state.series;

  return [];
}

export function getSeries(state, shooterId, round) {
  const all = getAllSeries(state);
  return all.find(s => {
    const sid = s.shooter_id ?? s.shooterId;
    const rn = s.round_number ?? s.round;
    return sid === shooterId && Number(rn) === Number(round);
  }) || null;
}

export function seriesTotal(series, shotsPerSeries = 6) {
  const vals = new Array(shotsPerSeries).fill(null);
  for (const sh of normalizeShots(series)) {
    if (sh.index >= 1 && sh.index <= shotsPerSeries) vals[sh.index - 1] = sh.value;
  }
  return vals.reduce((acc, x) => {
    if (!Number.isInteger(x)) return acc;
    // 11 counts as 10
    return acc + (x === 11 ? 10 : x);
  }, 0);
}

export function shooterGrandTotal(state, shooterId, shotsPerSeries = 6) {
  const all = getAllSeries(state);
  // Match rounds are > 0. Sighting rounds are <= 0.
  const mine = all.filter(s => {
    const sid = s.shooter_id ?? s.shooterId;
    const rn = Number(s.round_number ?? s.round);
    return sid === shooterId && rn > 0;
  });
  return mine.reduce((acc, s) => acc + seriesTotal(s, shotsPerSeries), 0);
}

export function countInnerTens(state, shooterId) {
  const all = getAllSeries(state);
  // Inner tens from MATCH rounds only? Usually yes.
  const mine = all.filter(s => {
    const sid = s.shooter_id ?? s.shooterId;
    const rn = Number(s.round_number ?? s.round);
    return sid === shooterId && rn > 0;
  });

  let count = 0;
  for (const s of mine) {
    for (const sh of normalizeShots(s)) {
      if (sh.value === 11) count++;
    }
  }
  return count;
}

export function makeSeriesId(shooterId, round) {
  return `ser-${shooterId}-r${round}`;
}
