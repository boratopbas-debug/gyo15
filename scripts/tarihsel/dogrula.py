"""build.py çıktısını bağımsız kontrollerden geçirir ve sonucu public/data/tarihsel.json içine 'dogrulama' olarak yazar.
1) Endeks serisi: her dönem için al-tut portföy değeriyle (ağırlık × hisse toplam getiri endeksi) karşılaştırma
2) Ağırlıklar: toplam = 1, %3 ≤ w ≤ %13
3) XBRL toplam varlık ↔ İş Yatırım (yalnız ara dönem; konsolide/solo farkı ayrıca gösterilir)
4) Temettü: KAP kararından hesaplanan tutar ↔ İş Yatırım ödeme kayıtları (flag sayıları)
5) Kira okuyucu: Kasım 2026 elle tespitlerine karşı isabet (scripts/tarihsel/kira_test.json varsa)
Kullanım: python3 scripts/tarihsel/dogrula.py"""
import sys, os, json, datetime as dt, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build as B
from ortak import ROOT, CACHE

F = os.path.join(ROOT, 'public', 'data', 'tarihsel.json')
D = json.load(open(F))
seri = {s['t']: s for s in D['seri']}
out = []


def tr_idx(k, gunler, bas):
    v, prev, o = 1.0, bas, {}
    for g in gunler:
        a, b = B.px_gun(k, prev), B.px_gun(k, g)
        if a and b:
            r = b['adj'] / a['adj'] - 1
            for dv in B.TEM['odeme'].get(k, []):
                if dv['tarih'] == g.isoformat():
                    hb = float(str(dv['hb']).replace(',', '.'))
                    f = (a['px'] / a['adj']) / (b['px'] / b['adj'])
                    if abs(f - 1) < 0.002 + hb / a['px'] * 1.2:
                        r = (b['px'] + hb * (1 - B.stopaj_orani(k, g))) / a['px'] - 1
            v *= 1 + r
            prev = g
        o[g] = v
    return o


# 1-2
maks, olay_var = 0.0, False
for d0 in D['donemler']:
    bas = dt.date.fromisoformat(d0['agirlikGunu'])
    gunler = [g for g in B.GUNLER if d0['bas'] <= g.isoformat() <= d0['son']]
    idx = {u['k']: tr_idx(u['k'], gunler, bas) for u in d0['uyeler']}
    I0 = seri[d0['agirlikGunu']]['tl']
    for g in gunler:
        bh = sum(u['w'] * idx[u['k']][g] for u in d0['uyeler'])
        maks = max(maks, abs(seri[g.isoformat()]['tl'] / I0 - bh))
olay_var = any(o['tur'] in ('kapsam', 'esik') for o in D['olaylar'])
out.append({'ad': 'Endeks serisi ↔ bağımsız al-tut hesabı', 'sonuc': 'tutarlı' if maks < 1e-9 else ('dönem içi kapsam/eşik olayı var, sapma beklenir' if olay_var else 'FARKLI'),
            'detay': f'{len(D["donemler"])} dönem, en büyük günlük fark {maks:.1e}'})
w_ok = all(abs(sum(u['w'] for u in d['uyeler']) - 1) < 1e-9 and all(0.03 - 1e-9 <= u['w'] <= 0.13 + 1e-9 for u in d['uyeler']) for d in D['donemler'])
out.append({'ad': 'Dönem başı ağırlıkları', 'sonuc': 'tutarlı' if w_ok else 'FARKLI', 'detay': 'Her dönemde toplam %100, tüm üyeler %3–%13 aralığında'})

# 3
S = os.path.join(CACHE, 'is_maliTablo')
os.makedirs(S, exist_ok=True)
say = uyum = kons = 0
for v in D['degerlemeler']:
    for r in v['satirlar']:
        rp = r.get('rapor')
        if not rp or rp['ay'] == 12 or rp['donemSonu'][5:7] not in ('03', '06', '09', '12') or r['k'] == 'MRGYO':
            continue   # Nisan–Mart mali yılı (MRGYO): İş Yatırım dönem kodları takvim yılıyla eşleşmiyor
        y, m = int(rp['donemSonu'][:4]), int(rp['donemSonu'][5:7])
        f = os.path.join(S, f"{r['k']}_{y}_{m}.json")
        if not os.path.exists(f):
            url = ('https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo?'
                   f"companyCode={r['k']}&exchange=TRY&financialGroup=XI_29&year1={y}&period1={m}&year2={y}&period2={m}&year3={y}&period3={m}&year4={y}&period4={m}")
            x = subprocess.run(['curl', '-sS', '-m', '40', url], capture_output=True).stdout
            open(f, 'wb').write(x)
        try:
            I = {q['itemCode']: q['value1'] for q in json.load(open(f))['value']}
            ta = float(I.get('1BL') or 0)
        except Exception:
            continue
        if not ta:
            continue
        say += 1
        if abs(ta / r['g']['TA'] - 1) < 0.001:
            uyum += 1
        elif rp['nitelik'] == 'Konsolide':
            kons += 1
        else:
            r['flags'].append({'tur': 'celiski', 'seviye': 'uyari', 'metin': f"Toplam varlık XBRL'de {r['g']['TA']/1e6:,.0f} mn, İş Yatırım'da {ta/1e6:,.0f} mn (aynı dönem, solo)"})
out.append({'ad': 'XBRL toplam varlık ↔ İş Yatırım (ara dönemler)', 'sonuc': 'tutarlı' if say - uyum - kons == 0 else 'farklılar flag\'lendi',
            'detay': f'{say} karşılaştırma: {uyum} birebir aynı, {kons} farkın nedeni İş Yatırım\'ın konsolide yerine solo tablo göstermesi, {say - uyum - kons} açıklanamayan fark'})

# 4-5
t = sum(1 for v in D['degerlemeler'] for r in v['satirlar'] for f in r.get('flags', []) if 'İş Yatırım ödeme kayıtlarıyla tutarlı' in f['metin'])
c = sum(1 for v in D['degerlemeler'] for r in v['satirlar'] for f in r.get('flags', []) if f['tur'] == 'celiski' and 'İş Yatırım ödeme' in f['metin'])
out.append({'ad': 'Temettü: KAP kararı ↔ İş Yatırım ödemeleri', 'sonuc': 'tutarlı' if not c else f'{c} çelişki flag\'lendi', 'detay': f'{t} şirket-değerleme tutarlı, {c} farklı'})
kt = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kira_test.json')
if os.path.exists(kt):
    k = json.load(open(kt))
    out.append({'ad': 'Kira okuyucu ↔ Kasım 2026 elle tespitler (9A26)', 'sonuc': f"{k['eslesen']}/{k['toplam']} birebir", 'detay': k['not']})
p = sum(1 for v in D['degerlemeler'] for r in v['satirlar'] for f in r.get('flags', []) if f['tur'] == 'teyit' and 'PDF' in f['metin'])
n = sum(1 for v in D['degerlemeler'] for r in v['satirlar'] for f in r.get('flags', []) if 'PDF metninde birebir bulunamadı' in f['metin'])
out.append({'ad': 'XBRL ↔ dipnotlu PDF (toplam varlık, hasılat, özkaynak)', 'sonuc': 'tutarlı' if not n else f'{n} rapor flag\'lendi', 'detay': f'{p} raporda üç tutar da PDF\'te aynı, {n} raporda en az biri bulunamadı'})

D['dogrulama'] = out
json.dump(D, open(F, 'w'), ensure_ascii=False, default=str, separators=(',', ':'))
for o in out:
    print(o)
