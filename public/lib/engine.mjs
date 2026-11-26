// OSG15 GYO endeks motoru. Her sayı kaynağıyla birlikte üretilir: {deger, kaynak} ya da {deger, formul, girdiler}.
// Tarayıcıda ve Netlify fonksiyonlarında aynı kod çalışır.

import { XBRL } from './kap-xbrl.mjs';

export const KURAL = {
  surum: 'Kural seti taslağı (Kasım 2026)',
  agirlik: { pddd: 50, fav: 20, dy: 20, cr: 5, lev: 5 },
  yon: { pddd: 'kucuk', fav: 'buyuk', dy: 'buyuk', cr: 'buyuk', lev: 'kucuk' },
  levSinir: 0.85, kiraHasilatMin: 0.15, kiraVarlikMin: 0.025,
  endeksSayisi: 15, yedekSayisi: 2,
};

export const ORAN_AD = {
  pddd: 'PD/DD', fav: 'FAVÖK/FD', dy: 'Temettü verimi', cr: 'Cari oran', lev: 'Yükümlülük/Varlık',
  kg: 'Kira/Hasılat (12 ay)', kv: 'Kira/Varlık (12 ay)',
};

/** Akım kalemleri (FAVÖK, hasılat, kira) için pencere: son 12, 6 ya da 3 ay. */
export const PENCERELER = [12, 6, 3];
export const pencereAd = w => `son ${w} ay`;
export function oranAd(o, w = 12) {
  if (o === 'kg') return `Kira/Hasılat (${w} ay)`;
  if (o === 'kv') return w === 12 ? 'Kira/Varlık (12 ay)' : `Kira/Varlık (${w} ay, yıllık)`;
  if (o === 'fav') return w === 12 ? 'FAVÖK/FD' : `FAVÖK/FD (${w} ay, yıllık)`;
  return ORAN_AD[o];
}

function xbrlDeger(b, key, kolon, carpan) {
  for (const ad of XBRL[key]) {
    const k = b.kalemler[ad];
    if (k && k[kolon] != null) {
      return { deger: k[kolon] * carpan, kaynak: { tur: 'xbrl', bildirim: b.idx, url: b.url, kalem: ad, etiket: k.etiket, kolon: kolon === 'cari' ? 'Cari dönem' : 'Önceki dönem', birim: b.paraBirimi } };
    }
  }
  return { deger: 0, kaynak: { tur: 'xbrl', bildirim: b.idx, url: b.url, kalem: XBRL[key][0], etiket: 'Raporda bu kalem yok, 0 alındı', kolon, birim: b.paraBirimi } };
}

const T = (deger, formul, girdiler, not) => ({ deger, formul, girdiler, ...(not ? { not } : {}) });

