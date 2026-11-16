import { sirketHesapla, puanla, KURAL, ORAN_AD } from './lib/engine.mjs';

/* ============ Durum ============ */
const S = { seed: null, kaynak: null, hafiza: {}, gunluk: [], guncel: {}, kaynakEk: {}, agent: {}, cevrimdisi: false, liste: [], gorunum: 'siralama', filtre: 'all', q: '', sk: 'sira', sd: 1 };

const ETIKET = {
  CA: 'Dönen varlıklar', CL: 'KV yükümlülükler', TA: 'Toplam varlıklar', TL: 'Toplam yükümlülükler', EQ: 'Defter değeri (ana ortaklık özkaynakları)',
  REV: 'Hasılat', CASH: 'Nakit ve nakit benzerleri', CFI: 'KV finansal yatırımlar', STB: 'KV borçlanmalar', CPLTB: 'UV borçlanmaların KV kısmı',
  LTB: 'UV borçlanmalar', OFL_C: 'Diğer KV finansal yükümlülükler', OFL_N: 'Diğer UV finansal yükümlülükler', GP: 'Brüt kâr', MKT: 'Pazarlama giderleri',
  GA: 'Genel yönetim giderleri', RD: 'Ar-Ge giderleri', DA: 'Amortisman düzeltmesi', FAV_DONEM: 'FAVÖK (cari dönem)', FAV_ONCEKI: 'FAVÖK (önceki yıl aynı dönem)',
  FAV_FY: 'FAVÖK (son yıllık rapor)', FAV_LTM: 'FAVÖK (son 12 ay)', KF: 'TÜFE katsayısı', ND: 'Net borç', PX: 'Kapanış fiyatı', PD: 'Piyasa değeri',
  FD: 'Firma değeri', DIV: 'Brüt nakit temettü', KIRA: 'Kira geliri', ...Object.fromEntries(Object.entries(ORAN_AD)),
};
const PARA = new Set(['CA', 'CL', 'TA', 'TL', 'EQ', 'REV', 'CASH', 'CFI', 'STB', 'CPLTB', 'LTB', 'OFL_C', 'OFL_N', 'GP', 'MKT', 'GA', 'RD', 'DA', 'FAV_DONEM', 'FAV_ONCEKI', 'FAV_FY', 'FAV_LTM', 'ND', 'PD', 'FD', 'DIV', 'KIRA']);

const tr = (v, d = 2) => v == null || Number.isNaN(v) ? '–' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 1) => v == null ? '–' : (v < 0 ? '−%' : '%') + tr(Math.abs(v) * 100, d);
const mn = v => v == null ? '–' : (v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' mn TL';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);

function bicim(anahtar, v) {
  if (anahtar.startsWith('ODEME_') || PARA.has(anahtar)) return mn(v);
  if (anahtar === 'PX') return tr(v) + ' TL';
  if (anahtar === 'KF' || anahtar === 'cr' || anahtar === 'pddd') return tr(v, anahtar === 'KF' ? 4 : 2);
  if (anahtar === 'dy') return '%' + tr(v, 2);
  if (['lev', 'fav', 'kg'].includes(anahtar)) return pct(v);
  if (anahtar === 'kv') return pct(v, 2);
  return tr(v);
}

/* ============ Hesap ============ */
function tufeOnayli(donem) {
  const t = S.hafiza._TUFE;
  return t && t.durum === 'onaylandi' && t.donem === donem ? t.oneri.deger : null;
}
function sirketGirdisi(s) {
  const g = S.guncel[s.k];
  if (!g) return s;
  const donem = `${g.ay === 12 ? '12A' : g.ay + 'A'}${String(g.year).slice(2)}`;
  return { ...s, kap: g.kap, fy: g.fy, ay: g.ay, kf: g.ay === 12 ? null : tufeOnayli(donem), kfAciklama: `TÜFE katsayısı ${donem} (karar hafızasından)`,
    ltm: g.ltm || (g.fy ? undefined : { yontem: 'yilliklandir', kaynak: 'Yıllık rapor bulunamadı — dönem FAVÖK yıllıklandırıldı' }), _yeniDonem: donem };
}
function hesapla(hafiza = S.hafiza) {
  const kaynak = id => id ? (S.kaynakEk[id] || S.kaynak[id]) : null;
  return puanla(S.seed.sirketler.map(s0 => {
    const s = sirketGirdisi(s0);
    const r = sirketHesapla(s, kaynak(s.kap), kaynak(s.fy), hafiza, S.seed);
    if (s._yeniDonem) r.bayraklar = [...r.bayraklar, ['piyasa', `Rapor ${s._yeniDonem} dönemine güncellendi; fiyat, piyasa değeri ve temettü hâlâ ${S.seed.fiyatTarihi} tarihli`]];
    if (r.kiraKarar && r.kiraKarar.durum === 'bekliyor') r.bayraklar = [...r.bayraklar, ['onay', 'Kira tespiti karar hafızasında onay bekliyor']];
    return r;
  }));
}

