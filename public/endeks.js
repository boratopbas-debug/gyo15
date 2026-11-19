// OSG15 endeks hesaplama sayfası: tarihsel seçimler, getiri endeksi grafiği, tarih arama, flag'ler.
// Veri: data/tarihsel.json (scripts/tarihsel/build.py üretir).

const S = { D: null, para: 'tl', xu: true, aralik: 'all', tarih: null, degIdx: null, fTur: 'all', fSev: 'all', fTarih: null, sk: 'sira', sd: 1, filtre: 'all' };
const $ = id => document.getElementById(id);
const tr = (v, d = 2) => v == null || Number.isNaN(v) ? '–' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 1) => v == null ? '–' : (v < 0 ? '−%' : '%') + tr(Math.abs(v) * 100, d);
const mn = v => v == null ? '–' : tr(v / 1e6, 1) + ' mn';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gun = s => s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : '–';
const TUR = { dogrulanamadi: 'Doğrulanamadı', celiski: 'Çelişki', tahmini: 'Tahmini', cikarim: 'Çıkarım', veri: 'Veri', teyit: 'Teyitli', piyasa: 'Piyasa',
  kapsam: 'Kapsam değişikliği', esik: '%30 eşiği', 'islem-yok': 'İşlem yok', donem: 'Dönem değişimi', secim: 'Seçim verisi' };
const SEV = { kritik: 3, uyari: 2, bilgi: 1 };

async function yukle() {
  S.D = await fetch('data/tarihsel.json', { cache: 'no-store' }).then(r => r.json());
  const son = S.D.seri[S.D.seri.length - 1];
  S.tarih = son.t;
  S.degIdx = S.D.degerlemeler.length - 1;
  $('olusturma').textContent = `Veri: ${gun(S.D.olusturma.slice(0, 10))} ${S.D.olusturma.slice(11)}`;
  ciz();
}

/* ---------------- yardımcılar ---------------- */
function donemBul(t) {
  return S.D.donemler.find(d => t >= d.bas && t <= d.son) || (t < S.D.donemler[0].bas ? null : S.D.donemler[S.D.donemler.length - 1]);
}
function seriBul(t) {
  let s = null;
  for (const x of S.D.seri) { if (x.t <= t) s = x; else break; }
  return s;
}
function degerlemeOf(donem) { return S.D.degerlemeler.findIndex(v => v.gun === donem.degerleme); }
function tumFlagler() {
  // grafikteki olaylar + endeks/yedek üyelerinin şirket flag'leri (bilgi hariç)
  const out = S.D.olaylar.map(o => ({ ...o, kaynak: 'olay' }));
  S.D.degerlemeler.forEach((v, i) => {
    for (const r of v.satirlar) {
      for (const f of r.flags || []) {
        if (f.seviye === 'bilgi') continue;
        out.push({ t: v.gun, bit: v.gun, k: r.k, tur: f.tur, seviye: f.seviye, metin: f.metin, kaynak: 'secim', deg: i, durum: r.durum });
      }
    }
  });
  return out;
}