/** Tek şirket için tüm girdiler ve oranlar, kaynaklarıyla. */
export function sirketHesapla(s, bild, fyBild, hafiza, meta) {
  const c = bild.paraBirimi && bild.paraBirimi.includes('1.000') ? 1000 : 1;
  const cf = fyBild ? (fyBild.paraBirimi && fyBild.paraBirimi.includes('1.000') ? 1000 : 1) : 1;
  const ay = s.ay || 9;
  const g = {};
  for (const k of ['CA', 'CL', 'TA', 'TL', 'EQ', 'REV', 'CASH', 'CFI', 'STB', 'CPLTB', 'LTB', 'OFL_C', 'OFL_N'])
    g[k] = xbrlDeger(bild, k, 'cari', c);

  // FAVÖK = Brüt kâr + Pazarlama + GYG + Ar-Ge (giderler negatif işaretli) + Amortisman düzeltmesi
  const favok = (b, kolon, cc) => {
    const p = ['GP', 'MKT', 'GA', 'RD', 'DA'].map(k => [k, xbrlDeger(b, k, kolon, cc)]);
    return T(p.reduce((t, [, v]) => t + v.deger, 0), 'Brüt Kâr − Pazarlama − GYG − Ar-Ge + Amortisman', Object.fromEntries(p));
  };
  g.FAV_DONEM = favok(bild, 'cari', c);
  g.FAV_ONCEKI = favok(bild, 'onceki', c);

  if (s.ltm && s.ltm.deger != null) {
    g.FAV_LTM = { deger: s.ltm.deger, kaynak: { tur: 'harici', aciklama: s.ltm.kaynak, neden: s.ltm.neden } };
  } else if (s.ltm && s.ltm.yontem === 'yillik') {
    g.FAV_LTM = T(g.FAV_DONEM.deger, 'Yıllık rapor: FAVÖK (12 ay) doğrudan', { FAV_DONEM: g.FAV_DONEM });
  } else if (s.ltm && s.ltm.yontem === 'yilliklandir') {
    g.FAV_LTM = T(g.FAV_DONEM.deger * 12 / ay, `FAVÖK (${ay} ay) × 12/${ay}`, { FAV_DONEM: g.FAV_DONEM }, s.ltm.kaynak);
  } else {
    g.FAV_FY = favok(fyBild, 'cari', cf);
    const kf = s.kf ?? 1;
    g.KF = { deger: kf, kaynak: { tur: 'parametre', aciklama: s.kf == null ? 'TÜFE katsayısı bu dönem için henüz onaylanmadı; geçici olarak 1 alındı' : (s.kfAciklama || meta.tufeKatsayisi.aciklama) } };
    g.FAV_LTM = T(g.FAV_DONEM.deger + g.FAV_FY.deger * kf - g.FAV_ONCEKI.deger,
      `FAVÖK dönem + FAVÖK FY × TÜFE katsayısı − FAVÖK önceki yıl aynı dönem`,
      { FAV_DONEM: g.FAV_DONEM, FAV_FY: g.FAV_FY, KF: g.KF, FAV_ONCEKI: g.FAV_ONCEKI });
  }

  g.ND = T(['STB', 'CPLTB', 'LTB', 'OFL_C', 'OFL_N'].reduce((t, k) => t + g[k].deger, 0) - g.CASH.deger - g.CFI.deger,
    'KV borçlanma + UV borçlanmanın KV kısmı + UV borçlanma + diğer finansal yük. − nakit − KV finansal yatırımlar',
    { STB: g.STB, CPLTB: g.CPLTB, LTB: g.LTB, OFL_C: g.OFL_C, OFL_N: g.OFL_N, CASH: g.CASH, CFI: g.CFI });

  const piyasa = { tur: 'piyasa', aciklama: `${meta.fiyatKaynagi}, ${meta.fiyatTarihi}` };
  g.PX = { deger: s.px, kaynak: piyasa };
  g.PD = { deger: s.pd, kaynak: { ...piyasa, aciklama: `Toplam pay sayısı × kapanış (${meta.fiyatTarihi})` } };
  g.FD = T(g.PD.deger + g.ND.deger, 'Piyasa değeri + Net borç', { PD: g.PD, ND: g.ND });
  g.DIV = T(s.divl.reduce((t, d) => t + d[1], 0), '2026 GK kararlı nakit temettü taksitleri + avanslar',
    Object.fromEntries(s.divl.map((d, i) => [`ODEME_${i + 1}`, { deger: d[1], kaynak: { ...piyasa, aciklama: `Temettü ödemesi ${d[0]} — ${meta.fiyatKaynagi}` } }])));

  // Kira geliri: karar hafızası → seed
  const karar = hafiza[s.k] || null;
  const kira = karar && karar.oneri && (karar.oneri.tip !== 'tutar' || karar.oneri.tutar != null) ? karar.oneri : s.kira;
  let rent;
  const kiraKaynak = { tur: 'karar', aciklama: kira.not, karar: karar ? { id: karar.id, durum: karar.durum, onaylayan: karar.onaylayan, tarih: karar.tarih } : null, pdf: bild.ekler[0] || null };
  if (kira.tip === 'tamami') rent = T(g.REV.deger, 'Hasılatın tamamı kira kabul edildi', { REV: g.REV }, kira.not);
  else if (kira.tip === 'sifir') rent = { deger: 0, kaynak: kiraKaynak };
  else rent = { deger: kira.tutar, kaynak: kiraKaynak };
  rent.kaynak = rent.kaynak || kiraKaynak;
  g.KIRA = rent;

  kira12Hesapla(g, s, bild, fyBild, c, cf, ay, kira);

  const w = s.pencere || 12;
  const kiraBayrak = [];
  // Oranlarda kullanılan akımlar: 12 ayda LTM, 6/3 ayda pencere köprüsü (Kira/Varlık ve FAVÖK/FD için × 12/w ile yıllığa çevrilir)
  let FAV, REV, KIRA, FAVY, KIRAY;
  if (w === 12) {
    FAV = FAVY = g.FAV_LTM; REV = g.REV_LTM; KIRA = KIRAY = g.KIRA_LTM;
  } else {
    pencereHesapla(g, s, ay, w, kiraBayrak);
    FAV = g.FAV_W; REV = g.REV_W; KIRA = g.KIRA_W;
    FAVY = T(FAV.deger * 12 / w, `FAVÖK (son ${w} ay) × 12/${w}`, { FAV_W: FAV });
    KIRAY = T(KIRA.deger * 12 / w, `Kira geliri (son ${w} ay) × 12/${w}`, { KIRA_W: KIRA });
    g.FAV_WY = FAVY; g.KIRA_WY = KIRAY;
  }
  const fk = w === 12 ? 'FAV_LTM' : 'FAV_WY', rk = w === 12 ? 'REV_LTM' : 'REV_W', kk = w === 12 ? 'KIRA_LTM' : 'KIRA_W', kyk = w === 12 ? 'KIRA_LTM' : 'KIRA_WY';
  const yil = w === 12 ? '' : ', yıllık';

  const o = {
    cr: T(g.CL.deger ? g.CA.deger / g.CL.deger : null, 'Dönen varlıklar / KV yükümlülükler', { CA: g.CA, CL: g.CL }),
    lev: T(g.TL.deger / g.TA.deger, 'Toplam yükümlülükler / Toplam varlıklar', { TL: g.TL, TA: g.TA }),
    fav: T(FAVY.deger / g.FD.deger, `FAVÖK (son ${w} ay${yil}) / Firma değeri`, { [fk]: FAVY, FD: g.FD }),
    pddd: T(g.PD.deger / g.EQ.deger, 'Piyasa değeri / Defter değeri (ana ortaklık özkaynakları)', { PD: g.PD, EQ: g.EQ }),
    dy: T(g.DIV.deger / g.PD.deger * 100, 'Brüt nakit temettü / Piyasa değeri × 100', { DIV: g.DIV, PD: g.PD }),
    kg: T(REV.deger ? KIRA.deger / REV.deger : 0, `Kira geliri (son ${w} ay) / Hasılat (son ${w} ay)`, { [kk]: KIRA, [rk]: REV }),
    kv: T(g.TA.deger ? KIRAY.deger / g.TA.deger : 0, `Kira geliri (son ${w} ay${yil}) / Toplam varlıklar`, { [kyk]: KIRAY, TA: g.TA }),
  };
  const elenme = [];
  if (w === 12) {
    if (g.KIRA_LTM.yilliklandi) kiraBayrak.push(['kira', `Son 12 ay kira yıllıklandırıldı: ${g.KIRA_LTM.not}`]);
    else if (g.KIRA_LTM.tahmini) kiraBayrak.push(['kira', 'Son 12 ay kira: yıllık ya da önceki yıl tutarı tahmini (dönem kira/hasılat oranından)']);
  }
  if (KIRA.deger < 0) kiraBayrak.push(['kira', `Son ${w} ay kira negatif çıktı; köprü bileşenleri kontrol edilmeli`]);
  if (o.lev.deger > KURAL.levSinir) elenme.push(`Yükümlülük/Varlık %${(o.lev.deger * 100).toFixed(1)} > %85`);
  if (o.kg.deger < KURAL.kiraHasilatMin && o.kv.deger < KURAL.kiraVarlikMin) elenme.push(`Kira/Hasılat %${(o.kg.deger * 100).toFixed(1)} < %15 ve Kira/Varlık %${(o.kv.deger * 100).toFixed(2)} < %2,5 (son ${w} ay)`);

  return {
    k: s.k, u: s.u, pz: s.pz, ay, pencere: w, nitelik: bild.nitelik, birim: bild.paraBirimi, donem: bild.tablolar && Object.values(bild.tablolar)[0]?.cari,
    kap: bild.url, fy: fyBild ? fyBild.url : null, ekler: bild.ekler, girdiler: g, oranlar: o, elenme, bayraklar: [...(s.fl || []), ...kiraBayrak],
    kiraKarar: karar, kiraCikarim: !!kira.cikarim,
  };
}

