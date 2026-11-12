// Семья: фоновый помощник. Показывает уведомления о новых сообщениях.
'use strict';

const DB = 'semya', STORE = 'kv';

function idbGet(key) {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      try {
        const q = req.result.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        q.onsuccess = () => resolve(q.result || null);
        q.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    };
  });
}

function b64d(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Текст расшифровывается прямо на телефоне. Сервер его не видит.
async function preview(p) {
  const plain = 'Новое сообщение';
  if (!p.iv || !p.body || !p.sender) return plain;
  const keyB64 = await idbGet('familyKey');
  if (!keyB64) return plain;
  try {
    const key = await crypto.subtle.importKey('raw', b64d(keyB64), { name: 'AES-GCM' }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64d(p.iv), additionalData: new TextEncoder().encode(p.sender) }, key, b64d(p.body));
    const o = JSON.parse(new TextDecoder().decode(pt));
    if (o.f && o.f.kind === 'image') return '📷 Фото';
    if (o.f && o.f.kind === 'audio') return '🎤 Голосовое сообщение';
    if (o.f && o.f.kind === 'video') return '🎬 Видео';
    const t = String(o.t || '').trim();
    return t ? (t.length > 180 ? t.slice(0, 179) + '…' : t) : plain;
  } catch (e) { return plain; }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let p = {};
    try { p = e.data ? e.data.json() : {}; } catch (err) { p = {}; }
    const body = await preview(p);
    try { if (self.navigator.setAppBadge) await self.navigator.setAppBadge(); } catch (err) { /* значок не обязателен */ }
    await self.registration.showNotification(p.name || 'Семья', {
      body,
      tag: 'semya-' + (p.id || Date.now()),
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: './' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  })());
});
