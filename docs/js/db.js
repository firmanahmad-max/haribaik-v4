// db.js — wrapper IndexedDB untuk conversation history, favorites, dan meta.
// Tiga object store: 'messages', 'favorites', 'meta'.

const DB_NAME = 'haribaik';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('favorites')) {
        const fav = db.createObjectStore('favorites', { keyPath: 'id', autoIncrement: true });
        fav.createIndex('source_type', 'source_type', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const result = fn(s);
        t.oncomplete = () => resolve(result?._value ?? result);
        t.onerror = () => reject(t.error);
      })
  );
}

function reqValue(request) {
  // Bungkus IDBRequest agar nilainya bisa diambil setelah transaksi selesai.
  const box = { _value: undefined };
  request.onsuccess = () => {
    box._value = request.result;
  };
  return box;
}

// ---------- messages ----------
export const Messages = {
  add: (msg) => tx('messages', 'readwrite', (s) => reqValue(s.add({ ...msg, ts: Date.now() }))),
  all: () => tx('messages', 'readonly', (s) => reqValue(s.getAll())),
  clear: () => tx('messages', 'readwrite', (s) => s.clear()),
};

// ---------- favorites ----------
export const Favorites = {
  add: (fav) => tx('favorites', 'readwrite', (s) => reqValue(s.add({ ...fav, ts: Date.now() }))),
  remove: (id) => tx('favorites', 'readwrite', (s) => s.delete(id)),
  all: () => tx('favorites', 'readonly', (s) => reqValue(s.getAll())),
};

// ---------- reports (kutipan yang dilaporkan, disimpan lokal) ----------
export const Reports = {
  add: async (item) => {
    const list = (await Meta.get('reports', [])) || [];
    list.push({ ...item, ts: Date.now() });
    await Meta.set('reports', list.slice(-100));
    return list.length;
  },
  all: () => Meta.get('reports', []),
};

// ---------- meta (key/value) ----------
export const Meta = {
  get: async (key, fallback = null) => {
    const v = await tx('meta', 'readonly', (s) => reqValue(s.get(key)));
    return v ? v.value : fallback;
  },
  set: (key, value) => tx('meta', 'readwrite', (s) => s.put({ key, value })),
};

// Hapus seluruh data pengguna (riwayat, favorit, pengaturan).
export async function resetAll() {
  await Messages.clear();
  await tx('favorites', 'readwrite', (s) => s.clear());
  await tx('meta', 'readwrite', (s) => s.clear());
}

// Helper counter rotasi (persisten).
export async function nextRequestCount() {
  const current = (await Meta.get('requestCount', 0)) || 0;
  await Meta.set('requestCount', current + 1);
  return current; // kembalikan nilai SEBELUM increment (dipakai untuk request ini)
}
