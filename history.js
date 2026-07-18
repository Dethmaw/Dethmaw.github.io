// On-device history of imported chats, stored in IndexedDB (raw bytes re-parsed on open).
// Zero deps. Everything stays on the device — nothing is uploaded.
const DB = "wa-stats", STORE = "chats";

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx(mode, fn) {
  return openDB().then((db) => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req?.result);
    t.onerror = t.onabort = () => rej(t.error);
  }));
}

// Store one chat's raw bytes + metadata; returns its new id.
export function saveChat(name, bytes, isZip) {
  return tx("readwrite", (s) => s.add({ name, isZip, date: Date.now(), size: bytes.byteLength, bytes }));
}

// Metadata for every saved chat, newest first (bytes omitted for a light list).
export function listChats() {
  return tx("readonly", (s) => s.getAll()).then((rows) =>
    rows.map(({ id, name, date, size, isZip }) => ({ id, name, date, size, isZip }))
      .sort((a, b) => b.date - a.date));
}

export function getChat(id) { return tx("readonly", (s) => s.get(id)); }
export function deleteChat(id) { return tx("readwrite", (s) => s.delete(id)); }