/** Son w ay (6 ya da 3) hasılat, kira ve FAVÖK: son rapor (kümülatif) − aynı mali yılın ara raporu × TÜFE katsayısı.
 *  Ara rapor tutarları veri tablosundan (scripts/tarihsel/veri.py → data/veri.json, s.kira12.pencere[w]) gelir;
 *  son rapor tutarları 12 aylık hesaptakiyle aynıdır. Veri tablosu bu raporla eşleşmezse dönem × w/ay ile orantılanır. */
function pencereHesapla(g, s, ay, w, bayrak) {
  const v = s.kira12 || null;
  const p = v && v.pencere ? v.pencere[String(w)] : null;
  const veriKay = (aciklama, idx, tespit) => ({ tur: 'veri', aciklama, tespit, url: idx ? `https://www.kap.org.tr/tr/Bildirim/${idx}` : null, bildirim: idx || null });
  const orantila = neden => {
    g.REV_W = T(g.REV.deger * w / ay, `Hasılat (${ay} ay) × ${w}/${ay}`, { REV: g.REV }, neden);
    g.FAV_W = T(g.FAV_DONEM.deger * w / ay, `FAVÖK (${ay} ay) × ${w}/${ay}`, { FAV_DONEM: g.FAV_DONEM }, neden);
    g.KIRA_W = T(g.KIRA.deger * w / ay, `Kira geliri (${ay} ay) × ${w}/${ay}`, { KIRA: g.KIRA }, neden);
    bayrak.push(['kira', `Son ${w} ay: ${neden}`]);
  };
  if (w === ay) {
    g.REV_W = T(g.REV.deger, `Son rapor ${ay} aylık: hasılat doğrudan`, { REV: g.REV });
    g.FAV_W = T(g.FAV_DONEM.deger, `Son rapor ${ay} aylık: FAVÖK doğrudan`, { FAV_DONEM: g.FAV_DONEM });
    g.KIRA_W = T(g.KIRA.deger, `Son rapor ${ay} aylık: kira doğrudan`, { KIRA: g.KIRA });
    return;
  }
  if (!p) return orantila(v ? 'Veri tablosunda pencere satırı yok; dönem orantılandı' : 'Bu rapor için veri tablosu satırı yok (agent daha yeni rapor çekmiş olabilir); dönem orantılandı');
  if (p.yontem !== 'kopru') return orantila(p.yontem === 'orantili' ? `${ay - w} aylık ara rapor KAP'ta yok; dönem orantılandı` : 'Pencere köprüsü kurulamadı; dönem orantılandı');
  const a = p.ara;
  const etiket = `${a.ay} aylık ara rapor (${a.donemSonu.split('-').reverse().join('.')})`;
  g.KF_W = { deger: p.kf, kaynak: { tur: 'parametre', aciklama: `TÜFE katsayısı ${a.donemSonu.split('-').reverse().join('.')} → ${p.donemSonu.split('-').reverse().join('.')} (raporlardaki yeniden düzenlenmiş bilançolardan, veri tablosu)` } };
  g.REV_ARA = { deger: p.hasilat.ara, kaynak: veriKay(`${etiket}: hasılat (XBRL)`, a.idx, 'Doğrudan') };
  g.FAV_ARA = { deger: p.favok.ara, kaynak: veriKay(`${etiket}: FAVÖK = brüt kâr − pazarlama − GYG − Ar-Ge + amortisman (XBRL)`, a.idx, 'Doğrudan') };
  g.KIRA_ARA = { deger: p.kira.ara, kaynak: veriKay(p.kira.araKaynak || `${etiket}: hasılat dipnotu`, a.idx, p.kira.araTespit) };
  g.REV_W = T(g.REV.deger - g.REV_ARA.deger * g.KF_W.deger, `Hasılat (${ay} ay) − Hasılat (${a.ay} ay ara rapor) × TÜFE katsayısı`, { REV: g.REV, REV_ARA: g.REV_ARA, KF_W: g.KF_W });
  g.FAV_W = T(g.FAV_DONEM.deger - g.FAV_ARA.deger * g.KF_W.deger, `FAVÖK (${ay} ay) − FAVÖK (${a.ay} ay ara rapor) × TÜFE katsayısı`, { FAV_DONEM: g.FAV_DONEM, FAV_ARA: g.FAV_ARA, KF_W: g.KF_W });
  g.KIRA_W = T(g.KIRA.deger - g.KIRA_ARA.deger * g.KF_W.deger, `Kira geliri (${ay} ay) − Kira geliri (${a.ay} ay ara rapor) × TÜFE katsayısı`, { KIRA: g.KIRA, KIRA_ARA: g.KIRA_ARA, KF_W: g.KF_W });
  for (const f of v.flags || []) if (f.seviye !== 'bilgi' && f.metin.startsWith(`Son ${w} ay`) && !f.metin.startsWith(`Son ${w} ay kira:`) && !f.metin.includes(') yorum:')) bayrak.push(['veri', f.metin]);
  if (p.kira.araTespit === 'Tahmini') bayrak.push(['kira', `Son ${w} ay kira: ara rapordaki kira tahmini (${p.kira.araKaynak})`]);
  else if (p.kira.araTespit && p.kira.araTespit !== 'Doğrudan') bayrak.push(['kira', `Son ${w} ay kira: ara rapordaki kira yorumla (${p.kira.araKaynak})`]);
}