/* ============ Yükleme ============ */
async function yukle() {
  const [seed, kaynak] = await Promise.all([fetch('data/seed.json').then(r => r.json()), fetch('data/kaynak.json').then(r => r.json())]);
  S.seed = seed; S.kaynak = kaynak;
  await durumYenile();
}
async function durumYenile() {
  try {
    const r = await fetch('/api/durum', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    Object.assign(S, await r.json(), { cevrimdisi: false });
  } catch {
    if (!Object.keys(S.hafiza).length) S.hafiza = await fetch('data/hafiza-baslangic.json').then(r => r.json());
    S.cevrimdisi = true;
  }
  S.liste = hesapla();
  ciz();
}

/* ============ Görünümler ============ */
function ciz() {
  const bekleyen = Object.values(S.hafiza).filter(d => d.durum === 'bekliyor').length;
  $('cntBekleyen').textContent = bekleyen || '';
  const a = S.agent || {};
  $('agentDurum').textContent = S.cevrimdisi ? 'Çevrimdışı önizleme — kararlar kaydedilmez'
    : a.calisiyor ? 'Agent çalışıyor…' : a.sonCalisma ? `Son çalışma: ${new Date(a.sonCalisma).toLocaleString('tr-TR')}` : 'Agent henüz çalışmadı';
  $('agentBtn').disabled = S.cevrimdisi || a.calisiyor;
  document.querySelectorAll('#nav button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.gorunum));
  $('main').innerHTML = { siralama: vSiralama, hafiza: vHafiza, gunluk: vGunluk, yontem: vYontem }[S.gorunum]();
  if (S.gorunum === 'siralama') bagSiralama();
  if (S.gorunum === 'hafiza') bagHafiza();
}

const ORD = { Endeks: 0, Yedek: 1, Havuzda: 2, Elendi: 3 };
function satirlar() {
  const q = S.q;
  return S.liste.filter(r => {
    if (S.filtre === 'sel' && !['Endeks', 'Yedek'].includes(r.durum)) return false;
    if (S.filtre === 'pool' && r.durum === 'Elendi') return false;
    if (S.filtre === 'out' && r.durum !== 'Elendi') return false;
    if (S.filtre === 'flag' && !r.bayraklar.length) return false;
    if (q && !(r.k + ' ' + r.u).toLocaleLowerCase('tr').includes(q)) return false;
    return true;
  }).sort((x, y) => {
    const v = r => S.sk === 'sira' ? (r.sira ?? 900 + ORD[r.durum]) : S.sk === 'toplam' ? (r.toplam ?? -1) : S.sk === 'k' ? r.k : (r.oranlar[S.sk]?.deger ?? -Infinity);
    const a = v(x), b = v(y);
    return (typeof a === 'string' ? a.localeCompare(b) : a - b) * S.sd;
  });
}

function vSiralama() {
  const L = S.liste, sec = L.filter(r => r.durum === 'Endeks').sort((a, b) => a.sira - b.sira), yed = L.filter(r => r.durum === 'Yedek');
  const yeni = Object.keys(S.guncel).length;
  const kol = (k, l, alt) => `<th data-s="${k}">${l}${alt ? `<small>${alt}</small>` : ''}</th>`;
  const hucre = (r, o) => {
    const v = r.oranlar[o].deger, p = r.puan?.[o === 'fav' ? 'fav' : o];
    const kotu = (o === 'lev' && v > KURAL.levSinir) || ((o === 'kg' || o === 'kv') && r.oranlar.kg.deger < KURAL.kiraHasilatMin && r.oranlar.kv.deger < KURAL.kiraVarlikMin);
    return `<td class="src ${kotu ? 'fail' : ''}" data-k="${r.k}" data-o="${o}" title="Kaynağı göster">${bicim(o, v)}${p ? `<span class="pt">${tr(p.deger, 0)} p</span>` : ''}</td>`;
  };
  return `
  <section class="ozet">
    <div><span class="n">${L.length}</span><span class="l">GYO taranan</span></div>
    <div><span class="n">${L.filter(r => r.durum !== 'Elendi').length}</span><span class="l">Seçim havuzunda</span></div>
    <div><span class="n">${L.filter(r => r.durum === 'Elendi').length}</span><span class="l">Elenen</span></div>
    <div><span class="n">${Object.values(S.hafiza).filter(d => d.durum === 'bekliyor').length}</span><span class="l">Onay bekleyen karar</span></div>
    <div><span class="n">${yeni}</span><span class="l">Agent'ın güncellediği rapor</span></div>
    <div class="secim"><span class="l">Endekse girecek ${sec.length} pay + ${yed.length} yedek</span><div class="pick">${sec.map(r => `<span class="chip">${r.sira}. ${r.k}</span>`).join('')}${yed.map(r => `<span class="chip res">Yedek ${r.sira}. ${r.k}</span>`).join('')}</div></div>
  </section>
  <section>
    <div class="bar">
      <h2>Sıralama</h2>
      <div class="bar">
        <div class="seg" id="seg">${[['all', 'Tümü'], ['sel', 'Endeks + yedek'], ['pool', 'Havuz'], ['out', 'Elenenler'], ['flag', 'Bayraklı']].map(([f, l]) => `<button data-f="${f}" aria-pressed="${S.filtre === f}">${l}</button>`).join('')}</div>
        <input type="search" id="q" placeholder="Kod veya şirket ara" value="${esc(S.q)}">
      </div>
    </div>
    <p class="ipucu">Herhangi bir sayıya tıkla: hangi KAP bildiriminden, hangi XBRL kaleminden ve hangi formülle geldiğini açar.</p>
    <div class="tablebox"><table><thead><tr>
      ${kol('sira', 'Sıra')}<th class="l" data-s="k">Kod</th><th class="l">Durum</th>${kol('toplam', 'Toplam puan')}
      ${kol('pddd', 'PD/DD', '%50 · küçük iyi')}${kol('fav', 'FAVÖK/FD', '%20 · büyük iyi')}${kol('dy', 'Temettü verimi', '%20 · büyük iyi')}
      ${kol('cr', 'Cari oran', '%5 · büyük iyi')}${kol('lev', 'Yük./Varlık', '%5 · küçük iyi · ≤%85')}${kol('kg', 'Kira/Hasılat', '≥%15')}${kol('kv', 'Kira/Varlık', '≥%2,5 · yıllık')}
      <th>PD</th><th>Bayrak</th></tr></thead>
      <tbody>${satirlar().map(r => `<tr>
        <td>${r.sira ?? '–'}</td>
        <td class="l code">${r.k}<span class="nm">${esc(r.u)}</span></td>
        <td class="l"><span class="pill p-${r.durum}">${r.durum}</span></td>
        <td class="src" data-k="${r.k}" data-o="_puan">${r.toplam == null ? '–' : `<span class="scorecell">${tr(r.toplam, 2)}<span class="sbar"><i style="width:${r.toplam}%"></i></span></span>`}</td>
        ${['pddd', 'fav', 'dy', 'cr', 'lev', 'kg', 'kv'].map(o => hucre(r, o)).join('')}
        <td class="src" data-k="${r.k}" data-o="_PD">${tr(r.girdiler.PD.deger / 1e6, 0)}</td>
        <td>${r.bayraklar.length ? `<span class="flagn src" data-k="${r.k}" data-o="_bayrak">${r.bayraklar.length}</span>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>
  </section>`;
}
function bagSiralama() {
  document.querySelectorAll('#seg button').forEach(b => b.onclick = () => { S.filtre = b.dataset.f; ciz(); });
  $('q').oninput = e => { S.q = e.target.value.toLocaleLowerCase('tr'); const p = e.target.selectionStart; ciz(); $('q').focus(); $('q').setSelectionRange(p, p); };
  document.querySelectorAll('th[data-s]').forEach(th => th.onclick = () => {
    const k = th.dataset.s; if (S.sk === k) S.sd = -S.sd; else { S.sk = k; S.sd = ['sira', 'k', 'pddd', 'lev'].includes(k) ? 1 : -1; } ciz();
  });
  document.querySelectorAll('.src[data-k]').forEach(td => td.onclick = () => kaynakAc(td.dataset.k, td.dataset.o));
}

/* ============ Kaynak paneli ============ */
function kaynakSatiri(kn) {
  if (!kn) return '';
  if (kn.tur === 'xbrl') return `<div class="kay xbrl"><b>KAP finansal rapor</b> · <a href="${kn.url}" target="_blank" rel="noopener">Bildirim ${kn.bildirim}</a><br>XBRL kalemi <code>${esc(kn.kalem)}</code> · ${esc(kn.etiket)} · ${esc(kn.kolon)}${kn.birim && kn.birim !== 'TL' ? ` · rapor birimi ${esc(kn.birim)} (×1.000 çevrildi)` : ''}</div>`;
  if (kn.tur === 'piyasa') return `<div class="kay piyasa"><b>Piyasa verisi</b> · ${esc(kn.aciklama)}</div>`;
  if (kn.tur === 'harici') return `<div class="kay harici"><b>Harici kaynak</b> · ${esc(kn.aciklama)}${kn.neden ? `<br>Neden: ${esc(kn.neden)}` : ''}</div>`;
  if (kn.tur === 'parametre') return `<div class="kay param"><b>Parametre</b> · ${esc(kn.aciklama)}</div>`;
  if (kn.tur === 'karar') {
    const k = kn.karar;
    return `<div class="kay karar"><b>Karar hafızası</b>${k ? ` · ${k.durum === 'onaylandi' ? `onaylı (${esc(k.onaylayan)}, ${esc(k.tarih)})` : '<span class="bekl">onay bekliyor</span>'}` : ''}<br>${esc(kn.aciklama)}${kn.pdf ? `<br><a href="${kn.pdf.url}" target="_blank" rel="noopener">Dipnotlu PDF: ${esc(kn.pdf.ad)}</a>` : ''}</div>`;
  }
  return '';
}
function dugum(ad, n, derinlik = 0) {
  const alt = n.girdiler ? Object.entries(n.girdiler) : [];
  return `<details class="dg" ${derinlik < 2 ? 'open' : ''}>
    <summary><span class="dad">${esc(ETIKET[ad] || ad.replace('ODEME_', 'Ödeme '))}</span><span class="ddeg">${bicim(ad, n.deger)}</span></summary>
    <div class="dic">
      ${n.formul ? `<div class="formul">= ${esc(n.formul)}</div>` : ''}${n.not ? `<div class="not">${esc(n.not)}</div>` : ''}
      ${kaynakSatiri(n.kaynak)}
      ${alt.map(([k, v]) => dugum(k, v, derinlik + 1)).join('')}
    </div></details>`;
}
function kaynakAc(k, o) {
  const r = S.liste.find(x => x.k === k);
  let baslik, govde;
  if (o === '_puan') {
    baslik = `${k} · toplam puan`;
    govde = r.toplam == null ? `<p>Havuz kriterinden elendiği için puanlanmadı.</p>${r.elenme.map(e => `<p class="fail">${esc(e)}</p>`).join('')}` :
      `<p class="formul">= Σ (ağırlık × oran puanı) / 100 = <b>${tr(r.toplam, 2)}</b></p>
       <table class="mini"><tr><th class="l">Oran</th><th>Değer</th><th>Sıra</th><th>Puan</th><th>Ağırlık</th><th>Katkı</th></tr>
       ${Object.entries(KURAL.agirlik).map(([o2, w]) => `<tr><td class="l">${ORAN_AD[o2]}</td><td>${bicim(o2, r.oranlar[o2].deger)}</td><td>${tr(r.puan[o2].sira, 1)} / ${r.puan[o2].havuz}</td><td>${tr(r.puan[o2].deger, 1)}</td><td>%${w}</td><td>${tr(r.puan[o2].deger * w / 100, 2)}</td></tr>`).join('')}</table>
       <p class="not">Oran puanı: en iyi şirkete 100, en kötüye 0, arası eşit aralıklı; eşit değerlerde ortalama sıra. Toplam puan eşitse piyasa değeri büyük olan üstte.</p>`;
  } else if (o === '_bayrak') {
    baslik = `${k} · bayraklar`;
    govde = r.bayraklar.map(b => `<p><span class="tag">${esc(b[0])}</span>${esc(b[1])}</p>`).join('');
  } else if (o === '_PD') {
    baslik = `${k} · piyasa değeri`; govde = dugum('PD', r.girdiler.PD);
  } else {
    baslik = `${k} · ${ORAN_AD[o]}`;
    govde = dugum(o, r.oranlar[o]) + (r.puan?.[o] ? `<p class="not">Puan: ${tr(r.puan[o].deger, 1)} — ${esc(r.puan[o].formul)}</p>` : '');
  }
  $('dTitle').textContent = baslik;
  $('dBody').innerHTML = `<p class="muted">${esc(r.u)} · ${esc(r.nitelik)} · ${r.ay} aylık rapor · <a href="${r.kap}" target="_blank" rel="noopener">KAP bildirimi</a>${r.fy ? ` · <a href="${r.fy}" target="_blank" rel="noopener">Yıllık rapor</a>` : ''}</p>${govde}`;
  $('drawer').hidden = false;
}
$('dClose').onclick = () => { $('drawer').hidden = true; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('drawer').hidden = true; });

/* ============ Karar hafızası ============ */
const TIP_AD = { tamami: 'Hasılatın tamamı kira', sifir: 'Kira yok (0)', tutar: 'Belirli tutar', parametre: 'Parametre' };
function etki(k, oneri) {
  const h = { ...S.hafiza, [k]: { ...S.hafiza[k], oneri } };
  const r = hesapla(h).find(x => x.k === k);
  return `${r.durum}${r.sira ? ' · ' + r.sira + '.' : ''} · Kira/Hasılat ${pct(r.oranlar.kg.deger)} · Kira/Varlık ${pct(r.oranlar.kv.deger, 2)}`;
}
function kartHTML(d) {
  const r = S.liste.find(x => x.k === d.k);
  const o = d.oneri || {};
  const oneriMetni = o.tip === 'parametre' ? `Katsayı: ${o.deger ?? '—'}` : `${TIP_AD[o.tip]}${o.tip === 'tutar' ? ': ' + (o.tutar == null ? '—' : mn(o.tutar)) : ''}`;
  const alternatifler = d.k === '_TUFE' ? '' : ['tamami', 'sifir'].filter(t => t !== o.tip).map(t => `<li>${TIP_AD[t]} sayılırsa: <b>${etki(d.k, { tip: t, not: '' })}</b></li>`).join('');
  return `<article class="kart ${d.durum}" data-k="${d.k}">
    <header><div><span class="code">${d.k === '_TUFE' ? 'Parametre' : d.k}</span> ${r ? `<span class="muted">${esc(r.u)}</span>` : ''}</div>
      <div><span class="pill ${d.durum === 'bekliyor' ? 'p-Yedek' : 'p-Endeks'}">${d.durum === 'bekliyor' ? 'Onay bekliyor' : 'Onaylı'}</span>${d.sonucuDegistirir ? ' <span class="pill p-Elendi">Sonucu değiştirebilir</span>' : ''}</div></header>
    <p><b>${esc(d.konu)}</b> · ${esc(d.donem)} · ${esc(d.kalicilik || '')}</p>
    <p class="oneri">Agent önerisi: <b>${esc(oneriMetni)}</b></p>
    <p class="not">${esc(o.not)}</p>
    ${r ? `<p class="etki">Bu kararla: <b>${r.durum}${r.sira ? ' · ' + r.sira + '.' : ''}</b> · Kira/Hasılat ${pct(r.oranlar.kg.deger)} · Kira/Varlık ${pct(r.oranlar.kv.deger, 2)}</p>${alternatifler ? `<ul class="alt">${alternatifler}</ul>` : ''}` : ''}
    ${d.pdf || r?.ekler?.[0] ? `<p><a href="${(d.pdf || r.ekler[0]).url}" target="_blank" rel="noopener">Dipnotlu PDF'i aç</a>${r ? ` · <a href="${r.kap}" target="_blank" rel="noopener">KAP bildirimi</a>` : ''}</p>` : ''}
    ${d.onaylayan ? `<p class="muted">Onaylayan: ${esc(d.onaylayan)} · ${esc(d.tarih)}</p>` : ''}
    ${(d.notlar || []).map(n => `<p class="muted">💬 ${esc(n.kim)} (${esc(n.tarih)}): ${esc(n.metin)}</p>`).join('')}
    <div class="eylem">
      ${d.durum === 'bekliyor' ? `<button class="btn primary" data-e="onayla">Onayla</button>` : `<button class="btn" data-e="geri_al">Onayı geri al</button>`}
      <button class="btn" data-e="degistir">Değiştir</button><button class="btn" data-e="not">Not ekle</button>
    </div>
    <form class="degistir" hidden>
      ${d.k === '_TUFE' ? `<label>Katsayı <input name="deger" type="number" step="0.0001" min="0"></label>` :
        `<label>Kira tespiti <select name="tip"><option value="tamami">Hasılatın tamamı kira</option><option value="sifir">Kira yok (0)</option><option value="tutar">Belirli tutar (TL)</option></select></label>
         <label>Tutar (TL, dönemsel) <input name="tutar" type="number" step="1" min="0"></label>`}
      <label class="w">Gerekçe <input name="not" placeholder="Örn. dipnot 18: otel işletme geliri, kira değil"></label>
      <button class="btn primary" type="submit">Kaydet ve onayla</button>
    </form>
  </article>`;
}
function vHafiza() {
  const D = Object.values(S.hafiza);
  const bek = D.filter(d => d.durum === 'bekliyor').sort((a, b) => (b.sonucuDegistirir ? 1 : 0) - (a.sonucuDegistirir ? 1 : 0));
  const ony = D.filter(d => d.durum !== 'bekliyor');
  return `<section class="hafiza">
    <h2>Karar hafızası</h2>
    <p class="aciklama">Agent'ın öğrendiği kurallar burada. Onayladığın "kalıcı" kararlar (ör. "hasılatın tamamı kira") sonraki dönemlerde otomatik uygulanır. "Bu dönem" kararları (belirli tutar) her yeni raporda yeniden sorulur; agent bu sefer önceki dönemin oranını öneri olarak getirir.${S.cevrimdisi ? ' <b>Çevrimdışı önizlemedesin: kararlar kaydedilmez.</b>' : ''}</p>
    <h3>Onay bekleyenler (${bek.length})</h3>
    ${bek.length ? bek.map(kartHTML).join('') : '<p class="muted">Bekleyen karar yok.</p>'}
    <details><summary><h3 style="display:inline">Onaylı kararlar (${ony.length})</h3></summary>${ony.map(kartHTML).join('')}</details>
  </section>`;
}
function kullanici() {
  let u = null;
  try { u = localStorage.getItem('osg15-kullanici'); } catch { }
  if (!u) { u = prompt('Kararlar adınla kaydedilecek. Adın?') || 'Bilinmiyor'; try { localStorage.setItem('osg15-kullanici', u); } catch { } }
  return u;
}
async function kararGonder(govde) {
  if (S.cevrimdisi) { alert('Çevrimdışı önizleme: kararlar kaydedilmez.'); return; }
  const r = await fetch('/api/hafiza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...govde, kullanici: kullanici() }) });
  const j = await r.json();
  if (!r.ok) { alert(j.hata || 'Kaydedilemedi'); return; }
  await durumYenile();
}
function bagHafiza() {
  document.querySelectorAll('.kart').forEach(kart => {
    const k = kart.dataset.k;
    kart.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
      const e = b.dataset.e;
      if (e === 'degistir') { kart.querySelector('form').hidden = !kart.querySelector('form').hidden; return; }
      if (e === 'not') { const n = prompt('Not'); if (n) kararGonder({ k, eylem: 'not', not: n }); return; }
      kararGonder({ k, eylem: e });
    });
    const f = kart.querySelector('form');
    f.onsubmit = ev => {
      ev.preventDefault();
      const fd = Object.fromEntries(new FormData(f));
      const oneri = k === '_TUFE' ? { tip: 'parametre', deger: fd.deger, not: fd.not } : { tip: fd.tip, tutar: fd.tutar, not: fd.not };
      kararGonder({ k, eylem: 'degistir', oneri, not: fd.not });
    };
  });
}

/* ============ Günlük ============ */
const TUR = { calisma: 'Çalışma', hafiza: 'Hafızadan', oneri: 'Öneri', karar: 'Karar', uyari: 'Uyarı', hata: 'Hata' };
function vGunluk() {
  return `<section><h2>Agent günlüğü</h2>
    <p class="aciklama">Agent hafta içi her sabah 09:15'te KAP'ı tarar. Yeni GYO finansal raporu bulduğunda XBRL tablolarını çeker, karar hafızasındaki kalıcı kuralları uygular, karşılayamadığı noktalar için öneri üretip onayına bırakır.</p>
    ${S.gunluk.length ? `<ul class="gunluk">${S.gunluk.map(g => `<li class="g-${g.tur}"><span class="tag">${TUR[g.tur] || g.tur}</span><span class="zaman">${new Date(g.zaman).toLocaleString('tr-TR')}</span> ${esc(g.ozet)}${g.url ? ` <a href="${g.url}" target="_blank" rel="noopener">KAP</a>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Henüz kayıt yok. Sağ üstten agent\'ı çalıştırabilirsin.</p>'}
  </section>`;
}

/* ============ Yöntem ============ */
function vYontem() {
  return `<section class="yontem"><h2>Nasıl çalışır</h2>
  <div class="cols">
   <div class="card"><h3>1. Veri</h3><ul>
    <li><b>Finansal tablolar</b> doğrudan KAP bildirim sayfalarındaki XBRL tablolarından okunur. Her sayının yanında bildirim numarası, XBRL kalem adı ve dönem sütunu saklanır.</li>
    <li><b>Kira geliri</b> gelir tablosunda ayrı kalem olmadığı için dipnottan tespit edilir; bu tespit karar hafızasında tutulur.</li>
    <li><b>Fiyat, piyasa değeri, temettü:</b> ${esc(S.seed.fiyatKaynagi)}, ${esc(S.seed.fiyatTarihi)}. Değerleme gününde güncellenmeli (sonraki aşama).</li>
    <li><b>FAVÖK (son 12 ay)</b> = cari dönem + son yıllık × TÜFE katsayısı − önceki yıl aynı dönem.</li></ul></div>
   <div class="card"><h3>2. Kural seti</h3><ul>
    <li>Evren: KAP'ta GYO statüsündeki şirketler.</li>
    <li>Eleme: Yükümlülük/Varlık > %85, ya da Kira/Hasılat < %15 <i>ve</i> Kira/Varlık < %2,5.</li>
    <li>Puan: PD/DD %50, FAVÖK/FD %20, temettü verimi %20, cari oran %5, Yük./Varlık %5. Her oranda en iyiye 100, en kötüye 0.</li>
    <li>İlk 15 endeks, sonraki 2 yedek. Eşitlikte piyasa değeri büyük olan üstte.</li></ul></div>
   <div class="card"><h3>3. Öğrenme</h3><ul>
    <li>Agent model eğitmez; <b>onaylı karar hafızası</b> ile öğrenir.</li>
    <li>Kalıcı kararlar (ör. "MHRGY'de 'Yurtiçi satışlar' = kira") yeni raporda otomatik uygulanır ve günlüğe yazılır.</li>
    <li>Dönemlik kararlar için agent önceki dönemin oranından öneri getirir, sen onaylarsın.</li>
    <li>Her karar kimin, ne zaman, hangi gerekçeyle verdiğiyle saklanır; geri alınabilir.</li></ul></div>
   <div class="card"><h3>4. Sıradaki aşama: chatbot</h3><ul>
    <li>Sıralamadaki her sayının kaynak ağacı (bu sayfada tıklayınca açılan panel) chatbot'un okuyacağı veridir.</li>
    <li>"AKFGY'nin FAVÖK'ünü nereden aldın?" sorusu, bu ağaçtaki XBRL kalemleri ve KAP linkleriyle cevaplanacak; bot sayı uydurmayacak.</li>
    <li>Gerekli: Claude API anahtarı (Netlify ortam değişkeni).</li></ul></div>
  </div></section>`;
}

/* ============ Olaylar ============ */
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { S.gorunum = b.dataset.v; ciz(); });
$('agentBtn').onclick = async () => {
  $('agentBtn').disabled = true; $('agentDurum').textContent = 'Agent KAP\'ı tarıyor…';
  for (let i = 0; i < 30; i++) {
    let r;
    try { r = await fetch('/api/agent-adim', { method: 'POST' }).then(x => x.json()); } catch { r = { bitti: true, hata: 'bağlantı' }; }
    if (!r.bitti) $('agentDurum').textContent = `Agent çalışıyor… kuyrukta ${r.kalan} rapor`;
    if (r.bitti) break;
  }
  await durumYenile();
};
yukle();
