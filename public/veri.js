// OSG15 GYO veri tablosu: toplam varlık, hasılat, kira geliri, FAVÖK — dönem ve son 12 ay, kira flag'leri, Excel/CSV indirme.
// Veri: data/veri.json (scripts/tarihsel/veri.py üretir).

const S = { D: null, sk: 'k', sd: 1, filtre: 'all', ara: '', birim: 1e6 };
const $ = id => document.getElementById(id);
const tr = (v, d = 2) => v == null || Number.isNaN(v) ? '–' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 1) => v == null ? '–' : (v < 0 ? '−%' : '%') + tr(Math.abs(v) * 100, d);
const tl = v => v == null ? '–' : tr(v / S.birim, S.birim === 1 ? 0 : 1);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gun = s => s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : '–';
const TUR = { dogrulanamadi: 'Doğrulanamadı', celiski: 'Çelişki', tahmini: 'Tahmini', cikarim: 'Yorum', veri: 'Veri', teyit: 'Teyitli' };
const SEV = { kritik: 3, uyari: 2, bilgi: 1 };

async function yukle() {
  S.D = await fetch('data/veri.json', { cache: 'no-store' }).then(r => r.json());
  $('olusturma').textContent = `Veri: ${gun(S.D.olusturma.slice(0, 10))} ${S.D.olusturma.slice(11)}`;
  ciz();
}

const KOL = [
  ['TA', 'Toplam varlıklar', r => r.TA],
  ['hd', 'Hasılat', r => r.hasilat?.donem, 'dönem'],
  ['hl', 'Hasılat', r => r.hasilat?.ltm, '12 ay'],
  ['kd', 'Kira geliri', r => r.kira?.donem, 'dönem'],
  ['kl', 'Kira geliri', r => r.kira?.ltm, '12 ay'],
  ['fd', 'FAVÖK', r => r.favok?.donem, 'dönem'],
  ['fl', 'FAVÖK', r => r.favok?.ltm, '12 ay'],
  ['kg', 'Kira/Hasılat', r => r.oran?.kg, '12 ay'],
  ['kv', 'Kira/Varlık', r => r.oran?.kv, '12 ay'],
];