/** Son 12 ay kira ve hasılat — FAVÖK ile aynı köprü: dönem + son yıllık × TÜFE katsayısı − önceki yıl aynı dönem.
 *  Yıllık ve önceki yıl kira tutarları veri tablosundan (scripts/tarihsel/veri.py → data/veri.json) gelir: s.kira12.
 *  Bu satır yalnızca aynı rapora aitse kullanılır; agent daha yeni bir rapor çektiyse dönem × 12/ay ile yıllıklandırılır. */
function kira12Hesapla(g, s, bild, fyBild, c, cf, ay, kira) {
  const v = s.kira12 || null;
  const vk = v ? v.kira : null;
  const veriKay = (aciklama, idx, tespit) => ({ tur: 'veri', aciklama, tespit, url: idx ? `https://www.kap.org.tr/tr/Bildirim/${idx}` : null, bildirim: idx || null });
  const yillikla = neden => {
    g.REV_LTM = T(g.REV.deger * 12 / ay, `Hasılat (${ay} ay) × 12/${ay}`, { REV: g.REV }, neden);
    g.KIRA_LTM = T(g.KIRA.deger * 12 / ay, `Kira geliri (${ay} ay) × 12/${ay}`, { KIRA: g.KIRA }, neden);
    g.KIRA_LTM.yilliklandi = true;
  };

  if (ay === 12) {
    g.REV_LTM = T(g.REV.deger, 'Yıllık rapor: hasılat (12 ay) doğrudan', { REV: g.REV });
    g.KIRA_LTM = T(g.KIRA.deger, 'Yıllık rapor: kira geliri (12 ay) doğrudan', { KIRA: g.KIRA });
    return;
  }

  // TÜFE katsayısı: FAVÖK köprüsündekiyle aynı; FAVÖK harici/yıllıklandırılmış geldiyse veri tablosundaki rapor katsayısı
  let KF = g.KF;
  if (!KF && v && v.kf) KF = { deger: v.kf, kaynak: { tur: 'parametre', aciklama: `TÜFE katsayısı ${v.yillik ? v.yillik.donemSonu : 'yıllık rapor'} → ${v.donemSonu} (raporlardaki yeniden düzenlenmiş bilançolardan, veri tablosu)` } };

  // Hasılat: yıllık XBRL'den; yıllık rapor önbellekte yoksa veri tablosundan
  let REV_FY = null;
  if (fyBild) REV_FY = xbrlDeger(fyBild, 'REV', 'cari', cf);
  else if (v && v.hasilat && v.hasilat.yillik != null && v.yillik) REV_FY = { deger: v.hasilat.yillik, kaynak: veriKay('Yıllık rapor hasılatı (veri tablosu)', v.yillik.idx, 'Doğrudan') };
  const REV_ONCEKI = xbrlDeger(bild, 'REV', 'onceki', c);

  if (!KF || !REV_FY) return yillikla('Yıllık rapor ya da TÜFE katsayısı yok; dönem yıllıklandırıldı');
  if (!['tamami', 'sifir'].includes(kira.tip) && (!vk || vk.yillik == null || vk.onceki == null))
    return yillikla(v ? 'Veri tablosunda yıllık/önceki yıl kira tutarı yok; dönem yıllıklandırıldı' : 'Bu rapor için veri tablosu satırı yok (agent daha yeni rapor çekmiş olabilir); dönem yıllıklandırıldı');
  if (vk && vk.ltmFormul === 'yilliklandir') return yillikla('Elle kontrol: 12 aylık kira yıllıklandırıldı (veri tablosu)');

  g.REV_FY = REV_FY; g.REV_ONCEKI = REV_ONCEKI;
  g.REV_LTM = T(g.REV.deger + REV_FY.deger * KF.deger - REV_ONCEKI.deger, 'Hasılat dönem + Hasılat FY × TÜFE katsayısı − Hasılat önceki yıl aynı dönem',
    { REV: g.REV, REV_FY, KF, REV_ONCEKI });

  if (kira.tip === 'tamami') {
    g.KIRA_FY = T(REV_FY.deger, 'Karar hafızası kuralı (hasılatın tamamı kira) yıllık hasılata uygulandı', { REV_FY });
    g.KIRA_ONCEKI = T(REV_ONCEKI.deger, 'Karar hafızası kuralı önceki yıl hasılatına uygulandı', { REV_ONCEKI });
  } else if (kira.tip === 'sifir') {
    g.KIRA_FY = T(0, 'Karar hafızası kuralı: kira yok', {});
    g.KIRA_ONCEKI = T(0, 'Karar hafızası kuralı: kira yok', {});
  } else {
    g.KIRA_FY = { deger: vk.yillik, kaynak: veriKay(vk.yillikKaynak || 'Yıllık raporun hasılat dipnotu', v.yillik && v.yillik.idx, vk.yillikTespit) };
    g.KIRA_ONCEKI = { deger: vk.onceki, kaynak: veriKay(vk.oncekiKaynak || 'Son raporun hasılat dipnotu, önceki yıl sütunu', v.rapor && v.rapor.idx, vk.oncekiTespit) };
  }
  g.KIRA_LTM = T(g.KIRA.deger + g.KIRA_FY.deger * KF.deger - g.KIRA_ONCEKI.deger, 'Kira dönem + Kira FY × TÜFE katsayısı − Kira önceki yıl aynı dönem',
    { KIRA: g.KIRA, KIRA_FY: g.KIRA_FY, KF, KIRA_ONCEKI: g.KIRA_ONCEKI });
  g.KIRA_LTM.tahmini = [g.KIRA_FY, g.KIRA_ONCEKI].some(x => x.kaynak && x.kaynak.tespit === 'Tahmini');
}

