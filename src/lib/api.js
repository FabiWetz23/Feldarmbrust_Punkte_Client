export async function fetchJSON(url, opts = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(url, { ...opts, signal: controller.signal });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) {
      const msg = (data && data.error) ? data.error : `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(id);
  }
}

export function api(base, path) {
  const b = (base || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export function getState(base) {
  return fetchJSON(api(base, "/state"));
}

export function upsertShooter(base, shooter) {
  return fetchJSON(api(base, "/shooters"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shooter)
  });
}

export function upsertSeries(base, series) {
  return fetchJSON(api(base, "/series"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(series)
  });
}

export function setShot(base, seriesId, shot) {
  return fetchJSON(api(base, `/series/${encodeURIComponent(seriesId)}/shot`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shot) // shot = { shot_number, score }
  });
}

