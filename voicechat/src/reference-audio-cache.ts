const DB_NAME = 'echo-practice-reference-audio';
const STORE_NAME = 'audio';
const MAX_AUDIO_ITEMS = 60;
const MAX_AUDIO_BYTES = 80 * 1024 * 1024;

type CachedAudio = { key: string; blob: Blob; savedAt: number };

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
      store.createIndex('savedAt', 'savedAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadReferenceAudio(key: string) {
  const database = await openDatabase();
  return new Promise<Blob | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    request.onsuccess = () => { database.close(); resolve((request.result as CachedAudio | undefined)?.blob || null); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

export async function saveReferenceAudio(key: string, blob: Blob) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ key, blob, savedAt: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  const records = await new Promise<CachedAudio[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as CachedAudio[]);
    request.onerror = () => reject(request.error);
  });
  let retainedBytes = 0;
  const expired = records.sort((a, b) => b.savedAt - a.savedAt).filter((record, index) => {
    retainedBytes += record.blob.size;
    return index >= MAX_AUDIO_ITEMS || retainedBytes > MAX_AUDIO_BYTES;
  });
  if (expired.length) await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    expired.forEach((record) => transaction.objectStore(STORE_NAME).delete(record.key));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
