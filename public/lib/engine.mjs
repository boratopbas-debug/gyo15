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
  kg: 'Kira/Hasılat', kv: 'Kira/Varlık (yıllık)',
};

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

  const o = {
    cr: T(g.CL.deger ? g.CA.deger / g.CL.deger : null, 'Dönen varlıklar / KV yükümlülükler', { CA: g.CA, CL: g.CL }),
    lev: T(g.TL.deger / g.TA.deger, 'Toplam yükümlülükler / Toplam varlıklar', { TL: g.TL, TA: g.TA }),
    fav: T(g.FAV_LTM.deger / g.FD.deger, 'FAVÖK (son 12 ay) / Firma değeri', { FAV_LTM: g.FAV_LTM, FD: g.FD }),
    pddd: T(g.PD.deger / g.EQ.deger, 'Piyasa değeri / Defter değeri (ana ortaklık özkaynakları)', { PD: g.PD, EQ: g.EQ }),
    dy: T(g.DIV.deger / g.PD.deger * 100, 'Brüt nakit temettü / Piyasa değeri × 100', { DIV: g.DIV, PD: g.PD }),
    kg: T(g.REV.deger ? g.KIRA.deger / g.REV.deger : 0, 'Kira geliri / Hasılat', { KIRA: g.KIRA, REV: g.REV }),
    kv: T(g.KIRA.deger * (12 / ay) / g.TA.deger, `Kira geliri × 12/${ay} / Toplam varlıklar`, { KIRA: g.KIRA, TA: g.TA }),
  };
  const elenme = [];
  if (o.lev.deger > KURAL.levSinir) elenme.push(`Yükümlülük/Varlık %${(o.lev.deger * 100).toFixed(1)} > %85`);
  if (o.kg.deger < KURAL.kiraHasilatMin && o.kv.deger < KURAL.kiraVarlikMin) elenme.push(`Kira/Hasılat %${(o.kg.deger * 100).toFixed(1)} < %15 ve Kira/Varlık %${(o.kv.deger * 100).toFixed(2)} < %2,5`);

  return {
    k: s.k, u: s.u, pz: s.pz, ay, nitelik: bild.nitelik, birim: bild.paraBirimi, donem: bild.tablolar && Object.values(bild.tablolar)[0]?.cari,
    kap: bild.url, fy: fyBild ? fyBild.url : null, ekler: bild.ekler, girdiler: g, oranlar: o, elenme, bayraklar: s.fl || [],
    kiraKarar: karar, kiraCikarim: !!kira.cikarim,
  };
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
