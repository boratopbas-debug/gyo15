// Önbellekteki KAP verisi + seed + karar hafızası ile çalıştırma üretir.
import fs from 'node:fs';
import { sirketHesapla, puanla, KURAL } from '../public/lib/engine.mjs';
const seed = JSON.parse(fs.readFileSync('data/seed-2026-11.json', 'utf8'));
const hafiza = fs.existsSync('data/hafiza.json') ? JSON.parse(fs.readFileSync('data/hafiza.json', 'utf8')) : {};
const c = id => id ? JSON.parse(fs.readFileSync(`data/cache/${id}.json`, 'utf8')) : null;
const liste = puanla(seed.sirketler.map(s => sirketHesapla(s, c(s.kap), c(s.fy), hafiza, seed)));
const run = { id: process.argv[2] || 'on-tarama-2026-11-11', olusturma: new Date().toISOString(), kural: KURAL, fiyatTarihi: seed.fiyatTarihi, sirketler: liste };
fs.mkdirSync('data/runs', { recursive: true });
fs.writeFileSync(`data/runs/${run.id}.json`, JSON.stringify(run));
console.log(liste.filter(r => r.sira).map(r => `${r.sira}.${r.k} ${r.toplam.toFixed(2)} ${r.durum}`).join('\n'));
console.log('elenen', liste.filter(r => r.durum === 'Elendi').map(r => r.k).join(' '));
