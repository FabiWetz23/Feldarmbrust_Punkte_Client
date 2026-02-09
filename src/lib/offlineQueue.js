const QKEY = "fa_offline_queue_v1";

function loadQ() {
  try {
    return JSON.parse(localStorage.getItem(QKEY) || "[]");
  } catch {
    return [];
  }
}
function saveQ(q) {
  localStorage.setItem(QKEY, JSON.stringify(q));
}

export function enqueue(action) {
  const q = loadQ();
  q.push({ ...action, enqueuedAt: new Date().toISOString() });
  saveQ(q);
  return q.length;
}

export function peekAll() {
  return loadQ();
}

export function clearAll() {
  saveQ([]);
}

export async function flushQueue(flushOneFn) {
  // flushOneFn: async (action) => void
  const q = loadQ();
  if (!q.length) return { ok: true, flushed: 0 };

  const remaining = [];
  let flushed = 0;

  for (let i = 0; i < q.length; i++) {
    const action = q[i];
    try {
      await flushOneFn(action);
      flushed += 1;
    } catch (e) {
      // Stop at first failure to preserve order (robust)
      remaining.push(action, ...q.slice(i + 1));
      saveQ(remaining);
      return { ok: false, flushed, error: String(e?.message || e) };
    }
  }

  saveQ([]);
  return { ok: true, flushed };
}
