export async function fetchJSON(url, opts = {}, apiKey = null, timeoutMs = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const headers = { ...opts.headers };
  if (apiKey) {
    headers["X-API-KEY"] = apiKey;
  }

  try {
    const r = await fetch(url, { ...opts, headers, signal: controller.signal });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) {
      if (r.status === 401) throw new Error("Invalid API Key");
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

export function getState(base, apiKey) {
  return fetchJSON(api(base, "/state"), {}, apiKey);
}

export function upsertCompetitor(base, competitor, apiKey) {
  return fetchJSON(api(base, "/shooters"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(competitor)
  }, apiKey);
}

export function upsertSeries(base, series, apiKey) {
  return fetchJSON(api(base, "/series"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(series)
  }, apiKey);
}

export function setShot(base, seriesId, shot, apiKey) {
  return fetchJSON(api(base, `/series/${encodeURIComponent(seriesId)}/shot`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shot)
  }, apiKey);
}

