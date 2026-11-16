// KAP erişimi ve XBRL tablo ayrıştırma. Netlify fonksiyonları ve yerel betikler ortak kullanır.

import { XBRL } from '../public/lib/kap-xbrl.mjs';
export { XBRL };
const KAP = 'https://www.kap.org.tr';
const UA = { 'User-Agent': 'Mozilla/5.0 (OSG15 agent)', 'Accept-Language': 'tr' };

export async function fetchText(url, opts = {}, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } });
      if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
      return await r.text();
    } catch (e) { err = e; await new Promise(s => setTimeout(s, 1500 * (i + 1))); }
  }
  throw err;
}

/** FR (finansal rapor) bildirimleri; tarih aralığı haftalık parçalara bölünür (istek başına 2000 kayıt sınırı). */
export async function searchFR(fromISO, toISO) {
  const out = [];
  let a = new Date(fromISO);
  const end = new Date(toISO);
  while (a <= end) {
    const b = new Date(Math.min(end, new Date(a.getTime() + 6 * 864e5)));
    const body = {
      fromDate: a.toISOString().slice(0, 10), toDate: b.toISOString().slice(0, 10), memberType: 'IGS', disclosureClass: 'FR',
      subjectList: [], mkkMemberOidList: [], inactiveMkkMemberOidList: [], bdkMemberOidList: [], mainSector: '', sector: '',
      subSector: '', marketOidList: [], isLate: '', term: '', ruleType: '', period: '', year: '', index: '', fromSrc: false, srcCategory: '', discIndex: [],
    };
    const t = await fetchText(`${KAP}/tr/api/disclosure/members/byCriteria`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    out.push(...JSON.parse(t));
    a = new Date(b.getTime() + 864e5);
  }
  // yalnızca asıl "Finansal Rapor" bildirimleri
  return out.filter(r => r.disclosureCategory === 'FR' && /Finansal Rapor/i.test(r.subject || ''));
}

function unescapeKap(h) {
  return h.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\"/g, '"').replace(/\\r\\n/g, ' ').replace(/\\u0026/g, '&');
}

/** Bildirim sayfasını ayrıştırır: XBRL kalemleri (cari/önceki dönem), nitelik, para birimi, ekler. */
export function parseBildirim(raw) {
  const h = unescapeKap(raw);
  const nitelik = (h.match(/Finansal Tablo Niteliği<\/td>\s*<td>([^<]+)</) || [])[1]?.trim() || null;
  const paraBirimi = (h.match(/Sunum Para Birimi<\/td>\s*<td>([^<]+)</) || [])[1]?.trim() || null;
  const ekler = [...h.matchAll(/href="(https:\/\/www\.kap\.org\.tr\/tr\/api\/file\/download\/[0-9a-f]{32})">([^<]+)<\/a>/g)]
    .map(m => ({ url: m[1], ad: m[2].trim() }))
    .filter((e, i, a) => a.findIndex(x => x.url === e.url) === i);
  const kalemler = {};      // ad → { cari, onceki, etiket, tablo }
  const tablolar = {};      // rol → { cariBaslik, oncekiBaslik }
  const parts = h.split(/<table class="financial-table (tbl_[a-z_0-9]+)"/);
  for (let i = 1; i < parts.length; i += 2) {
    const rol = parts[i], body = parts[i + 1];
    const basliklar = [...body.slice(0, 20000).matchAll(/(Cari Dönem|Önceki Dönem)(?:\s*3 Aylık)?\s*<\/div>.*?(\d{2}\.\d{2}\.\d{4}(?:\s*-\s*\d{2}\.\d{2}\.\d{4})?)/gs)]
      .map(m => m[2].replace(/\s+/g, ' '));
    if (!tablolar[rol]) tablolar[rol] = { cari: basliklar[0] || null, onceki: basliklar[1] || null };
    const rows = body.split(/<tr class="[^"]*data-input-row/);
    for (const r of rows.slice(1)) {
      const m = r.match(/taxonomy-field-name">([^|<]+)/);
      if (!m) continue;
      const ad = m[1].trim();
      if (kalemler[ad] && kalemler[ad].tablo === rol) continue;    // TR/EN tekrarları
      if (kalemler[ad]) continue;                                    // ilk görülen tablo esas
      const etiket = (r.match(/content-tr" style="display: block;">([^<]*)<\/div>/) || [])[1] || '';
      const v = {};
      for (const x of r.matchAll(/col-order-class-(\d+)"><div><div([^>]*)>/g)) {
        if (x[1] in v) continue;
        const t = x[2].match(/title="([^"]*)"/);           // boş hücrede title yok → null (sütun kaymasın)
        v[x[1]] = t && t[1] !== '' ? Number(t[1]) : null;
      }
      const cols = Object.keys(v).map(Number).sort((a, b) => a - b);
      if (!cols.length) continue;
      kalemler[ad] = { cari: v[cols[0]] ?? null, onceki: cols.length > 1 ? v[cols[1]] ?? null : null, etiket: etiket.trim(), tablo: rol };
    }
  }
  return { nitelik, paraBirimi, ekler, kalemler, tablolar };
}

export async function getBildirim(idx) {
  const raw = await fetchText(`${KAP}/tr/Bildirim/${idx}`);
  return { idx, url: `${KAP}/tr/Bildirim/${idx}`, ...parseBildirim(raw) };
}

export function pick(b, key, col = 'cari') {
  for (const ad of XBRL[key]) {
    const k = b.kalemler[ad];
    if (k && k[col] != null) return { deger: k[col], ad, etiket: k.etiket, tablo: k.tablo };
  }
  return { deger: 0, ad: XBRL[key][0], etiket: '(raporda yok → 0)', tablo: null };
}