/* ---------------- ana çizim ---------------- */
function ciz() {
  const D = S.D, son = D.seri[D.seri.length - 1], ilk = D.seri[0];
  const kritik = tumFlagler().filter(f => f.seviye === 'kritik').length;
  const getiri = (a, b, k) => b[k] / a[k] - 1;
  $('main').innerHTML = `
  <section class="ozet6">
    <div><span class="l">OSG15 getiri endeksi (TL)</span><span class="n">${tr(son.tl)}</span><span class="l">${gun(son.t)}</span></div>
    <div><span class="l">Baz ${gun(ilk.t)} = ${tr(D.baz.deger, 0)}</span><span class="n ${son.tl >= ilk.tl ? 'up' : 'down'}">${pct(getiri(ilk, son, 'tl'))}</span><span class="l">TL toplam getiri</span></div>
    <div><span class="l">USD versiyonu</span><span class="n ${son.usd >= ilk.usd ? 'up' : 'down'}">${pct(getiri(ilk, son, 'usd'))}</span><span class="l">${tr(son.usd)}</span></div>
    <div><span class="l">BIST 100 (fiyat) aynı dönem</span><span class="n">${pct(getiri(ilk, son, 'xu100'))}</span><span class="l">kıyas</span></div>
    <div><span class="l">Endeks dönemi</span><span class="n">${D.donemler.length}</span><span class="l">${D.degerlemeler.length} değerleme (son: önizleme)</span></div>
    <div><span class="l">Kritik flag</span><span class="n ${kritik ? 'down' : ''}">${kritik}</span><span class="l">grafikte kırmızı işaret</span></div>
  </section>

  <section>
    <div class="bar">
      <h2>Endeks grafiği</h2>
      <div class="bar">
        <div class="seg" id="segPara">${[['tl', 'TL'], ['usd', 'USD']].map(([k, l]) => `<button data-p="${k}" aria-pressed="${S.para === k}">${l}</button>`).join('')}</div>
        <div class="seg" id="segAralik">${[['all', 'Tümü'], ['1y', '1 yıl'], ['6m', '6 ay'], ['3m', '3 ay']].map(([k, l]) => `<button data-a="${k}" aria-pressed="${S.aralik === k}">${l}</button>`).join('')}</div>
        <label class="ipucu"><input type="checkbox" id="xu" ${S.xu ? 'checked' : ''}> BIST 100</label>
      </div>
    </div>
    <div class="grafik" id="grafik"></div>
    <div class="legend">
      <span><i style="background:var(--accent)"></i>OSG15 ${S.para.toUpperCase()}</span>
      ${S.xu ? '<span><i style="background:#a7a29a"></i>BIST 100 (fiyat, aynı baz)</span>' : ''}
      <span><i class="tri" style="border-bottom-color:var(--out)"></i>Kritik</span>
      <span><i class="tri" style="border-bottom-color:#d39317"></i>Uyarı</span>
      <span><i class="tri" style="border-bottom-color:#6c7d78"></i>Bilgi</span>
      <span>◯ Dönem başı (giren/çıkan)</span>
      <span>Kesikli dikey çizgi: endeks dönemi sınırı</span>
    </div>
  </section>

  <section class="ara">
    <div class="card">
      <h3>Tarihle ara</h3>
      <label>Gün<input type="date" id="tarih" value="${S.tarih}" min="${ilk.t}" max="${son.t}"></label>
      <div id="araSonuc"></div>
    </div>
    <div class="card" id="uyeKart"></div>
  </section>

  <section>
    <div class="bar">
      <h2>Seçim tablosu</h2>
      <div class="bar">
        <select id="degSec">${S.D.degerlemeler.map((v, i) => `<option value="${i}" ${i === S.degIdx ? 'selected' : ''}>${gun(v.gun)} değerlemesi${v.onizleme ? ' (önizleme: bugünkü fiyatlar)' : ''}</option>`).join('')}</select>
        <div class="seg" id="segF">${[['all', 'Tümü'], ['sel', 'Endeks + yedek'], ['pool', 'Havuz'], ['out', 'Elenenler'], ['flag', 'Flag\'li']].map(([f, l]) => `<button data-f="${f}" aria-pressed="${S.filtre === f}">${l}</button>`).join('')}</div>
      </div>
    </div>
    <p class="ipucu">Satıra tıkla: girdiler, LTM FAVÖK hesabı, kira tespitinin dipnot ve faaliyet raporu satırları, temettü kararı ve tüm flag'ler açılır.</p>
    <div id="secimTablo"></div>
  </section>

  <section>
    <div class="bar">
      <h2>Flag'ler</h2>
      <div class="bar">
        <select id="fTur"><option value="all">Tüm türler</option>${Object.entries(TUR).map(([k, l]) => `<option value="${k}" ${S.fTur === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="fSev">${[['all', 'Tüm seviyeler'], ['kritik', 'Kritik'], ['uyari', 'Uyarı'], ['bilgi', 'Bilgi']].map(([k, l]) => `<option value="${k}" ${S.fSev === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${S.fTarih ? `<button class="btn" id="fTemizle">Tarih filtresini kaldır (${gun(S.fTarih)})</button>` : ''}
      </div>
    </div>
    <p class="ipucu">Endeks olayları (dönem değişimi, işlem görmeyen pay, %30 eşiği, kapsam değişikliği) ve seçimi etkileyebilecek veri sorunları. "Doğrulanamadı": veri iki kaynakta teyit edilemedi. "Çelişki": iki kaynak farklı söylüyor.</p>
    <ul class="flaglist" id="flagList"></ul>
  </section>

  <section>
    <h2>Dönem getirileri</h2>
    <div class="tablebox"><table>
      <thead><tr><th class="l">Endeks dönemi</th><th class="l">Değerleme</th><th>Üye</th><th class="l">Giren</th><th class="l">Çıkan</th><th>TL</th><th>USD</th><th>BIST 100</th><th>Fark (TL − BIST100)</th></tr></thead>
      <tbody>${S.D.donemler.map(d => `<tr class="src2" data-t="${d.bas}">
        <td class="l">${gun(d.bas)} – ${gun(d.son)}</td><td class="l">${gun(d.degerleme)}</td><td>${d.uyeler.length}</td>
        <td class="l">${d.giren.map(k => `<span class="chip giren">${k}</span>`).join(' ') || '–'}</td>
        <td class="l">${d.cikan.map(k => `<span class="chip cikan">${k}</span>`).join(' ') || '–'}</td>
        <td class="${d.getiriTL >= 0 ? 'up' : 'down'}">${pct(d.getiriTL)}</td><td class="${d.getiriUSD >= 0 ? 'up' : 'down'}">${pct(d.getiriUSD)}</td><td>${pct(d.getiriXU100)}</td>
        <td>${d.getiriXU100 != null ? pct(d.getiriTL - d.getiriXU100) : '–'}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>

  ${yontem()}`;
  grafik(); araCiz(); tabloCiz(); flagCiz(); bagla();
}

/* ---------------- grafik ---------------- */
function grafik() {
  const D = S.D, el = $('grafik');
  let seri = D.seri;
  const son = new Date(seri[seri.length - 1].t);
  const gunGeri = { '1y': 365, '6m': 182, '3m': 91 }[S.aralik];
  if (gunGeri) { const s = new Date(son - gunGeri * 864e5).toISOString().slice(0, 10); seri = seri.filter(x => x.t >= s); }
  const k = S.para;
  const W = 1200, H = 380, L = 56, R = 16, T = 14, B = 34;
  const t0 = new Date(seri[0].t).getTime(), t1 = new Date(seri[seri.length - 1].t).getTime();
  const X = t => L + (new Date(t).getTime() - t0) / (t1 - t0 || 1) * (W - L - R);
  // XU100 seriyi görünen aralığın başında endeksle aynı seviyeye ölçekle
  const xuOlcek = seri[0].xu100 ? seri[0][k] / seri[0].xu100 : 1;
  const vals = seri.map(x => x[k]).concat(S.xu ? seri.map(x => x.xu100 && x.xu100 * xuOlcek).filter(Boolean) : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const yt = niceTicks(lo, hi, 6);
  const path = f => seri.filter(f).map((x, i) => `${i ? 'L' : 'M'}${X(x.t).toFixed(1)},${Y(f(x)).toFixed(1)}`).join('');
  const ln = path(x => x[k]);
  const area = ln + `L${X(seri[seri.length - 1].t)},${H - B}L${X(seri[0].t)},${H - B}Z`;
  const xu = S.xu ? seri.filter(x => x.xu100).map((x, i) => `${i ? 'L' : 'M'}${X(x.t).toFixed(1)},${Y(x.xu100 * xuOlcek).toFixed(1)}`).join('') : '';
  // ay etiketleri
  const aylar = [];
  for (const x of seri) { const m = x.t.slice(0, 7); if (!aylar.length || aylar[aylar.length - 1].m !== m) aylar.push({ m, t: x.t }); }
  const adim = Math.ceil(aylar.length / 12);
  // dönem sınırları
  const donemCizgi = D.donemler.filter(d => d.bas >= seri[0].t && d.bas <= seri[seri.length - 1].t);
  // olay işaretleri: güne göre grupla
  const gr = {};
  for (const o of D.olaylar) {
    if (o.t < seri[0].t || o.t > seri[seri.length - 1].t) continue;
    (gr[o.t] = gr[o.t] || []).push(o);
  }
  const sx = Object.fromEntries(seri.map(x => [x.t, x]));
  const mk = Object.entries(gr).map(([t, os]) => {
    const p = sx[t] || seriBul(t); if (!p) return '';
    const sev = os.reduce((m, o) => SEV[o.seviye] > SEV[m] ? o.seviye : m, 'bilgi');
    const x = X(p.t), y = Y(p[k]);
    if (os.every(o => o.tur === 'donem')) return `<circle class="mk mk-donem" data-t="${t}" cx="${x}" cy="${y}" r="5"/>`;
    const yy = y - 10;
    return `<path class="mk mk-${sev}" data-t="${t}" d="M${x},${yy - 9}L${x - 6},${yy + 2}L${x + 6},${yy + 2}Z"/>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="OSG15 endeks değeri">
    ${yt.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${tr(v, 0)}</text>`).join('')}
    ${aylar.filter((a, i) => i % adim === 0).map(a => `<text class="ax" x="${X(a.t)}" y="${H - 12}" text-anchor="middle">${a.m.slice(5)}.${a.m.slice(2, 4)}</text>`).join('')}
    ${donemCizgi.map(d => `<line class="donem" x1="${X(d.bas)}" x2="${X(d.bas)}" y1="${T}" y2="${H - B}"/><text class="dlabel" x="${X(d.bas) + 3}" y="${T + 9}">${d.bas.slice(5, 7) === '01' ? 'Q1' : d.bas.slice(5, 7) === '04' ? 'Q2' : d.bas.slice(5, 7) === '07' ? 'Q3' : 'Q4'} ${d.bas.slice(2, 4)}</text>`).join('')}
    <path class="area" d="${area}"/>
    ${xu ? `<path class="ln-xu" d="${xu}"/>` : ''}
    <path class="ln-${k === 'tl' ? 'tl' : 'usd'}" d="${ln}"/>
    <line class="cursor" id="cur" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    ${mk}
    <rect id="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
  </svg>`;
  const svg = el.querySelector('svg'), tip = $('tip'), cur = $('cur');
  const pt = e => { const r = svg.getBoundingClientRect(); return (e.clientX - r.left) / r.width * W; };
  const yakin = px => { let b = seri[0], bd = 1e9; for (const x of seri) { const dd = Math.abs(X(x.t) - px); if (dd < bd) { bd = dd; b = x; } } return b; };
  svg.querySelector('#hit').addEventListener('mousemove', e => {
    const p = yakin(pt(e)); cur.setAttribute('x1', X(p.t)); cur.setAttribute('x2', X(p.t)); cur.setAttribute('visibility', 'visible');
    const d = donemBul(p.t);
    tip.innerHTML = `<b>${gun(p.t)}</b><br>OSG15 TL ${tr(p.tl)} · USD ${tr(p.usd)}${p.xu100 ? `<br>BIST 100 (baz) ${tr(p.xu100)}` : ''}${d ? `<br><span style="color:#9fb2ac">Dönem ${gun(d.bas)}–${gun(d.son)}</span>` : ''}`;
    tip.hidden = false; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px';
  });
  svg.querySelector('#hit').addEventListener('mouseleave', () => { tip.hidden = true; cur.setAttribute('visibility', 'hidden'); });
  svg.querySelector('#hit').addEventListener('click', e => { const p = yakin(pt(e)); S.tarih = p.t; $('tarih').value = p.t; araCiz(); });
  svg.querySelectorAll('.mk').forEach(m => {
    m.addEventListener('mousemove', e => {
      const os = gr[m.dataset.t];
      tip.innerHTML = `<b>${gun(m.dataset.t)}</b><br>${os.slice(0, 6).map(o => `• ${esc(o.metin)}`).join('<br>')}${os.length > 6 ? `<br>… +${os.length - 6}` : ''}<br><span style="color:#9fb2ac">Tıkla: flag listesinde göster</span>`;
      tip.hidden = false; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px';
    });
    m.addEventListener('mouseleave', () => { tip.hidden = true; });
    m.addEventListener('click', () => { S.fTarih = m.dataset.t; S.tarih = m.dataset.t; ciz(); $('flagList').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  });
}
function niceTicks(lo, hi, n) {
  const span = hi - lo, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0);
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v); return out;
}

/* ---------------- tarihle arama ---------------- */
function araCiz() {
  const t = S.tarih, p = seriBul(t), d = donemBul(t);
  if (!p || !d) { $('araSonuc').innerHTML = '<p class="not">Bu tarihte endeks yok (baz tarihinden önce).</p>'; $('uyeKart').innerHTML = ''; return; }
  const vi = degerlemeOf(d), v = S.D.degerlemeler[vi];
  const ilkP = seriBul(d.agirlikGunu);
  const raporlar = {};
  for (const r of v.satirlar) if (r.durum === 'Endeks' && r.rapor) raporlar[r.rapor.donemSonu] = (raporlar[r.rapor.donemSonu] || 0) + 1;
  $('araSonuc').innerHTML = `
    <dl class="kv">
      <dt>İşlem günü</dt><dd>${gun(p.t)}${p.t !== t ? ' (en yakın önceki)' : ''}</dd>
      <dt>Endeks (TL)</dt><dd>${tr(p.tl)}</dd>
      <dt>Endeks (USD)</dt><dd>${tr(p.usd)}</dd>
      <dt>Endeks dönemi</dt><dd>${gun(d.bas)} – ${gun(d.son)}</dd>
      <dt>Dönem başından</dt><dd class="${p.tl >= ilkP.tl ? 'up' : 'down'}">${pct(p.tl / ilkP.tl - 1)}</dd>
      <dt>Değerleme günü</dt><dd>${gun(d.degerleme)}</dd>
      <dt>Ağırlık günü</dt><dd>${gun(d.agirlikGunu)}</dd>
      <dt>Kullanılan raporlar</dt><dd>${Object.entries(raporlar).sort().map(([k, n]) => `${gun(k)} (${n})`).join(', ')}</dd>
    </dl>
    <div><span class="l ipucu">Önceki döneme göre</span><div class="chips">${d.giren.map(k => `<span class="chip giren">+ ${k}</span>`).join('')}${d.cikan.map(k => `<span class="chip cikan">${k}</span>`).join('')}${!d.giren.length && !d.cikan.length ? '<span class="not">değişiklik yok</span>' : ''}</div></div>
    <button class="btn" id="tabloyaGit">Bu dönemin seçim tablosunu aç</button>`;
  $('tabloyaGit').onclick = () => { S.degIdx = vi; ciz(); $('secimTablo').scrollIntoView({ behavior: 'smooth' }); };
  const satir = Object.fromEntries(v.satirlar.map(r => [r.k, r]));
  const wmax = Math.max(...d.uyeler.map(u => u.w));
  $('uyeKart').innerHTML = `<h3>${gun(d.bas)} dönemi üyeleri ve dönem başı ağırlıkları</h3>
    <div class="tablebox"><table class="mini"><thead><tr><th class="l">Pay</th><th>Sıra</th><th>Puan</th><th>Ağırlık</th><th>FDP PD</th><th class="l">Flag</th></tr></thead><tbody>
    ${d.uyeler.map(u => { const r = satir[u.k] || {}; const f = (r.flags || []).filter(x => x.seviye !== 'bilgi');
      return `<tr class="src2" data-k="${u.k}" data-v="${vi}"><td class="l code">${u.k}</td><td>${r.sira ?? '–'}</td><td>${tr(r.puan, 1)}</td>
      <td><span class="wbar">${pct(u.w, 1)}<i style="width:${u.w / wmax * 60}px"></i></span></td><td>${mn(u.hao)}</td>
      <td class="l">${f.map(x => `<span class="fl fl-${x.tur}" title="${esc(x.metin)}">${TUR[x.tur] || x.tur}</span>`).join('')}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="not">Yedek: ${d.yedek.join(', ') || '–'}. Ağırlıklar fiili dolaşımdaki PD'ye göre, %3 taban ve %13 tavanla (kural 6.2); dönem içinde fiyatla kayar.</p>`;
  $('uyeKart').querySelectorAll('tr[data-k]').forEach(tr_ => tr_.onclick = () => detay(+tr_.dataset.v, tr_.dataset.k));
}

/* ---------------- seçim tablosu ---------------- */
const ORD = { Endeks: 0, Yedek: 1, Havuzda: 2, Elendi: 3 };
function tabloCiz() {
  const v = S.D.degerlemeler[S.degIdx];
  let L = v.satirlar.slice();
  L = L.filter(r => S.filtre === 'all' || (S.filtre === 'sel' && ['Endeks', 'Yedek'].includes(r.durum)) || (S.filtre === 'pool' && r.durum !== 'Elendi')
    || (S.filtre === 'out' && r.durum === 'Elendi') || (S.filtre === 'flag' && (r.flags || []).some(f => f.seviye !== 'bilgi' && f.tur !== 'teyit')));
  const val = r => S.sk === 'sira' ? (r.sira ?? 900 + ORD[r.durum]) : S.sk === 'puan' ? (r.puan ?? -1) : S.sk === 'k' ? r.k : (r.o?.[S.sk] ?? -Infinity);
  L.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * S.sd; });
  const th = (k, l, alt) => `<th data-s="${k}">${l}${alt ? `<small>${alt}</small>` : ''}</th>`;
  const p = (r, k) => r.p ? `<span class="pt">${tr(r.p[k], 0)} p</span>` : '';
  const kiraKotu = r => r.o && r.o.kg < 0.15 && r.o.kv < 0.025;
  $('secimTablo').innerHTML = `
    <p class="ipucu">Değerleme günü ${gun(v.gun)} · fiyat ve PD bu günün kapanışı · finansallar bu güne kadar KAP'ta yayımlanmış en güncel rapor${v.onizleme ? ' · <b>ÖNİZLEME</b>: değerleme günü henüz gelmedi, bugünkü fiyatlarla' : ''}</p>
    <div class="tablebox"><table><thead><tr>
    ${th('sira', 'Sıra')}<th class="l" data-s="k">Kod</th><th class="l">Durum</th>${th('puan', 'Puan')}
    ${th('pddd', 'PD/DD', '%50')}${th('fav', 'FAVÖK/FD', '%20')}${th('dy', 'Temettü v.', '%20')}${th('cr', 'Cari oran', '%5')}${th('lev', 'Yük./Varlık', '%5 · ≤%85')}
    ${th('kg', 'Kira/Hasılat', '≥%15')}${th('kv', 'Kira/Varlık', '≥%2,5')}<th class="l">Rapor</th><th class="l">Flag</th></tr></thead>
    <tbody>${L.map(r => `<tr class="src2" data-k="${r.k}">
      <td>${r.sira ?? '–'}</td><td class="l code">${r.k}<span class="nm">${esc(r.u)}</span></td>
      <td class="l"><span class="pill p-${r.durum}">${r.durum}</span>${r.elenme?.length ? `<span class="nm">${esc(r.elenme[0])}</span>` : ''}</td>
      <td>${r.puan != null ? tr(r.puan, 1) : '–'}</td>
      <td>${tr(r.o?.pddd)}${p(r, 'pddd')}</td><td>${pct(r.o?.fav)}${p(r, 'fav')}</td><td>${r.o ? '%' + tr(r.o.dy, 2) : '–'}${p(r, 'dy')}</td>
      <td>${tr(r.o?.cr)}${p(r, 'cr')}</td><td class="${r.o?.lev > 0.85 ? 'fail' : ''}">${pct(r.o?.lev)}${p(r, 'lev')}</td>
      <td class="${kiraKotu(r) ? 'fail' : ''}">${pct(r.o?.kg)}</td><td class="${kiraKotu(r) ? 'fail' : ''}">${pct(r.o?.kv, 2)}</td>
      <td class="l">${r.rapor ? `${gun(r.rapor.donemSonu)} <a href="${r.rapor.url}" target="_blank" rel="noopener">KAP</a>${r.rapor.pdf ? ` <a href="${r.rapor.pdf}" target="_blank" rel="noopener">PDF</a>` : ''}` : '–'}</td>
      <td class="l">${[...new Map((r.flags || []).filter(f => f.tur !== 'teyit' || true).map(f => [f.tur + f.seviye, f])).values()].sort((a, b) => SEV[b.seviye] - SEV[a.seviye]).slice(0, 4).map(f => `<span class="fl fl-${f.tur}" title="${esc(f.metin)}">${TUR[f.tur] || f.tur}${f.seviye === 'kritik' ? '!' : ''}</span>`).join('')}</td>
    </tr>`).join('')}</tbody></table></div>`;
  $('secimTablo').querySelectorAll('th[data-s]').forEach(h => h.onclick = () => { const k = h.dataset.s; if (S.sk === k) S.sd = -S.sd; else { S.sk = k; S.sd = ['sira', 'k', 'pddd', 'lev'].includes(k) ? 1 : -1; } tabloCiz(); });
  $('secimTablo').querySelectorAll('tr[data-k]').forEach(t => t.onclick = e => { if (e.target.closest('a')) return; detay(S.degIdx, t.dataset.k); });
}

/* ---------------- detay paneli ---------------- */
function detay(vi, k) {
  const v = S.D.degerlemeler[vi], r = v.satirlar.find(x => x.k === k);
  $('dTitle').textContent = `${k} · ${gun(v.gun)} değerlemesi`;
  const g = r.g || {};
  const satir = (l, x) => `<tr><td class="l">${l}</td><td>${x}</td></tr>`;
  const fav = r.ltm ? `
    <div class="formul">${esc(r.ltm.formul)}</div>
    <table class="mini"><tbody>
      ${satir(`FAVÖK cari ${r.rapor.ay} ay`, mn(r.ltm.donem.deger))}
      ${r.ltm.fy ? satir(`FAVÖK yıllık (<a href="${r.ltm.fy.url}" target="_blank" rel="noopener">rapor</a>)`, mn(r.ltm.fy.deger)) + satir('TÜFE katsayısı', tr(r.ltm.kf, 4)) : ''}
      ${r.ltm.onceki ? satir(`FAVÖK önceki yıl ${r.rapor.ay} ay`, mn(r.ltm.onceki.deger)) : ''}
      ${satir('<b>FAVÖK son 12 ay</b>', `<b>${mn(r.ltm.deger)}</b>`)}
    </tbody></table>
    <p class="not">FAVÖK = Brüt kâr + pazarlama + GYG + Ar-Ge (giderler eksi işaretli) + nakit akış tablosundaki amortisman düzeltmesi.</p>` : '';
  const kk = r.kiraKaynak;
  $('dBody').innerHTML = r.elenme?.length && !r.rapor ? `<p class="fail">${esc(r.elenme.join('; '))}</p>` : `
    <p><span class="pill p-${r.durum}">${r.durum}</span> ${r.sira ? `Sıra ${r.sira} · puan ${tr(r.puan, 1)}` : esc((r.elenme || []).join('; '))}</p>
    <h3>Rapor</h3>
    <div class="kay">${r.rapor.nitelik} · dönem sonu ${gun(r.rapor.donemSonu)} (${r.rapor.ay} ay) · birim ${esc(r.rapor.birim)} · yayım ${esc(r.rapor.yayim.slice(0, 16))}<br>
      <a href="${r.rapor.url}" target="_blank" rel="noopener">KAP bildirimi</a>${r.rapor.pdf ? ` · <a href="${r.rapor.pdf}" target="_blank" rel="noopener">Dipnotlu PDF</a>` : ''}${kk?.faaliyet?.url ? ` · <a href="${kk.faaliyet.url}" target="_blank" rel="noopener">Faaliyet raporu</a>` : ''}</div>
    <h3>Flag'ler</h3>
    ${(r.flags || []).length ? `<ul class="alt">${r.flags.slice().sort((a, b) => SEV[b.seviye] - SEV[a.seviye]).map(f => `<li><span class="fl fl-${f.tur}">${TUR[f.tur] || f.tur}</span> <span class="sev sev-${f.seviye}">${f.seviye}</span> ${esc(f.metin)}</li>`).join('')}</ul>` : '<p class="not">Yok.</p>'}
    <h3>Bilanço ve gelir tablosu (XBRL, TL)</h3>
    <table class="mini"><tbody>
      ${[['CA', 'Dönen varlıklar'], ['CL', 'KV yükümlülükler'], ['TA', 'Toplam varlıklar'], ['TL', 'Toplam yükümlülükler'], ['EQ', 'Defter değeri (ana ortaklık)'], ['REV', `Hasılat (${r.rapor.ay} ay)`], ['CASH', 'Nakit'], ['CFI', 'KV finansal yatırımlar'], ['STB', 'KV borçlanmalar'], ['CPLTB', 'UV borçlanmaların KV kısmı'], ['LTB', 'UV borçlanmalar'], ['OFL_C', 'Diğer KV finansal yük.'], ['OFL_N', 'Diğer UV finansal yük.']]
        .map(([a, l]) => satir(`${l} <span class="nm">${esc(r.kalemAd?.[a] || 'yok')}</span>`, mn(g[a]))).join('')}
      ${satir('Net borç', mn(r.nd))}${satir('Kapanış', tr(r.px) + ' TL')}${satir('Piyasa değeri', mn(r.pd))}${satir('Firma değeri', mn(r.fd))}${satir('Fiili dolaşım PD', mn(r.hao))}
    </tbody></table>
    <h3>FAVÖK (son 12 ay)</h3>${fav}
    <h3>Kira geliri</h3>
    <div class="kay karar"><b>${mn(r.kira)} TL</b> · ${esc(kk?.yontem)}</div>
    <p class="not">Dipnot okuması (${esc(kk?.dipnot?.durum)}, ${esc(kk?.dipnot?.yontem)}): ${esc(kk?.dipnot?.not)}</p>
    ${(kk?.dipnot?.satirlar || []).length ? `<pre class="satir">${kk.dipnot.satirlar.map(esc).join('\n')}</pre>` : ''}
    <p class="not">Faaliyet raporu: ${kk?.faaliyet?.idx ? (kk.faaliyet.metin ? ((kk.faaliyet.satirlar || []).length ? 'kira geçen satırlar:' : 'kira geçen sayısal satır yok') : 'metin alınamadı') : 'aynı döneme ait faaliyet raporu bulunamadı'}</p>
    ${(kk?.faaliyet?.satirlar || []).length ? `<pre class="satir">${kk.faaliyet.satirlar.map(esc).join('\n')}</pre>` : ''}
    <h3>Temettü (son OGK kararı + avans)</h3>
    <table class="mini"><tbody>${(r.divKalem || []).map(x => satir(x.url ? `<a href="${x.url}" target="_blank" rel="noopener">${esc(x.aciklama)}</a>` : esc(x.aciklama), mn(x.tutar))).join('') || satir('Karar yok', '0')}
      ${satir('<b>Toplam brüt</b>', `<b>${mn(r.div)}</b>`)}</tbody></table>
    <h3>Oranlar ve puanlar</h3>
    <table class="mini"><tbody>
      ${[['pddd', 'PD/DD', x => tr(x)], ['fav', 'FAVÖK/FD', x => pct(x)], ['dy', 'Temettü verimi', x => '%' + tr(x)], ['cr', 'Cari oran', x => tr(x)], ['lev', 'Yük./Varlık', x => pct(x)], ['kg', 'Kira/Hasılat', x => pct(x)], ['kv', 'Kira/Varlık (yıllık)', x => pct(x, 2)]]
        .map(([a, l, f]) => satir(l, `${f(r.o?.[a])}${r.p?.[a] != null ? ` · ${tr(r.p[a], 0)} p` : ''}`)).join('')}
    </tbody></table>`;
  $('drawer').hidden = false;
}

/* ---------------- flag listesi ---------------- */
function flagCiz() {
  let F = tumFlagler();
  if (S.fTur !== 'all') F = F.filter(f => f.tur === S.fTur);
  if (S.fSev !== 'all') F = F.filter(f => f.seviye === S.fSev);
  if (S.fTarih) F = F.filter(f => f.t === S.fTarih || (f.t <= S.fTarih && (f.bit || f.t) >= S.fTarih));
  F.sort((a, b) => b.t.localeCompare(a.t) || SEV[b.seviye] - SEV[a.seviye]);
  $('flagList').innerHTML = F.slice(0, 600).map(f => `<li class="${S.fTarih && f.t === S.fTarih ? 'hl' : ''}">
    <span class="zaman">${gun(f.t)}${f.bit && f.bit !== f.t ? '<br>– ' + gun(f.bit) : ''}</span>
    <span class="sev sev-${f.seviye}">${f.seviye}</span>
    <span><span class="fl fl-${f.tur}">${TUR[f.tur] || f.tur}</span>${f.k ? `<b class="code">${f.k}</b> ` : ''}${f.kaynak === 'secim' ? `<span class="nm">${gun(f.t)} değerlemesi · ${f.durum}</span> ` : ''}${esc(f.metin)}</span></li>`).join('')
    || '<li><span></span><span></span><span class="not">Bu filtreyle flag yok.</span></li>';
}

/* ---------------- yöntem ---------------- */
function yontem() {
  const D = S.D;
  const say = {};
  D.degerlemeler.forEach(v => v.satirlar.forEach(r => (r.flags || []).forEach(f => { const k = f.tur; say[k] = (say[k] || 0) + 1; })));
  const kira = { dipnot: 0, teyit: 0, hafiza: 0, tahmin: 0, yok: 0 };
  D.degerlemeler.forEach(v => v.satirlar.forEach(r => { const y = r.kiraKaynak?.yontem || ''; if (!y) return;
    if (y.startsWith('Dipnot (iki')) kira.dipnot++; else if (y.includes('teyidi')) kira.teyit++; else if (y.startsWith('Karar hafızası')) kira.hafiza++; else if (y.startsWith('Tahmini')) kira.tahmin++; else kira.yok++; }));
  return `<section class="cols">
    <div class="card"><h3>Hesaplama yöntemi</h3><ul>
      <li><b>Seçim:</b> Aralık, Mart, Haziran, Eylül ayının 15'inden önceki son işlem günü. O güne kadar KAP'ta yayımlanmış en güncel rapor (konsolide varsa konsolide; aynı dönemin düzeltmesi varsa en son yayımlanan).</li>
      <li><b>Getiri endeksi:</b> Günlük getiri = düzeltilmiş kapanıştan (bedelsiz/bedelli ve temettü düzeltilmiş) hesaplanır; temettü günü brüt temettünün stopaj kısmı geri alınır, böylece net temettü yeniden yatırılmış olur. Stopaj oranı her ödemenin KAP kâr payı kararından alınır; GYO'larda çoğunlukla %0.</li>
      <li><b>Ağırlık:</b> Dönem başından önceki son işlem günü fiili dolaşımdaki PD (İş Yatırım halka açık PD); %3 taban, %13 tavan. Dönem içinde fiyatla kayar; %30'u geçen olursa yeniden sınırlanır.</li>
      <li><b>Kapsam değişikliği:</b> 5 işlem gününden uzun fiyatsız kalan pay çıkarılır, yerine sıradaki yedek alınır.</li>
      <li><b>USD:</b> TL endeks getirisi İş Yatırım USD/TRY kuruyla çevrilir. EUR versiyonu için kur serisi yok, hesaplanmadı.</li>
      <li><b>LTM FAVÖK:</b> dönem + yıllık × TÜFE katsayısı − önceki yıl aynı dönem. Katsayılar raporlardaki yeniden düzenlenmiş önceki yıl bilançolarından türetildi (şirketler medyanı).</li>
      <li><b>Temettü:</b> KAP'ta değerleme gününe kadar genel kurul tarihi gelmiş en son kâr payı kararı (1 TL nominal başına brüt × sermaye) + sonraki avanslar; İş Yatırım ödeme kayıtlarıyla karşılaştırıldı.</li>
    </ul></div>
    <div class="card"><h3>Doğrulama özeti</h3><ul>
      ${(D.dogrulama || []).map(x => `<li><b>${esc(x.ad)}:</b> <span class="${/tutarlı|birebir/.test(x.sonuc) ? 'up' : 'down'}">${esc(x.sonuc)}</span>. ${esc(x.detay)}</li>`).join('')}
      <li><b>Kira tespiti (${D.degerlemeler.length} değerleme):</b> ${kira.dipnot} iki okuma uyumlu dipnot, ${kira.teyit} faaliyet raporuyla teyitli, ${kira.hafiza} karar hafızası, ${kira.tahmin} tahmini, ${kira.yok} bulunamadı.</li>
      <li><b>Kira okuyucunun isabeti:</b> Kasım 2026'daki 54 elle tespitin 47'sini birebir buldu; kalan 7'nin 6'sı zaten çıkarımla belirlenmişti (hafıza kuralına düşer).</li>
      <li><b>Flag sayıları (tüm değerlemeler):</b> ${Object.entries(say).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${TUR[k] || k} ${n}`).join(' · ')}</li>
      <li><b>XBRL ↔ PDF:</b> toplam varlık, hasılat ve özkaynak tutarları dipnotlu PDF metninde aranır; bulunamazsa "doğrulanamadı (bilgi)".</li>
      <li><b>Bilinmeyenler (tüm dönemler için geçerli):</b> geçmiş pazar (Yakın İzleme vb.) ve GYO statüsü bugünkü KAP listesinden alındı; fiili dolaşım oranı için MKK yerine İş Yatırım halka açıklık verisi kullanıldı; XGMYO serisi alınamadığından kıyas BIST 100 (fiyat endeksi).</li>
    </ul></div>
  </section>`;
}

/* ---------------- olaylar ---------------- */
function bagla() {
  document.querySelectorAll('#segPara button').forEach(b => b.onclick = () => { S.para = b.dataset.p; ciz(); });
  document.querySelectorAll('#segAralik button').forEach(b => b.onclick = () => { S.aralik = b.dataset.a; ciz(); });
  document.querySelectorAll('#segF button').forEach(b => b.onclick = () => { S.filtre = b.dataset.f; document.querySelectorAll('#segF button').forEach(x => x.setAttribute('aria-pressed', x === b)); tabloCiz(); });
  $('xu').onchange = e => { S.xu = e.target.checked; ciz(); };
  $('tarih').onchange = e => { if (e.target.value) { S.tarih = e.target.value; araCiz(); } };
  $('degSec').onchange = e => { S.degIdx = +e.target.value; tabloCiz(); };
  $('fTur').onchange = e => { S.fTur = e.target.value; flagCiz(); };
  $('fSev').onchange = e => { S.fSev = e.target.value; flagCiz(); };
  if ($('fTemizle')) $('fTemizle').onclick = () => { S.fTarih = null; ciz(); };
  document.querySelectorAll('tr[data-t]').forEach(t => t.onclick = () => { S.tarih = t.dataset.t; $('tarih').value = t.dataset.t; araCiz(); $('araSonuc').scrollIntoView({ behavior: 'smooth' }); });
}
$('dClose').onclick = () => { $('drawer').hidden = true; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('drawer').hidden = true; });
yukle();
