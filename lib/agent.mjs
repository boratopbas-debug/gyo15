// Agent çekirdeği — adım adım çalışır, böylece Netlify'ın ücretsiz planındaki 30 sn fonksiyon sınırına sığar.
// 1) Kuyruk boşsa: KAP'ta son kontrolden bugüne FR bildirimlerini tarar, yeni GYO raporlarını kuyruğa koyar.
// 2) Zaman bütçesi bitene kadar kuyruktan rapor işler: XBRL'i çeker, karar hafızasını uygular, gerekirse öneri üretir.
import { searchFR, getBildirim, XBRL } from './kap.mjs';
import { seed, kaynakStatik, hafizaOku, guncelOku, kaynakEkOku, oku, yaz, gunlugeEkle } from './store.mjs';

const AY = { '3 Aylık': 3, '6 Aylık': 6, '9 Aylık': 9, '12 Aylık': 12 };
const lazim = new Set(Object.values(XBRL).flat());
const kompakt = b => ({ ...b, kalemler: Object.fromEntries(Object.entries(b.kalemler).filter(([k]) => lazim.has(k))) });
const sira = r => r.year * 10 + (AY[r.ruleType] || 0) / 3;
const deger = (b, ad) => { const c = b.paraBirimi?.includes('1.000') ? 1000 : 1; const k = b.kalemler[ad]; return k && k.cari != null ? k.cari * c : null; };

async function tara(durum, S, guncel) {
  const bugun = new Date().toISOString().slice(0, 10);
  const kayitlar = await searchFR(durum.sonKontrol, bugun);
  const kodlar = new Map(S.sirketler.map(s => [s.k, s]));
  for (const r of kayitlar) {
    const kod = (r.stockCodes || '').split(',')[0].trim();
    if (/GAYRİMENKUL YATIRIM ORTAKLIĞI/i.test(r.kapTitle) && kod && !kodlar.has(kod)) {
      await gunlugeEkle({ tur: 'uyari', k: kod, ozet: `Evrende olmayan bir GYO rapor yayımladı: ${r.kapTitle}. Havuza eklenmesi için kural seti kontrol edilmeli.`, url: `https://www.kap.org.tr/tr/Bildirim/${r.disclosureIndex}` });
    }
  }
  const kuyruk = [];
  for (const [k, s] of kodlar) {
    const mevcut = guncel[k] || { kap: s.kap, fy: s.fy, ay: s.ay || 9, year: 2026, ruleType: `${s.ay || 9} Aylık` };
    const yeni = kayitlar.filter(r => (r.stockCodes || '').split(',').map(x => x.trim()).includes(k) && AY[r.ruleType])
      .sort((a, b) => sira(b) - sira(a) || a.disclosureIndex - b.disclosureIndex)   // aynı dönemde ilk yayımlanan (TR) esas
      .find(r => r.disclosureIndex !== mevcut.kap && sira(r) > sira(mevcut));
    if (yeni) kuyruk.push({ k, idx: yeni.disclosureIndex, ruleType: yeni.ruleType, year: yeni.year, yayim: yeni.publishDate });
  }
  return { kuyruk, taranan: kayitlar.length, bugun };
}