function ciz() {
  const R = S.D.satirlar;
  const flagli = R.filter(r => r.kiraFlag).length;
  const yorum = R.filter(r => r.kira?.tespit === 'Yorum').length;
  const tah = R.filter(r => r.kira?.tespit12 === 'Tahmini').length;
  const donemler = {};
  R.forEach(r => { if (r.donemSonu) donemler[r.donemSonu] = (donemler[r.donemSonu] || 0) + 1; });
  $('main').innerHTML = `
  <section class="ozet6">
    <div><span class="l">Şirket</span><span class="n">${R.length}</span><span class="l">OSG15 evreni</span></div>
    <div><span class="l">Son rapor dönemi</span><span class="n">${Object.entries(donemler).sort((a, b) => b[1] - a[1]).map(([d, n]) => gun(d).slice(3)).slice(0, 1)}</span><span class="l">${Object.entries(donemler).map(([d, n]) => `${gun(d)}: ${n}`).join(' · ')}</span></div>
    <div><span class="l">Kira flag'li</span><span class="n ${flagli ? 'down' : ''}">${flagli}</span><span class="l">dönem ya da 12 ay tespiti doğrudan değil</span></div>
    <div><span class="l">Dönem kirası yorumla</span><span class="n">${yorum}</span><span class="l">dipnotta açık kira satırı yok</span></div>
    <div><span class="l">12 ay kirası tahmini</span><span class="n">${tah}</span><span class="l">bir bileşen oranla ya da yıllıklandırma</span></div>
    <div><span class="l">İndir</span><span class="indir" style="margin-top:4px"><a class="btn primary" href="data/OSG15_GYO_Veri.xlsx" download>Excel</a><a class="btn" href="data/OSG15_GYO_Veri.csv" download>CSV</a></span><span class="l">Excel: veri, 12 ay köprüsü, flag'ler</span></div>
  </section>
  <section>
    <div class="vbar">
      <div class="sol">
        <h2>Toplam varlık, hasılat, kira geliri, FAVÖK</h2>
      </div>
      <div class="sol">
        <input id="ara" type="search" placeholder="Kod ya da ünvan" value="${esc(S.ara)}" style="width:170px">
        <div class="seg" id="segF">
          <button data-f="all" aria-pressed="${S.filtre === 'all'}">Tümü</button>
          <button data-f="flag" aria-pressed="${S.filtre === 'flag'}">Kira flag'li</button>
          <button data-f="kira" aria-pressed="${S.filtre === 'kira'}">Kira geliri olan</button>
        </div>
        <div class="seg" id="segB">
          <button data-b="1000000" aria-pressed="${S.birim === 1e6}">mn TL</button>
          <button data-b="1" aria-pressed="${S.birim === 1}">TL</button>
        </div>
      </div>
    </div>
    <p class="ipucu">Her şirketin KAP'taki en son finansal raporu (konsolide varsa konsolide), tutarlar raporun dönem sonu alım gücüyle (TMS 29).
      <b>12 ay</b> = dönem + son yıllık rapor × TÜFE katsayısı − önceki yılın aynı dönemi. Kira <span class="tes tes-Yorum">Yorum</span> dipnotta açık kira satırı olmadığı için kalemden çıkarım,
      <span class="tes tes-Tahmini">Tahmini</span> en az bir bileşen oranla tahmin. Satıra tıklayınca kaynaklar ve 12 ay köprüsü açılır.</p>
    <div class="tablebox" id="tablo"></div>
  </section>`;
  tablo();
  bagla();
}

function tablo() {
  let L = S.D.satirlar.slice();
  const q = S.ara.trim().toLocaleLowerCase('tr');
  if (q) L = L.filter(r => r.k.toLocaleLowerCase('tr').includes(q) || r.u.toLocaleLowerCase('tr').includes(q));
  if (S.filtre === 'flag') L = L.filter(r => r.kiraFlag);
  if (S.filtre === 'kira') L = L.filter(r => r.kira?.ltm > 0);
  const kol = KOL.find(k => k[0] === S.sk);
  const val = r => S.sk === 'k' ? r.k : (kol ? kol[2](r) : null) ?? -Infinity;
  L.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y, 'tr') : x - y) * S.sd; });
  const th = ([k, l, , alt]) => `<th data-s="${k}">${l}${alt ? `<small>${alt}</small>` : ''}</th>`;
  const tes = t => t && t !== 'Doğrudan' ? `<span class="tes tes-${t}">${t === 'Yorum' ? 'Y' : 'T'}</span>` : '';
  const sayi = v => tl(v);
  $('tablo').innerHTML = `<table class="vt"><thead><tr>
    <th class="l" data-s="k">Kod</th><th class="l">Dönem</th>${KOL.map(th).join('')}<th class="l">Flag</th></tr></thead>
    <tbody>${L.map(r => {
      if (!r.TA) return `<tr data-k="${r.k}"><td class="l code">${r.k}<span class="nm">${esc(r.u)}</span></td><td colspan="11" class="l fail">${esc((r.flags || []).map(f => f.metin).join('; '))}</td></tr>`;
      const kf = r.kira.tespit !== 'Doğrudan', k12 = r.kira.tespit12 !== 'Doğrudan';
      const fl = [...new Map((r.flags || []).filter(f => f.seviye !== 'bilgi').map(f => [f.tur, f])).values()].sort((a, b) => SEV[b.seviye] - SEV[a.seviye]);
      return `<tr data-k="${r.k}">
      <td class="l code">${r.k}<span class="nm">${esc(r.u)}</span></td>
      <td class="l">${gun(r.donemSonu)}<span class="nm">${r.ay} ay · ${r.nitelik === 'Konsolide' ? 'kons.' : 'solo'}</span></td>
      <td>${sayi(r.TA)}</td><td>${sayi(r.hasilat.donem)}</td><td>${sayi(r.hasilat.ltm)}</td>
      <td class="${kf ? 'flagcell' : ''}">${sayi(r.kira.donem)}${tes(r.kira.tespit)}</td><td class="${k12 ? 'flagcell' : ''}">${sayi(r.kira.ltm)}${tes(r.kira.tespit12)}</td>
      <td>${sayi(r.favok.donem)}</td><td>${sayi(r.favok.ltm)}</td>
      <td>${pct(r.oran.kg)}</td><td>${pct(r.oran.kv, 2)}</td>
      <td class="l">${fl.slice(0, 3).map(f => `<span class="fl fl-${f.tur}" title="${esc(f.metin)}">${TUR[f.tur] || f.tur}</span>`).join('')}</td></tr>`;
    }).join('')}</tbody></table>
    <p class="ipucu" style="padding:6px 10px">Tutarlar ${S.birim === 1 ? 'TL' : 'milyon TL'}. ${L.length} şirket.</p>`;
  $('tablo').querySelectorAll('th[data-s]').forEach(h => h.onclick = () => { const k = h.dataset.s; if (S.sk === k) S.sd = -S.sd; else { S.sk = k; S.sd = k === 'k' ? 1 : -1; } tablo(); });
  $('tablo').querySelectorAll('tr[data-k]').forEach(t => t.onclick = () => detay(t.dataset.k));
}

