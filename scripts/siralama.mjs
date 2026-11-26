// Sıralamayı son 12, 6 ve 3 ay pencereleriyle hesaplar (sitedeki motorla aynı kod, karar hafızasının ilk hâli) ve
// public/data/siralama.json'a yazar. Excel: python3 scripts/tarihsel/siralama_excel.py
// Kullanım: node scripts/siralama.mjs
import fs from 'node:fs';
import { sirketHesapla, puanla, PENCERELER, KURAL } from '../public/lib/engine.mjs';

const oku = f => JSON.parse(fs.readFileSync(`public/data/${f}`, 'utf8'));
const seed = oku('seed.json'), kaynak = oku('kaynak.json'), hafiza = oku('hafiza-baslangic.json');
const veri = Object.fromEntries(oku('veri.json').satirlar.map(r => [r.k, r]));

const out = { olusturma: new Date().toISOString().slice(0, 16), fiyatTarihi: seed.fiyatTarihi, kural: KURAL, pencereler: {} };
for (const w of PENCERELER) {
  const liste = puanla(seed.sirketler.map(s0 => {
    const v = veri[s0.k];
    const s = { ...(v && v.rapor && v.rapor.idx === s0.kap ? { ...s0, kira12: v } : s0), pencere: w };
    return sirketHesapla(s, kaynak[s.kap], s.fy ? kaynak[s.fy] : null, hafiza, seed);
  }));
  const g = (r, k) => r.girdiler[k] ? r.girdiler[k].deger : null;
  out.pencereler[w] = liste.map(r => ({
    k: r.k, u: r.u, durum: r.durum, sira: r.sira, toplam: r.toplam,
    oran: Object.fromEntries(Object.entries(r.oranlar).map(([k, v]) => [k, v.deger])),
    puan: r.puan ? Object.fromEntries(Object.entries(r.puan).map(([k, v]) => [k, v.deger])) : null,
    PD: g(r, 'PD'), FD: g(r, 'FD'), TA: g(r, 'TA'),
    hasilat: w === 12 ? g(r, 'REV_LTM') : g(r, 'REV_W'), kira: w === 12 ? g(r, 'KIRA_LTM') : g(r, 'KIRA_W'), favok: w === 12 ? g(r, 'FAV_LTM') : g(r, 'FAV_W'),
    elenme: r.elenme, bayraklar: r.bayraklar.map(b => b[1]),
  }));
}
fs.writeFileSync('public/data/siralama.json', JSON.stringify(out));
for (const w of PENCERELER) console.log(`${w} ay:`, out.pencereler[w].filter(r => r.durum === 'Endeks').sort((a, b) => a.sira - b.sira).map(r => r.k).join(' '), '| yedek', out.pencereler[w].filter(r => r.durum === 'Yedek').map(r => r.k).join(' '));