async function isle(is, S, statik, hafiza, guncel, kaynakEk) {
  const s = S.sirketler.find(x => x.k === is.k);
  const k = is.k;
  const mevcut = guncel[k] || { kap: s.kap, fy: s.fy, ay: s.ay || 9, year: 2026, ruleType: `${s.ay || 9} Aylık` };
  const b = kompakt(await getBildirim(is.idx));
  kaynakEk[b.idx] = b;
  const ay = AY[is.ruleType];
  const sonraki = { kap: b.idx, ay, year: is.year, ruleType: is.ruleType, yayim: is.yayim };
  if (ay === 12) { sonraki.fy = null; sonraki.ltm = { yontem: 'yillik' }; sonraki.sonFy = b.idx; }
  else { sonraki.fy = mevcut.sonFy || s.fy; sonraki.kf = null; sonraki.sonFy = mevcut.sonFy || s.fy; }
  guncel[k] = sonraki;
  const bugun = new Date().toISOString().slice(0, 10);
  const d = hafiza[k];
  const donem = `${ay === 12 ? '12A' : ay + 'A'}${String(is.year).slice(2)}`;
  let sonuc;
  if (d && d.durum === 'onaylandi' && d.oneri.tip !== 'tutar') {
    d.uygulamalar = [...(d.uygulamalar || []), { donem, tarih: bugun }];
    sonuc = 'hafizadan';
    await gunlugeEkle({ tur: 'hafiza', k, ozet: `${k} ${donem}: kira tespiti hafızadan uygulandı (${d.oneri.tip === 'tamami' ? 'hasılatın tamamı kira' : 'kira yok'}).`, url: b.url });
  } else {
    const eskiIdx = d?.kaynakIdx || mevcut.kap;
    const eskiKaynak = kaynakEk[eskiIdx] || statik[eskiIdx];
    const eskiRev = eskiKaynak ? deger(eskiKaynak, 'ifrs-full_Revenue') : null;
    const eskiKira = d?.oneri?.tip === 'tutar' ? d.oneri.tutar : null;
    const oran = eskiRev && eskiKira != null ? Math.min(1, eskiKira / eskiRev) : null;
    const rev = deger(b, 'ifrs-full_Revenue');
    const oneri = oran != null && rev != null
      ? { tip: 'tutar', tutar: Math.round(rev * oran), not: `Önceki dönem kira/hasılat oranı (%${(oran * 100).toFixed(1)}) yeni hasılata uygulandı. Dipnottan teyit edilmeli.`, cikarim: true }
      : { tip: 'tutar', tutar: null, not: 'Yeni dönem kira tutarı dipnottan girilmeli.', cikarim: true };
    hafiza[k] = { id: `kira-${k}-${donem}`, k, konu: 'Kira geliri tespiti', donem, oneri, kalicilik: 'Bu dönem', kaynakIdx: b.idx, durum: 'bekliyor', onaylayan: null, tarih: null, notlar: [],
      gecmis: d ? [...(d.gecmis || []), { oneri: d.oneri, durum: d.durum, onaylayan: d.onaylayan, tarih: d.tarih, donem: d.donem }] : [], pdf: b.ekler[0] || null };
    sonuc = 'oneri';
    await gunlugeEkle({ tur: 'oneri', k, ozet: `${k} ${donem}: yeni rapor. ${oneri.not}`, url: b.url });
  }
  if (ay !== 12 && hafiza._TUFE?.donem !== donem) {
    hafiza._TUFE = { id: `tufe-${donem}`, k: '_TUFE', konu: 'TÜFE katsayısı (FY → dönem sonu alım gücü)', donem, oneri: { tip: 'parametre', deger: null, not: 'Dönem sonu TÜFE / FY sonu TÜFE. Yeniden düzenlenmiş önceki yıl bilançosundan kontrol edilmeli.' }, durum: 'bekliyor', notlar: [] };
  }
  return sonuc;
}

/** Bir adım çalıştırır. Dönüş: { bitti, kalan } */
export async function adim(butceMs = 20000) {
  const t0 = Date.now();
  const S = seed(), statik = kaynakStatik();
  let durum = await oku('agent-durum', { sonKontrol: '2026-11-12' });
  const hafiza = await hafizaOku(), guncel = await guncelOku(), kaynakEk = await kaynakEkOku();
  try {
    if (!durum.kuyruk) {
      const { kuyruk, taranan, bugun } = await tara(durum, S, guncel);
      durum = { ...durum, kuyruk, hedefTarih: bugun, taranan, ozet: { yeniRapor: 0, hafizadan: 0, onayBekleyen: 0, hata: 0 }, calisiyor: true, basladi: new Date().toISOString() };
      await yaz('agent-durum', durum);
    }
    while (durum.kuyruk.length && Date.now() - t0 < butceMs) {
      const is = durum.kuyruk.shift();
      try {
        const sonuc = await isle(is, S, statik, hafiza, guncel, kaynakEk);
        durum.ozet.yeniRapor++; durum.ozet[sonuc === 'hafizadan' ? 'hafizadan' : 'onayBekleyen']++;
      } catch (e) {
        durum.ozet.hata++;
        await gunlugeEkle({ tur: 'hata', k: is.k, ozet: `${is.k}: rapor işlenemedi — ${e.message}` });
      }
      await yaz('kaynak-ek', kaynakEk); await yaz('guncel', guncel); await yaz('hafiza', hafiza); await yaz('agent-durum', durum);
    }
    if (!durum.kuyruk.length) {
      const o = durum.ozet;
      await gunlugeEkle({ tur: 'calisma', ozet: `Agent çalıştı (${durum.sonKontrol} → ${durum.hedefTarih}): ${durum.taranan} FR bildirimi tarandı, ${o.yeniRapor} yeni GYO raporu, ${o.hafizadan} hafızadan uygulandı, ${o.onayBekleyen} onay bekliyor, ${o.hata} hata. Fiyat ve temettü verisi ${S.fiyatTarihi} tarihli.` });
      durum = { sonKontrol: durum.hedefTarih, calisiyor: false, sonCalisma: new Date().toISOString(), ozet: o };
      await yaz('agent-durum', durum);
      return { bitti: true, kalan: 0 };
    }
    return { bitti: false, kalan: durum.kuyruk.length };
  } catch (e) {
    await gunlugeEkle({ tur: 'hata', ozet: `Agent durdu: ${e.message}. KAP Netlify sunucularından gelen istekleri engelliyor olabilir.` });
    await yaz('agent-durum', { sonKontrol: durum.sonKontrol, calisiyor: false, sonHata: e.message, sonCalisma: new Date().toISOString() });
    return { bitti: true, hata: e.message };
  }
}