function detay(k) {
  const r = S.D.satirlar.find(x => x.k === k);
  $('dTitle').textContent = `${k} · ${r.u}`;
  if (!r.TA) { $('dBody').innerHTML = `<p class="fail">${esc(r.flags.map(f => f.metin).join('; '))}</p>`; $('drawer').hidden = false; return; }
  const m = v => v == null ? '–' : tr(v / 1e6, 1);
  const ay = r.ay, kf = r.kf;
  const kopruSatir = (ad, x, tes) => `<tr><td class="l">${ad}</td><td>${m(x.donem)}</td><td>${m(x.yillik)}</td><td>${m(x.onceki)}</td><td><b>${m(x.ltm)}</b></td></tr>`;
  const kay = (ad, t, metin) => metin ? `<div class="kay ${t && t !== 'Doğrudan' ? 'karar' : ''}"><b>${ad}</b> <span class="tes tes-${t}">${t}</span>${t === 'Doğrudan' ? ' <span class="nm" style="display:inline">doğrudan</span>' : ''}<br>${esc(metin)}</div>` : '';
  $('dBody').innerHTML = `
    <h3>Rapor</h3>
    <div class="kay">${r.nitelik} · dönem sonu ${gun(r.donemSonu)} (${ay} ay) · birim ${esc(r.birim)} · yayım ${esc(r.rapor.yayim.slice(0, 16))}<br>
      <a href="${r.rapor.url}" target="_blank" rel="noopener">Finansal rapor</a>
      ${r.yillik ? ` · <a href="${r.yillik.url}" target="_blank" rel="noopener">Yıllık rapor (${gun(r.yillik.donemSonu)})</a>` : ''}
      ${r.onceki ? ` · <a href="${r.onceki.url}" target="_blank" rel="noopener">Önceki yıl aynı dönem</a>` : ''}
      ${r.faaliyet ? ` · <a href="${r.faaliyet.url}" target="_blank" rel="noopener">Faaliyet raporu</a>` : ''}</div>
    <h3>Toplam varlıklar</h3>
    <p><b>${tr(r.TA, 0)} TL</b> <span class="birim">(${gun(r.donemSonu)} bilançosu)</span></p>
    <h3>12 ay köprüsü <span class="birim">mn TL</span></h3>
    <div class="formul">${esc(r.formul)}${kf ? ` · TÜFE katsayısı ${tr(kf, 4)}` : ''}${r.kira.ltmFormul === 'yilliklandir' ? ' · kira: dönem × 12/' + ay : ''}</div>
    <table class="mini kopru"><thead><tr><th class="l"></th><th>Dönem (${ay} ay)</th><th>Yıllık rapor</th><th>Önceki yıl ${ay} ay</th><th>Son 12 ay</th></tr></thead><tbody>
      ${kopruSatir('Hasılat', r.hasilat)}${kopruSatir('Kira geliri', r.kira)}${kopruSatir('FAVÖK', r.favok)}
      <tr class="ayrac"><td class="l">Kira / Hasılat</td><td>${pct(r.hasilat.donem ? r.kira.donem / r.hasilat.donem : null)}</td><td>${pct(r.hasilat.yillik ? r.kira.yillik / r.hasilat.yillik : null)}</td><td>${pct(r.hasilat.onceki ? r.kira.onceki / r.hasilat.onceki : null)}</td><td>${pct(r.oran.kg)}</td></tr>
    </tbody></table>
    <p class="not">Yıllık rapor sütunu raporun kendi TL'siyle; 12 ay hesabında TÜFE katsayısıyla dönem sonuna taşınır. Önceki yıl sütunu son rapordaki karşılaştırmalı sütundur (zaten dönem sonu TL'si).</p>
    <h3>Kira geliri kaynakları</h3>
    ${kay(`Dönem (${ay} ay)`, r.kira.tespit, r.kira.donemKaynak)}
    ${kay('Yıllık rapor', r.kira.yillikTespit, r.kira.yillikKaynak)}
    ${kay(`Önceki yıl ${ay} ay`, r.kira.oncekiTespit, r.kira.oncekiKaynak)}
    ${(r.kira.dipnotSatir || []).length ? `<p class="not">Dipnotta otomatik okunan satır(lar):</p><pre class="satir">${r.kira.dipnotSatir.map(esc).join('\n')}</pre>` : ''}
    <p class="not">Faaliyet raporu: ${r.faaliyet ? (r.kira.faaliyetTeyit ? 'dönem kira tutarı faaliyet raporunda da geçiyor (teyitli).' : ((r.kira.faaliyetSatir || []).length ? 'kira geçen satırlar var, tutar birebir eşleşmedi:' : 'kira tutarı geçen satır yok.')) : 'aynı döneme ait faaliyet raporu bulunamadı.'}</p>
    ${!r.kira.faaliyetTeyit && (r.kira.faaliyetSatir || []).length ? `<pre class="satir">${r.kira.faaliyetSatir.map(esc).join('\n')}</pre>` : ''}
    <h3>Flag'ler</h3>
    ${(r.flags || []).length ? `<ul class="alt">${r.flags.slice().sort((a, b) => SEV[b.seviye] - SEV[a.seviye]).map(f => `<li><span class="fl fl-${f.tur}">${TUR[f.tur] || f.tur}</span> <span class="sev sev-${f.seviye}">${f.seviye}</span> ${esc(f.metin)}</li>`).join('')}</ul>` : '<p class="not">Yok.</p>'}`;
  $('drawer').hidden = false;
}

function bagla() {
  document.querySelectorAll('#segF button').forEach(b => b.onclick = () => { S.filtre = b.dataset.f; document.querySelectorAll('#segF button').forEach(x => x.setAttribute('aria-pressed', x === b)); tablo(); });
  document.querySelectorAll('#segB button').forEach(b => b.onclick = () => { S.birim = +b.dataset.b; document.querySelectorAll('#segB button').forEach(x => x.setAttribute('aria-pressed', x === b)); tablo(); });
  $('ara').oninput = e => { S.ara = e.target.value; tablo(); };
}
$('dClose').onclick = () => { $('drawer').hidden = true; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('drawer').hidden = true; });
yukle();
