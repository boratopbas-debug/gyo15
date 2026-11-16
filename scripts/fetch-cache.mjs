// Seed'deki tüm KAP bildirimlerini çekip ayrıştırır, data/cache/{idx}.json olarak saklar.
import fs from 'node:fs';
import { getBildirim } from '../lib/kap.mjs';
const seed = JSON.parse(fs.readFileSync('data/seed-2026-11.json', 'utf8'));
fs.mkdirSync('data/cache', { recursive: true });
const ids = [...new Set(seed.sirketler.flatMap(s => [s.kap, s.fy]).filter(Boolean))];
let i = 0, done = 0;
async function worker() {
  while (i < ids.length) {
    const id = ids[i++]; const f = `data/cache/${id}.json`;
    if (fs.existsSync(f)) { done++; continue; }
    try { const b = await getBildirim(id); fs.writeFileSync(f, JSON.stringify(b)); }
    catch (e) { console.error(id, e.message); }
    if (++done % 10 === 0) console.log(done, '/', ids.length);
  }
}
await Promise.all([1, 2, 3, 4].map(worker));
console.log('bitti', fs.readdirSync('data/cache').length);
