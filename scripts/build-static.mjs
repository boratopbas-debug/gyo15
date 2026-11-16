// public/data altına tarayıcının ihtiyaç duyduğu kompakt kaynak paketini ve ilk karar hafızasını yazar.
import fs from 'node:fs';
import { XBRL } from '../public/lib/kap-xbrl.mjs';
const seed = JSON.parse(fs.readFileSync('data/seed-2026-11.json', 'utf8'));
const lazim = new Set(Object.values(XBRL).flat());
const kaynak = {};
for (const f of fs.readdirSync('data/cache')) {
  const b = JSON.parse(fs.readFileSync('data/cache/' + f, 'utf8'));
  kaynak[b.idx] = { ...b, kalemler: Object.fromEntries(Object.entries(b.kalemler).filter(([k]) => lazim.has(k))) };
}
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/kaynak.json', JSON.stringify(kaynak));
fs.writeFileSync('public/data/seed.json', JSON.stringify(seed));
// İlk karar hafızası: çıkarımla yapılan kira tespitleri onay bekler, diğerleri dipnotta açıkça "kira" geçtiği için onaylı başlar.
const hafiza = {};
for (const s of seed.sirketler) {
  hafiza[s.k] = {
    id: `kira-${s.k}-2026Q3`, k: s.k, konu: 'Kira geliri tespiti', donem: s.ay === 6 ? '6A26' : '9A26',
    oneri: s.kira, kaynakIdx: s.kap, kalicilik: s.kira.tip === 'tutar' ? 'Bu dönem' : 'Kalıcı (sonraki dönemlerde de uygulanır)',
    durum: s.kira.cikarim ? 'bekliyor' : 'onaylandi',
    onaylayan: s.kira.cikarim ? null : 'İlk tarama (dipnotta açık kira kalemi)', tarih: s.kira.cikarim ? null : '2026-11-11',
    sonucuDegistirir: !!s.kira.sonucuDegistirir, notlar: [],
  };
}
fs.writeFileSync('public/data/hafiza-baslangic.json', JSON.stringify(hafiza, null, 1));
console.log('kaynak', (fs.statSync('public/data/kaynak.json').size / 1024).toFixed(0), 'KB; bekleyen karar', Object.values(hafiza).filter(h => h.durum === 'bekliyor').length);
