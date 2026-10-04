// IndexedDB layer: the ONLY file that touches indexedDB. Swap this for API calls later (e.g. MongoDB).
const STORES = { users:['email','role'], vendors:['email','status'], technicians:['vendorId'], categories:[],
  services:['categoryId'], bookings:['userId','vendorId','technicianId','status'], payments:['bookingId'],
  reviews:['vendorId','bookingId'], notifications:['recipientId'] };
let db;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export function initializeDB() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open('FixHubDB', 1);
    r.onupgradeneeded = () => { // runs on first open / version change
      for (const [s, idx] of Object.entries(STORES)) {
        const st = r.result.createObjectStore(s, { keyPath: 'id' });
        [...idx, 'createdAt'].forEach(i => st.createIndex(i, i));
      }
    };
    r.onsuccess = () => { db = r.result; ok(db); };
    r.onerror = () => fail(r.error);
  });
}
const run = (s, mode, fn) => new Promise((ok, fail) => {
  const t = db.transaction(s, mode); const q = fn(t.objectStore(s));
  t.oncomplete = () => ok(q && q.result); t.onerror = t.onabort = () => fail(t.error);
});
export const addRecord = (s, o) => { o.id ||= uid(); o.createdAt ||= new Date().toISOString(); return run(s, 'readwrite', st => st.add(o)).then(() => o); }; // add() rejects duplicate ids
export const getRecord = (s, id) => run(s, 'readonly', st => st.get(id));
export const getAllRecords = s => run(s, 'readonly', st => st.getAll());
export const deleteRecord = (s, id) => run(s, 'readwrite', st => st.delete(id));
export const queryRecords = async (s, fn) => (await getAllRecords(s)).filter(fn);
export async function updateRecord(s, id, patch) {
  const old = await getRecord(s, id); if (!old) throw new Error('Record not found');
  const n = { ...old, ...patch, id }; await run(s, 'readwrite', st => st.put(n)); return n;
}
