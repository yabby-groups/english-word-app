import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const storePath = path.join(dataDir, 'practice-prompts.json');

async function readItems() {
  try {
    const parsed = JSON.parse(await readFile(storePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeItems(items) {
  await mkdir(dataDir, { recursive: true });
  const temporaryPath = `${storePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, storePath);
}

export async function addPracticePrompts(prompts) {
  const items = await readItems();
  items.push(...prompts);
  await writeItems(items);
  return prompts;
}

export async function listPracticePrompts(type, difficulty, page = 1) {
  const items = (await readItems()).filter((item) => item.type === type && item.difficulty === difficulty && !item.masteredAt && item.translation && Array.isArray(item.phonetics) && item.phonetics.length);
  const total = items.length;
  const safePage = total ? Math.max(1, Math.min(total, Number(page) || 1)) : 1;
  return { item: total ? items[safePage - 1] : null, page: safePage, total };
}

export async function getReadyPracticePrompts(type, difficulty, count = 5) {
  const items = (await readItems()).filter((item) => item.type === type && item.difficulty === difficulty && !item.masteredAt && !item.servedAt && item.translation && Array.isArray(item.phonetics) && item.phonetics.length);
  return { items: items.slice(-count), total: items.length };
}

export async function claimPracticePrompts(type, difficulty, count = 5) {
  const items = await readItems();
  const visible = items.filter((item) => item.type === type && item.difficulty === difficulty && !item.masteredAt && item.translation && Array.isArray(item.phonetics) && item.phonetics.length);
  const candidates = visible.filter((item) => !item.servedAt).slice(-count);
  const firstPage = candidates.length ? visible.findIndex((item) => item.id === candidates[0].id) + 1 : 1;
  if (candidates.length < count) return { items: candidates, available: candidates.length, firstPage, total: visible.length };
  const claimedAt = new Date().toISOString();
  const ids = new Set(candidates.map((item) => item.id));
  items.forEach((item) => { if (ids.has(item.id)) item.servedAt = claimedAt; });
  await writeItems(items);
  return { items: candidates.map((item) => ({ ...item, servedAt: claimedAt })), available: candidates.length, firstPage, total: visible.length };
}

export async function listMasteredPracticePrompts(type, difficulty, page = 1) {
  const items = (await readItems()).filter((item) => item.type === type && item.difficulty === difficulty && item.masteredAt);
  const total = items.length;
  const safePage = total ? Math.max(1, Math.min(total, Number(page) || 1)) : 1;
  return { item: total ? items[safePage - 1] : null, page: safePage, total };
}

export async function setPracticePromptMastered(id, mastered) {
  return updatePracticePrompt(id, { masteredAt: mastered ? new Date().toISOString() : null });
}

export async function isPracticePromptMastered(id) {
  const items = await readItems();
  return items.some((item) => item.id === id && item.masteredAt);
}

export async function updatePracticePrompt(id, details) {
  if (!id) return null;
  const items = await readItems();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  items[index] = { ...items[index], ...details };
  await writeItems(items);
  return items[index];
}
