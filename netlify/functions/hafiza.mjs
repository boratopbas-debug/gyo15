// POST /api/hafiza — karar hafızasında onay / değiştirme / not / geri alma.
// Gövde: { k, eylem: 'onayla'|'degistir'|'not'|'geri_al', oneri?, not?, kullanici }
import { hafizaOku, yaz, gunlugeEkle, json } from '../../lib/store.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ hata: 'POST bekleniyor' }, 405);
  const g = await req.json();
  const h = await hafizaOku();
  const d = h[g.k];
  if (!d) return json({ hata: `${g.k} için karar yok` }, 404);
  const kim = (g.kullanici || 'Bilinmiyor').slice(0, 60), tarih = new Date().toISOString().slice(0, 10);
  if (g.eylem === 'onayla') {
    if (d.oneri && d.oneri.tip === 'tutar' && !(d.oneri.tutar >= 0)) return json({ hata: 'Önerinin tutarı yok; önce değiştir ile tutar gir' }, 400);
    if (d.oneri && d.oneri.tip === 'parametre' && !(d.oneri.deger > 0)) return json({ hata: 'Katsayı değeri yok; önce değiştir ile değer gir' }, 400);
    Object.assign(d, { durum: 'onaylandi', onaylayan: kim, tarih });
  } else if (g.eylem === 'degistir') {
    const o = g.oneri || {};
    if (o.tip === 'parametre') {
      if (!(Number(o.deger) > 0)) return json({ hata: 'katsayı pozitif sayı olmalı' }, 400);
      d.gecmis = [...(d.gecmis || []), { oneri: d.oneri, durum: d.durum }];
      d.oneri = { ...d.oneri, deger: Number(o.deger), not: (o.not || '').slice(0, 1000) || d.oneri.not };
      Object.assign(d, { durum: 'onaylandi', onaylayan: kim, tarih });
      await yaz('hafiza', h);
      await gunlugeEkle({ tur: 'karar', k: g.k, eylem: 'degistir', kim, ozet: `${d.konu} ${d.donem}: ${o.deger} olarak onaylandı` });
      return json({ ok: true, karar: d });
    }
    if (!['tamami', 'sifir', 'tutar'].includes(o.tip)) return json({ hata: 'tip tamami/sifir/tutar olmalı' }, 400);
    if (o.tip === 'tutar' && !(Number(o.tutar) >= 0)) return json({ hata: 'tutar sayı olmalı' }, 400);
    d.gecmis = [...(d.gecmis || []), { oneri: d.oneri, durum: d.durum, onaylayan: d.onaylayan, tarih: d.tarih }];
    d.oneri = { tip: o.tip, ...(o.tip === 'tutar' ? { tutar: Number(o.tutar) } : {}), not: (o.not || '').slice(0, 1000) || d.oneri.not, cikarim: false };
    d.kalicilik = o.tip === 'tutar' ? 'Bu dönem' : 'Kalıcı (sonraki dönemlerde de uygulanır)';
    Object.assign(d, { durum: 'onaylandi', onaylayan: kim, tarih });
  } else if (g.eylem === 'not') {
    d.notlar = [...(d.notlar || []), { kim, tarih, metin: (g.not || '').slice(0, 1000) }];
  } else if (g.eylem === 'geri_al') {
    Object.assign(d, { durum: 'bekliyor', onaylayan: null, tarih: null });
  } else return json({ hata: 'bilinmeyen eylem' }, 400);
  await yaz('hafiza', h);
  await gunlugeEkle({ tur: 'karar', k: g.k, eylem: g.eylem, kim, ozet: `${g.k} kira tespiti: ${g.eylem}${g.not ? ' — ' + g.not.slice(0, 120) : ''}` });
  return json({ ok: true, karar: d });
};