/** Havuzda kalanları puanlar, sıralar, endeks/yedek seçer. */
export function puanla(liste) {
  const havuz = liste.filter(r => !r.elenme.length);
  const N = havuz.length;
  for (const key of Object.keys(KURAL.agirlik)) {
    const s = havuz.map(r => ({ r, v: r.oranlar[key].deger })).sort((a, b) => KURAL.yon[key] === 'kucuk' ? a.v - b.v : b.v - a.v);
    // eşit değerlerde ortalama sıra
    let i = 0;
    while (i < s.length) {
      let j = i; while (j + 1 < s.length && s[j + 1].v === s[i].v) j++;
      const sira = (i + j) / 2 + 1;
      for (let t = i; t <= j; t++) {
        const p = N > 1 ? (N - sira) / (N - 1) * 100 : 100;
        s[t].r.puan = s[t].r.puan || {};
        s[t].r.puan[key] = { deger: p, sira, havuz: N, formul: `(${N} − sıra ${sira}) / (${N} − 1) × 100 · ${KURAL.yon[key] === 'kucuk' ? 'küçük' : 'büyük'} değer iyi` };
      }
      i = j + 1;
    }
  }
  for (const r of havuz) {
    r.toplam = Object.entries(KURAL.agirlik).reduce((t, [k, w]) => t + r.puan[k].deger * w / 100, 0);
  }
  havuz.sort((a, b) => b.toplam - a.toplam || b.girdiler.PD.deger - a.girdiler.PD.deger);
  havuz.forEach((r, i) => {
    r.sira = i + 1;
    r.durum = i < KURAL.endeksSayisi ? 'Endeks' : i < KURAL.endeksSayisi + KURAL.yedekSayisi ? 'Yedek' : 'Havuzda';
  });
  for (const r of liste) if (r.elenme.length) { r.durum = 'Elendi'; r.sira = null; r.toplam = null; }
  return liste;
}
