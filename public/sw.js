const SHELL = "montreal-study-shell-v7";
const STATIC = "montreal-study-static-v7";
async function prepareShell() {
  const response = await fetch("/offline", { cache: "reload", credentials: "omit" });
  if (!response.ok || response.redirected) throw new Error("Offline page download failed.");
  const html = await response.clone().text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"<>]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&")).filter((url) => url.startsWith("/_next/static/") && /\.(js|css)(\?|$)/.test(url)))];
  if (!assets.some((url) => /\.js(\?|$)/.test(url))) throw new Error("Offline scripts were not found.");
  const cache = await caches.open(STATIC);
  await Promise.all(assets.map(async (url) => { const r = await fetch(url, { cache: "reload" }); if (!r.ok) throw new Error("An offline script failed to download."); await cache.put(url, r); }));
  await (await caches.open(SHELL)).put("/offline", response);
}
self.addEventListener("install", (event) => {
  event.waitUntil(prepareShell().then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => (key.startsWith("lmcc-prep-shell-") || key.startsWith("montreal-study-")) && key !== SHELL && key !== STATIC).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => {
  if (event.data?.kind !== "prepare-offline") return;
  event.waitUntil(prepareShell().then(() => event.ports[0]?.postMessage({ ok: true })).catch((error) => event.ports[0]?.postMessage({ ok: false, error: error.message })));
});
async function savedFigure(request) {
  const key = await new Promise((resolve) => {
    const open = indexedDB.open("montreal-study-v1", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("records");
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction("records", "readonly"); const store = tx.objectStore("records");
      const active = store.get("__active");
      active.onsuccess = () => {
        if (!active.result) { resolve(null); return; }
        const progress = store.get(active.result);
        progress.onsuccess = () => resolve(Date.parse(progress.result?.validUntil) > Date.now() ? active.result : null);
        progress.onerror = () => resolve(null);
      };
      active.onerror = () => resolve(null); tx.oncomplete = () => db.close();
    };
  });
  return key ? (await caches.open(`montreal-figures:${key}`)).match(request) : undefined;
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.destination === "image") {
    event.respondWith(fetch(request).catch(async () => await savedFigure(request) || Response.error()));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => await (await caches.open(SHELL)).match("/offline") || new Response("Connect once and download offline study in Settings.", { status: 503, headers: { "Content-Type": "text/plain" } })));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => { const cache = await caches.open(STATIC); const saved = await cache.match(request); if (saved) return saved; const response = await fetch(request); if (response.ok) await cache.put(request, response.clone()); return response; })());
  }
  // Authenticated HTML, RSC responses and APIs are never cached.
});
