// IndexedDB：所有資料（包含照片）都只存在這支手機裡

const DB_NAME = 'dresscab';
const DB_VERSION = 1;
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('items', { keyPath: 'id' });
      db.createObjectStore('outfits', { keyPath: 'id' });
      db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function getAll(name) {
  return done((await store(name)).getAll());
}

export async function put(name, value) {
  return done((await store(name, 'readwrite')).put(value));
}

export async function remove(name, id) {
  return done((await store(name, 'readwrite')).delete(id));
}

export async function clear(name) {
  return done((await store(name, 'readwrite')).clear());
}

export async function getKV(key, fallback) {
  const row = await done((await store('kv')).get(key));
  return row ? row.value : fallback;
}

export async function setKV(key, value) {
  return put('kv', { key, value });
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
