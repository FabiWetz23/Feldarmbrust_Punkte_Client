const KEY = "fa_tablet_settings_v1";

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { apiBase: "" };
    return JSON.parse(raw);
  } catch {
    return { apiBase: "" };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
