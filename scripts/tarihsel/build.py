"""OSG15 tarihsel endeks hesabı.
1) Her değerleme günü için seçim (kural seti: rapor, LTM FAVÖK, kira, temettü, puanlama)
2) Endeks dönemleri boyunca günlük getiri endeksi (TL/USD), ağırlık sınırları ve olay flag'leri
Çıktı: public/data/tarihsel.json
Kullanım: python3 scripts/tarihsel/build.py"""
import json, os, sys, re, statistics, datetime as dt, math
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ortak import ROOT, CACHE, evren, katalog, secili, yillik, rapor, kalem, carpan, d, BS
import kira as K

KURAL = {'agirlik': {'pddd': 50, 'fav': 20, 'dy': 20, 'cr': 5, 'lev': 5}, 'yon': {'pddd': 'k', 'fav': 'b', 'dy': 'b', 'cr': 'b', 'lev': 'k'},
         'lev': 0.85, 'kg': 0.15, 'kv': 0.025, 'n': 15, 'yedek': 2, 'wmin': 0.03, 'wmax': 0.13, 'esik': 0.30}
BAZ = 1000.0

EV = evren()
UNVAN = {r['kod']: r['unvan'] for r in EV}
KAT = katalog()


# ---------------------------------------------------------------- fiyat
def fiyatlar():
    P = {}
    for k in list(UNVAN):
        f = os.path.join(CACHE, 'fiyat', f'{k}.json')
        rows = json.load(open(f)) if os.path.exists(f) else []
        s = {}
        for x in rows:
            g = d(x['HGDG_TARIH'])
            if x.get('HG_KAPANIS'):
                s[g] = {'px': x['HG_KAPANIS'], 'adj': x['HGDG_KAPANIS'], 'pd': x['PD'], 'hao': x['HAO_PD'], 'usd': x['DD_DEGER'],
                        'xu100': x['END_DEGER'], 'sermaye': x['SERMAYE'], 'hacim': x['HG_HACIM']}
        P[k] = dict(sorted(s.items()))
    return P


P = fiyatlar()
GUNLER = sorted({g for s in P.values() for g in s})
USD = {}
XU = {}
for s in P.values():
    for g, x in s.items():
        USD.setdefault(g, x['usd']); XU.setdefault(g, x['xu100'])


def son_islem(oncesi):
    """oncesi tarihinden önceki son işlem günü"""
    return max(g for g in GUNLER if g < oncesi)


def degerleme_gunleri():
    out = []
    for y, m in [(2024, 12), (2025, 3), (2025, 6), (2025, 9), (2025, 12), (2026, 3), (2026, 6), (2026, 9), (2026, 12)]:
        hedef = dt.date(y, m, 15)
        if hedef > GUNLER[-1] + dt.timedelta(days=1):
            out.append({'gun': GUNLER[-1], 'hedef': hedef, 'onizleme': True})
        else:
            out.append({'gun': son_islem(hedef), 'hedef': hedef, 'onizleme': False})
    return out


# ---------------------------------------------------------------- temettü
_tf = os.path.join(CACHE, 'temettu', 'temettu.json')
TEM = json.load(open(_tf)) if os.path.exists(_tf) else {'kap': {}, 'odeme': {}}   # temettu.py üretir


def stopaj_orani(k, gun):
    """Ödeme gününden önce yayımlanmış en son kâr payı kararındaki stopaj oranı (GYO'larda çoğunlukla %0)."""
    kap = [o for o in TEM['kap'].get(k, []) if o.get('stopaj') is not None and o.get('brutTL')
           and dt.datetime.strptime(o['yayim'], '%d.%m.%Y %H:%M:%S').date() <= gun]
    return (max(kap, key=lambda o: o['idx'])['stopaj'] / 100) if kap else 0.0


# ---------------------------------------------------------------- TÜFE katsayıları
def tufe_tablosu():
    """(FY sonu, dönem sonu) → katsayı. Kaynak: dönem raporundaki yeniden düzenlenmiş FY bilançosu / FY raporunun kendi bilançosu (şirketler medyanı)."""
    oran = defaultdict(list)
    for k, kay in KAT.items():
        for x in kay:
            if x['donemSonu'].month != 12 and x['ay'] == 12:
                continue   # Aralık dışı mali yıl (MRGYO) TÜFE zincirine girmez; zincirden türetilir
            r = rapor(x['idx'])
            ta_onceki, _ = kalem(r, 'TA', 1)
            fy = [y for y in kay if y['ay'] == 12 and y['nitelik'] == x['nitelik'] and y['donemSonu'] < x['donemSonu'] and y['donemSonu'].month == 12]
            if not fy or not ta_onceki:
                continue
            f = max(fy, key=lambda y: (y['donemSonu'], y['yayim']))
            if (x['donemSonu'] - f['donemSonu']).days > 366:
                continue
            ta_fy, _ = kalem(rapor(f['idx']), 'TA', 0)
            if ta_fy:
                oran[(f['donemSonu'], x['donemSonu'])].append(ta_onceki / ta_fy)
    out = {}
    for key, v in oran.items():
        m = statistics.median(v)
        yakin = [z for z in v if abs(z / m - 1) < 0.01]
        out[key] = {'k': m, 'n': len(v), 'uyumlu': len(yakin)}
    return out


TUFE = tufe_tablosu()


def tufe_seviye():
    """Ay sonu → endeks seviyesi (31.12.2023 = 1). Aralık→Aralık çiftleriyle yıllar zincirlenir, ara aylar aynı yılın Aralık bazından okunur."""
    L = {dt.date(2023, 12, 31): 1.0}
    for y in range(2024, 2027):
        a = dt.date(y - 1, 12, 31)
        for (f, s), x in TUFE.items():
            if f == a and x['n'] >= 5 and a in L:
                L[s] = L[a] * x['k']
    return L


TUFE_L = tufe_seviye()


def katsayi(fy_sonu, donem_sonu):
    """FY sonu TL'si → dönem sonu TL'si katsayısı."""
    if fy_sonu in TUFE_L and donem_sonu in TUFE_L:
        return TUFE_L[donem_sonu] / TUFE_L[fy_sonu]
    x = TUFE.get((fy_sonu, donem_sonu))
    return x['k'] if x and x['n'] >= 5 else None


# ---------------------------------------------------------------- faaliyet raporları
FA = json.load(open(os.path.join(CACHE, 'fa_gyo.json')))
FA_IDX = defaultdict(list)
for x in FA:
    for k in [s.strip() for s in (x['stockCodes'] or '').split(',')]:
        if k in UNVAN and x['ruleType'] in ('3 Aylık', '6 Aylık', '9 Aylık', 'Yıllık'):
            FA_IDX[k].append(x)


def faaliyet_raporu(k, fin):
    """Finansal raporla aynı yıl/dönem ve niteliğe ait faaliyet raporu bildirimi."""
    ay = {3: '3 Aylık', 6: '6 Aylık', 9: '9 Aylık', 12: 'Yıllık'}[fin['ay']]
    nit = 'Konsolide Olmayan' if fin['nitelik'] == 'Konsolide Olmayan' else 'Konsolide'
    c = [x for x in FA_IDX[k] if x['year'] == fin['yil'] and x['ruleType'] == ay and x['subject'].startswith('Faaliyet Raporu (')]
    ayni = [x for x in c if x['subject'] == f'Faaliyet Raporu ({nit})'] or c
    return max(ayni, key=lambda x: x['disclosureIndex']) if ayni else None


# ---------------------------------------------------------------- metin (PDF → txt)
METIN = os.path.join(CACHE, 'metin')


def metin(idx):
    f = os.path.join(METIN, f'{idx}.txt')
    return open(f, encoding='utf-8', errors='ignore').read() if os.path.exists(f) else None


def plan():
    """Tüm değerleme günleri için gereken rapor ve faaliyet raporlarının PDF listesini çıkarır."""
    gerek = {}
    for v in degerleme_gunleri():
        for k in UNVAN:
            s = secili(KAT.get(k, []), v['gun'])
            if not s:
                continue
            r = rapor(s['idx'])
            if r and r['ekler']:
                gerek[s['idx']] = r['ekler'][0]
            fa = faaliyet_raporu(k, s)
            if fa:
                gerek[f"fa{fa['disclosureIndex']}"] = fa['disclosureIndex']
    return gerek


# ---------------------------------------------------------------- karar hafızası (Kasım 2026)
HAFIZA = json.load(open(os.path.join(ROOT, 'public', 'data', 'hafiza-baslangic.json')))
KURALLAR = {k: v for k, v in HAFIZA.items() if v['oneri'].get('tip') in ('tamami', 'sifir')}
ORAN_NOV = {}   # Kasım 2026'da elle onaylı kira/hasılat oranı (tahmin için)
for k, v in HAFIZA.items():
    if v['oneri'].get('tip') == 'tutar' and v['oneri'].get('tutar') is not None:
        r = rapor(v.get('kaynakIdx')) if v.get('kaynakIdx') else None
        rev = kalem(r, 'REV')[0] if r else None
        if rev:
            ORAN_NOV[k] = min(1.0, v['oneri']['tutar'] * carpan(r) / rev) if carpan(r) == 1 else min(1.0, v['oneri']['tutar'] / (rev / carpan(r)))


def F(tur, metin, seviye='uyari'):
    """flag: tur ∈ dogrulanamadi | celiski | cikarim | tahmini | veri | teyit | piyasa ; seviye ∈ bilgi | uyari | kritik"""
    return {'tur': tur, 'metin': metin, 'seviye': seviye}


def kira_karari(k, s, r, REV):
    fl = []
    c = carpan(r)
    m = metin(s['idx'])
    fa = faaliyet_raporu(k, s)
    fam = metin(f"fa{fa['disclosureIndex']}") if fa else None
    res = K.dipnot(m, REV / c if REV else None) if m else {'tutar': None, 'durum': 'metin-yok', 'not': 'Dipnot PDF metni alınamadı', 'satirlar': [], 'yontem': '-'}
    fa_sat = K.faaliyet(fam) if fam else []
    kural = KURALLAR.get(k)
    kaynak = {'dipnot': {'durum': res['durum'], 'not': res['not'], 'yontem': res.get('yontem'), 'satirlar': [a['metin'] for a in res.get('satirlar', [])][:4], 'tutar': res['tutar'] * c if res['tutar'] is not None else None},
              'faaliyet': {'idx': fa['disclosureIndex'] if fa else None, 'url': f"https://www.kap.org.tr/tr/Bildirim/{fa['disclosureIndex']}" if fa else None,
                           'metin': bool(fam), 'satirlar': [x['metin'] for x in fa_sat][:5]}}
    fa_sayilar = [n for x in fa_sat for n in x['sayilar']]

    def fa_teyit(tutar_rapor_birimi):
        return any(K.eslesir(tutar_rapor_birimi, n) for n in fa_sayilar) if tutar_rapor_birimi else False

    kira, yontem = None, None
    if res['durum'] == 'bulundu':
        kira, yontem = res['tutar'] * c, 'Dipnot (iki okuma uyumlu)'
        if fa_teyit(res['tutar']):
            fl.append(F('teyit', 'Kira tutarı faaliyet raporunda da aynı', 'bilgi'))
        if kural and kural['oneri']['tip'] == 'sifir' and kira > 0:
            fl.append(F('celiski', f"Hafıza kuralı 'kira yok' diyor ama bu dönemin dipnotunda kira satırı var ({kira/1e6:,.1f} mn TL). Dipnot esas alındı."))
        if kural and kural['oneri']['tip'] == 'tamami' and REV and kira < 0.9 * REV:
            fl.append(F('celiski', f"Hafıza kuralı 'hasılatın tamamı kira' diyor ama dipnotta kira hasılatın %{kira/REV*100:.0f}'i. Dipnot esas alındı."))
    elif kural:
        tip = kural['oneri']['tip']
        kira = REV if tip == 'tamami' else 0.0
        yontem = f"Karar hafızası: {'hasılatın tamamı kira' if tip == 'tamami' else 'kira yok'} ({'onaylı' if kural['durum'] == 'onaylandi' else 'ONAY BEKLİYOR'})"
        if kural['durum'] != 'onaylandi':
            fl.append(F('cikarim', 'Hafıza kuralı henüz onaylanmadı: ' + kural['oneri'].get('not', '')[:160]))
        else:
            fl.append(F('cikarim', 'Kasım 2026 kararı geriye uygulandı: ' + kural['oneri'].get('not', '')[:160], 'bilgi'))
        if res['tutar'] and tip == 'sifir':
            fl.append(F('celiski', f"Kural 'kira yok' ama dipnotta kira olabilecek satır var ({res['tutar']*c/1e6:,.1f} mn TL, {res['durum']}). Kontrol edilmeli."))
        if fa_sat and tip == 'sifir' and any(x['sayilar'] for x in fa_sat):
            fl.append(F('celiski', "Kural 'kira yok' ama faaliyet raporunda kira geliri geçen sayısal satır var: " + fa_sat[0]['metin'][:120]))
    elif res['durum'] in ('tek', 'belirsiz'):
        kira = res['tutar'] * c
        if fa_teyit(res['tutar']):
            yontem = 'Dipnot (tek okuma) + faaliyet raporu teyidi'
            fl.append(F('teyit', 'Dipnot tek yöntemle okundu, faaliyet raporundaki tutarla aynı', 'bilgi'))
        else:
            yontem = 'Dipnot (tek okuma, teyitsiz)'
            fl.append(F('dogrulanamadi', f"Kira dipnottan tek yöntemle okundu ve faaliyet raporunda teyit edilemedi: {res['not']}"))
    else:
        if fa_sat and any(x['sayilar'] for x in fa_sat):
            fl.append(F('dogrulanamadi', 'Dipnotta kira satırı yok; faaliyet raporunda kira geçen sayısal satır var: ' + fa_sat[0]['metin'][:140]))
        if k in ORAN_NOV and REV:
            kira = ORAN_NOV[k] * REV
            yontem = f'Tahmini: Kasım 2026 onaylı kira/hasılat oranı (%{ORAN_NOV[k]*100:.1f}) bu dönemin hasılatına uygulandı'
            fl.append(F('tahmini', f"Kira dipnottan okunamadı ({res['not']}); Kasım 2026 oranıyla tahmin edildi"))
        else:
            kira, yontem = 0.0, 'Kira bulunamadı → 0'
            fl.append(F('dogrulanamadi', f"Kira geliri ne dipnotta ne hafızada bulundu ({res['not']}); 0 alındı"))
    kaynak['yontem'] = yontem
    return kira, kaynak, fl


# ---------------------------------------------------------------- temettü (son OGK kararı + avans)
def temettu(k, V):
    fl = []
    kap = TEM['kap'].get(k, [])
    od = TEM['odeme'].get(k, [])
    sinir = dt.datetime.combine(V, dt.time(23, 59))
    yayim = lambda o: dt.datetime.strptime(o['yayim'], '%d.%m.%Y %H:%M:%S')
    kararlar = [o for o in kap if not o['avans'] and o['gk'] and d(o['gk']) <= V and yayim(o) <= sinir and (o['brutTL'] is not None or o['dagitilmayacak'])]
    kalemler = []
    if not kararlar:
        # KAP'ta karar bulunamadı: İş Yatırım ödemeleri (son 12 ay) yedek olarak
        son = [x for x in od if V - dt.timedelta(days=365) < dt.date.fromisoformat(x['tarih']) <= V]
        top = sum(x['toplam'] for x in son)
        if top:
            fl.append(F('dogrulanamadi', 'KAP\'ta değerleme gününden önceki genel kurul kâr payı kararı bulunamadı; son 12 ayın ödemeleri (İş Yatırım) kullanıldı'))
        return top, [{'aciklama': f"Ödeme {x['tarih']} (İş Yatırım)", 'tutar': x['toplam']} for x in son], None, fl
    gk = max(d(o['gk']) for o in kararlar)
    if (V - gk).days > 455:
        fl.append(F('dogrulanamadi', f"KAP'ta son kâr payı kararı {gk:%d.%m.%Y} genel kuruluna ait (15 aydan eski); sonraki OGK'larda kâr payı bildirimi bulunamadı, temettü 0 alındı"))
        return 0.0, [{'aciklama': f'Son 15 ayda OGK kâr payı kararı yok (en son: {gk:%d.%m.%Y})', 'tutar': 0.0}], None, fl
    ayni = [o for o in kararlar if d(o['gk']) == gk]
    ayni.sort(key=lambda o: (o['gkKarari'], yayim(o)))
    o = ayni[-1]

    def sermaye(gun):
        s = P.get(k, {})
        oncesi = [g for g in s if g <= gun]
        g = max(oncesi) if oncesi else (min(s) if s else None)
        return s[g]['sermaye'] if g else None

    sm = sermaye(gk)
    brut = 0.0 if o['dagitilmayacak'] and not o['brutTL'] else (o['brutTL'] or 0.0)
    tutar = brut * (sm or 0)
    kalemler.append({'aciklama': f"OGK {gk:%d.%m.%Y}: 1 TL nominal başına brüt {brut:.4f} TL × sermaye {sm:,.0f}" if sm else f"OGK {gk:%d.%m.%Y}", 'tutar': tutar, 'url': o['url']})
    if not o['gkKarari']:
        fl.append(F('cikarim', f"Kâr payı tutarı yönetim kurulu önerisinden ({o['yayim'][:10]}) alındı; {gk:%d.%m.%Y} genel kurulunda aynen onaylandığı varsayıldı", 'bilgi'))
    if o['imtiyaz']:
        fl.append(F('dogrulanamadi', f"Pay gruplarına farklı kâr payı oranı var ({o['gruplar']}); toplam tutar işlem gören grubun oranıyla yaklaşık hesaplandı"))
    avans = [a for a in kap if a['avans'] and yayim(a) <= sinir and a['karar'] and d(a['karar']) > gk and a['brutTL']]
    for a in avans:
        t = a['brutTL'] * (sermaye(d(a['karar'])) or 0)
        tutar += t
        kalemler.append({'aciklama': f"Avans (YK kararı {a['karar']}): brüt {a['brutTL']:.4f} TL/pay", 'tutar': t, 'url': a['url']})
    # çapraz kontrol: İş Yatırım ödemeleri (bu OGK'dan sonraki 13 ay, sonraki OGK'ya kadar)
    sonraki = [d(x['gk']) for x in kap if x['gk'] and d(x['gk']) > gk]
    bit = min(sonraki) if sonraki else gk + dt.timedelta(days=400)
    sonraki_avans = [d(a['karar']) for a in kap if a['avans'] and a['karar'] and d(a['karar']) > gk]
    if sonraki_avans:
        bit = min(bit, min(sonraki_avans))   # avans ödemeleri bu karara ait değil
    odeme = sum(x['toplam'] for x in od if gk <= dt.date.fromisoformat(x['tarih']) < bit)
    ogk = kalemler[0]['tutar']   # karşılaştırma yalnız OGK kararı için (avanslar ayrı)
    if ogk and odeme and dt.date.today() > gk + dt.timedelta(days=60):
        if abs(odeme - ogk) > 0.03 * ogk:
            fl.append(F('celiski', f"KAP OGK kararından hesaplanan {ogk/1e6:,.1f} mn TL, İş Yatırım ödeme kayıtlarında (sonraki karara kadar) {odeme/1e6:,.1f} mn TL"))
        else:
            fl.append(F('teyit', 'Kâr payı tutarı İş Yatırım ödeme kayıtlarıyla tutarlı', 'bilgi'))
    elif ogk and not odeme and dt.date.today() > gk + dt.timedelta(days=120):
        fl.append(F('dogrulanamadi', 'KAP kararında kâr payı var ama İş Yatırım\'da ödeme kaydı yok'))
    return tutar, kalemler, gk, fl


# ---------------------------------------------------------------- tek değerleme
def px_gun(k, g):
    return P.get(k, {}).get(g)


def favok(r, kolon):
    parca, top = {}, 0.0
    for key in ('GP', 'MKT', 'GA', 'RD', 'DA'):
        v, ad = kalem(r, key, kolon)
        parca[key] = {'deger': v or 0.0, 'kalem': ad}
        top += v or 0.0
    return top, parca


def sirket(k, V):
    fl = []
    s_px = P.get(k, {})
    gunler = [g for g in s_px if g <= V]
    row = {'k': k, 'u': UNVAN[k], 'flags': fl, 'elenme': []}
    if len(gunler) < 10:
        row['elenme'].append('Değerleme günü itibarıyla 10 günden az işlem görmüş' if gunler else 'Değerleme gününde işlem görmüyor')
        return row
    if V not in s_px:
        row['elenme'].append('Değerleme günü işlem görmedi (pazar kapalı olabilir)')
        fl.append(F('veri', 'Değerleme gününde fiyat yok', 'uyari'))
        return row
    s = secili(KAT.get(k, []), V)
    if not s:
        row['elenme'].append('Değerleme günü itibarıyla KAP\'ta finansal rapor yok')
        return row
    r = rapor(s['idx'])
    c = carpan(r)
    g = {}
    for key in ('CA', 'CL', 'TA', 'TL', 'EQ', 'EL', 'REV', 'CASH', 'CFI', 'STB', 'CPLTB', 'LTB', 'OFL_C', 'OFL_N'):
        v, ad = kalem(r, key, 0)
        g[key] = {'deger': v, 'kalem': ad}
    for key in ('CA', 'CL', 'TA', 'TL', 'EQ', 'REV'):
        if g[key]['deger'] is None:
            fl.append(F('dogrulanamadi', f"{key} kalemi XBRL'de bulunamadı; 0 alındı", 'kritik' if key in ('TA', 'EQ') else 'uyari'))
            g[key]['deger'] = 0.0
    for key in ('CASH', 'CFI', 'STB', 'CPLTB', 'LTB', 'OFL_C', 'OFL_N'):
        g[key]['deger'] = g[key]['deger'] or 0.0
    # iç tutarlılık: Aktif = Pasif
    if g['EL']['deger'] and abs(g['EL']['deger'] - g['TA']['deger']) > 0.001 * g['TA']['deger']:
        fl.append(F('celiski', 'XBRL\'de toplam varlıklar ile toplam kaynaklar eşit değil', 'kritik'))
    # XBRL ↔ PDF çapraz kontrol: toplam varlık, hasılat ve özkaynak tutarları dipnotlu PDF'te de geçmeli
    m_pdf = metin(s['idx'])
    if m_pdf:
        eksik_pdf = []
        for key, ad in (('TA', 'toplam varlıklar'), ('REV', 'hasılat'), ('EQ', 'ana ortaklık özkaynakları')):
            v = g[key]['deger']
            if v:
                t1 = K.tr_bicim(v / c); t2 = t1.replace('.', ',')
                if t1 not in m_pdf and t2 not in m_pdf:
                    eksik_pdf.append(ad)
        if eksik_pdf:
            fl.append(F('dogrulanamadi', f"XBRL'deki {', '.join(eksik_pdf)} tutarı PDF metninde birebir bulunamadı (yuvarlama ya da farklı sunum olabilir)", 'bilgi'))
        else:
            fl.append(F('teyit', 'Toplam varlık, hasılat ve özkaynak XBRL ile PDF\'te aynı', 'bilgi'))
    elif m_pdf is not None:
        fl.append(F('dogrulanamadi', 'Dipnotlu PDF metne çevrilemedi (taranmış görüntü olabilir); kira ve XBRL teyidi yapılamadı'))
    # LTM FAVÖK
    ay = s['ay']
    fav_c, parca_c = favok(r, 0)
    ltm = {'donem': {'deger': fav_c, 'parca': parca_c}}
    if ay == 12:
        ltm['deger'], ltm['formul'] = fav_c, 'Yıllık rapor: FAVÖK (12 ay)'
    else:
        fav_o, parca_o = favok(r, 1)
        ltm['onceki'] = {'deger': fav_o, 'parca': parca_o}
        fy_adaylar = [x for x in KAT[k] if x['ay'] == 12 and x['donemSonu'] < s['donemSonu']]
        fy_sonu = max((x['donemSonu'] for x in fy_adaylar), default=None)
        fy = yillik(KAT[k], V, fy_sonu, s['nitelik']) if fy_sonu else None
        kf = katsayi(fy_sonu, s['donemSonu']) if fy else None
        if fy and kf:
            rf = rapor(fy['idx'])
            fav_f, parca_f = favok(rf, 0)
            if fy['nitelik'] != s['nitelik']:
                fl.append(F('veri', f"Yıllık rapor {fy['nitelik'].lower()}, dönem raporu {s['nitelik'].lower()}; LTM karışık nitelikle hesaplandı"))
            ltm['fy'] = {'deger': fav_f, 'parca': parca_f, 'idx': fy['idx'], 'url': f"https://www.kap.org.tr/tr/Bildirim/{fy['idx']}"}
            ltm['kf'] = kf
            ltm['deger'] = fav_c + fav_f * kf - fav_o
            ltm['formul'] = f'FAVÖK {ay} ay + FAVÖK yıllık × TÜFE katsayısı ({kf:.4f}) − FAVÖK önceki yıl {ay} ay'
        else:
            ltm['deger'] = fav_c * 12 / ay
            ltm['formul'] = f'FAVÖK {ay} ay × 12/{ay} (yıllık rapor ya da TÜFE katsayısı yok)'
            fl.append(F('dogrulanamadi', 'LTM FAVÖK için yıllık rapor/TÜFE katsayısı bulunamadı; dönem FAVÖK\'ü yıllıklandırıldı'))
    nd = g['STB']['deger'] + g['CPLTB']['deger'] + g['LTB']['deger'] + g['OFL_C']['deger'] + g['OFL_N']['deger'] - g['CASH']['deger'] - g['CFI']['deger']
    x = s_px[V]
    pd = x['pd']
    # piyasa değeri kontrolü: fiyat × sermaye
    if x['sermaye'] and abs(x['px'] * x['sermaye'] - pd) > 0.01 * pd:
        fl.append(F('celiski', f"İş Yatırım PD'si ({pd/1e6:,.0f} mn) fiyat × sermaye ({x['px']*x['sermaye']/1e6:,.0f} mn) ile tutmuyor (birden fazla pay grubu olabilir)", 'bilgi'))
    fd = pd + nd
    div, div_kalem, div_gk, div_fl = temettu(k, V)
    fl += div_fl
    kira, kira_kaynak, kira_fl = kira_karari(k, s, r, g['REV']['deger'])
    fl += kira_fl
    REV, TA = g['REV']['deger'], g['TA']['deger']
    o = {
        'cr': g['CA']['deger'] / g['CL']['deger'] if g['CL']['deger'] else None,
        'lev': g['TL']['deger'] / TA if TA else None,
        'fav': ltm['deger'] / fd if fd > 0 else None,
        'pddd': pd / g['EQ']['deger'] if g['EQ']['deger'] else None,
        'dy': div / pd * 100 if pd else None,
        'kg': kira / REV if REV else 0.0,
        'kv': kira * 12 / ay / TA if TA else 0.0,
    }
    if fd <= 0:
        fl.append(F('veri', 'Firma değeri ≤ 0 (net nakit piyasa değerinden büyük); FAVÖK/FD puanında en alta konuldu'))
    if g['EQ']['deger'] <= 0:
        fl.append(F('veri', 'Özkaynak negatif; PD/DD puanında en alta konuldu', 'kritik'))
        o['pddd'] = None
    if o['lev'] is not None and o['lev'] > KURAL['lev']:
        row['elenme'].append(f"Yükümlülük/Varlık %{o['lev']*100:.1f} > %85")
    if o['kg'] < KURAL['kg'] and o['kv'] < KURAL['kv']:
        row['elenme'].append(f"Kira/Hasılat %{o['kg']*100:.1f} < %15 ve Kira/Varlık %{o['kv']*100:.2f} < %2,5")
    # eşik yakınlığı: kira tespiti şüpheliyse ve eşiğe yakınsa sonucu değiştirebilir
    supheli = any(f['tur'] in ('dogrulanamadi', 'tahmini', 'celiski') for f in kira_fl)
    # kural "veya": sonucun değişmesi için iki oranın da eşik civarında/altında olması gerekir
    yakin_kg, yakin_kv = o['kg'] < 0.22, o['kv'] < 0.035
    if supheli and yakin_kg and yakin_kv and (o['kg'] > 0.10 or o['kv'] > 0.018):
        fl.append(F('dogrulanamadi', 'Kira tespiti teyitsiz ve oran eşiğe yakın: havuz kararı değişebilir', 'kritik'))
    row.update({
        'rapor': {'idx': s['idx'], 'url': f"https://www.kap.org.tr/tr/Bildirim/{s['idx']}", 'pdf': f"https://www.kap.org.tr/tr/api/file/download/{r['ekler'][0]}" if r['ekler'] else None,
                  'donemSonu': s['donemSonu'].isoformat(), 'ay': ay, 'nitelik': s['nitelik'], 'birim': r['birim'], 'yayim': s['yayim'].isoformat(sep=' ')},
        'g': {k2: v['deger'] for k2, v in g.items()}, 'kalemAd': {k2: v['kalem'] for k2, v in g.items()},
        'ltm': ltm, 'nd': nd, 'pd': pd, 'px': x['px'], 'fd': fd, 'hao': x['hao'],
        'div': div, 'divKalem': div_kalem, 'divGk': div_gk.isoformat() if div_gk else None,
        'kira': kira, 'kiraKaynak': kira_kaynak, 'o': o,
    })
    return row


def puanla(rows):
    havuz = [r for r in rows if not r['elenme']]
    N = len(havuz)
    for key, w in KURAL['agirlik'].items():
        kucuk = KURAL['yon'][key] == 'k'
        ok = [r for r in havuz if r['o'][key] is not None]
        yok = [r for r in havuz if r['o'][key] is None]
        ok.sort(key=lambda r: r['o'][key], reverse=not kucuk)
        sira_l = ok + yok
        i = 0
        while i < len(sira_l):
            j = i
            v = sira_l[i]['o'][key]
            while j + 1 < len(sira_l) and sira_l[j + 1]['o'][key] == v:
                j += 1
            sira = (i + j) / 2 + 1
            for t in range(i, j + 1):
                sira_l[t].setdefault('p', {})[key] = (N - sira) / (N - 1) * 100 if N > 1 else 100
            i = j + 1
    for r in havuz:
        r['puan'] = sum(r['p'][k] * w / 100 for k, w in KURAL['agirlik'].items())
    havuz.sort(key=lambda r: (-r['puan'], -r['pd']))
    for i, r in enumerate(havuz, 1):
        r['sira'] = i
        r['durum'] = 'Endeks' if i <= KURAL['n'] else 'Yedek' if i <= KURAL['n'] + KURAL['yedek'] else 'Havuzda'
    # eşit puan uyarısı
    for a, b in zip(havuz, havuz[1:]):
        if abs(a['puan'] - b['puan']) < 1e-9:
            for r in (a, b):
                r['flags'].append(F('veri', f"{a['k']} ve {b['k']} toplam puanı eşit; kural setindeki eşitlik kuralı boş, PD'si büyük olan üste alındı", 'bilgi'))
    for r in rows:
        if r['elenme']:
            r['durum'], r['sira'], r['puan'] = 'Elendi', None, None
    # sınırdaki kararları işaretle: 15/16 ve 17/18 sınırına yakın + teyitsiz veri
    for r in havuz:
        if r['sira'] in (14, 15, 16, 17, 18) and any(f['tur'] in ('dogrulanamadi', 'tahmini', 'celiski') and f['seviye'] != 'bilgi' for f in r['flags']):
            r['flags'].append(F('dogrulanamadi', f"Sırası ({r['sira']}) endeks/yedek sınırında ve verisinde teyitsiz kalem var: seçim sonucu değişebilir", 'kritik'))
    return rows


# ---------------------------------------------------------------- ağırlıklar (kural 6.2: FDP PD, %3 taban, %13 tavan)
def agirlik(hao):
    """hao: kod → fiili dolaşımdaki PD. Önce %3 altı %3'e çıkarılır, sonra %13 üstü %13'e indirilir ve fazlası
    kalanlara oranla dağıtılır; %13 üstü kalmayana kadar tekrarlanır."""
    top = sum(hao.values())
    w = {k: v / top for k, v in hao.items()}
    sabit = {}
    for k in w:
        if w[k] < KURAL['wmin']:
            sabit[k] = KURAL['wmin']
    for _ in range(100):
        serbest = {k: hao[k] for k in w if k not in sabit}
        kalan = 1 - sum(sabit.values())
        ts = sum(serbest.values())
        w = {**sabit, **{k: kalan * v / ts for k, v in serbest.items()}}
        ust = [k for k, v in w.items() if v > KURAL['wmax'] + 1e-12 and k not in sabit]
        if not ust:
            break
        for k in ust:
            sabit[k] = KURAL['wmax']
    return w


# ---------------------------------------------------------------- endeks
def endeks(degerlemeler):
    seri, olaylar, donemler = [], [], []
    I_tl = I_usd = BAZ
    tem_od = TEM['odeme']
    for n, v in enumerate(degerlemeler):
        if v['onizleme']:
            continue
        ceyrek_sonu = dt.date(v['hedef'].year, v['hedef'].month, 1) + dt.timedelta(days=32)
        ceyrek_sonu = dt.date(ceyrek_sonu.year, ceyrek_sonu.month, 1) - dt.timedelta(days=1)
        agirlik_gunu = max(g for g in GUNLER if g <= ceyrek_sonu)
        sonraki = degerlemeler[n + 1]['hedef'] if n + 1 < len(degerlemeler) else None
        bitis_siniri = (dt.date(sonraki.year, sonraki.month, 1) + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1) if sonraki else GUNLER[-1]
        gunler = [g for g in GUNLER if agirlik_gunu < g <= bitis_siniri]
        if not gunler:
            continue
        uye = [r['k'] for r in sorted([r for r in v['satirlar'] if r['durum'] == 'Endeks'], key=lambda r: r['sira'])]
        yedek = [r['k'] for r in sorted([r for r in v['satirlar'] if r['durum'] == 'Yedek'], key=lambda r: r['sira'])]
        if not donemler:
            seri.append({'t': agirlik_gunu.isoformat(), 'tl': BAZ, 'usd': BAZ, 'xu100': BAZ})
            xu0 = XU[agirlik_gunu]
        hao = {}
        for k in uye:
            x = px_gun(k, agirlik_gunu)
            if not x or not x['hao']:
                olaylar.append({'t': agirlik_gunu.isoformat(), 'k': k, 'tur': 'veri', 'seviye': 'uyari', 'metin': f'{k}: dönem başı ağırlık günü fiili dolaşım PD verisi yok; PD kullanıldı'})
                x = x or {}
            hao[k] = (x.get('hao') or x.get('pd') or 0) or 1.0
        w = agirlik(hao)
        d0 = {'degerleme': v['gun'].isoformat(), 'agirlikGunu': agirlik_gunu.isoformat(), 'bas': gunler[0].isoformat(), 'son': gunler[-1].isoformat(),
              'uyeler': [{'k': k, 'w': w[k], 'hao': hao[k]} for k in uye], 'yedek': list(yedek), 'giren': [], 'cikan': []}
        if donemler:
            onceki = {u['k'] for u in donemler[-1]['uyeler']}
            d0['giren'] = [k for k in uye if k not in onceki]
            d0['cikan'] = sorted(onceki - set(uye))
            if d0['giren'] or d0['cikan']:
                olaylar.append({'t': gunler[0].isoformat(), 'k': None, 'tur': 'donem', 'seviye': 'bilgi',
                                'metin': f"Dönem değişikliği: giren {', '.join(d0['giren']) or '—'}; çıkan {', '.join(d0['cikan']) or '—'}"})
        eksik = defaultdict(int)
        cikarilan = set()
        onceki_g = agirlik_gunu
        for g in gunler:
            R = 0.0
            yeni_w = {}
            for k, wk in w.items():
                a, b = px_gun(k, onceki_g), px_gun(k, g)
                if a and b and a['adj'] and b['adj']:
                    r = b['adj'] / a['adj'] - 1
                    # temettü günü: toplam getiri = (kapanış + net temettü) / önceki kapanış − 1  (ham fiyatla)
                    for dv in tem_od.get(k, []):
                        if dv['tarih'] == g.isoformat() and a['px']:
                            try:
                                hb = float(str(dv['hb']).replace(',', '.'))
                            except ValueError:
                                hb = 0
                            faktor = (a['px'] / a['adj']) / (b['px'] / b['adj'])     # aynı gün bedelsiz/bedelli varsa
                            if abs(faktor - 1) < 0.002 + hb / a['px'] * 1.2:
                                r = (b['px'] + hb * (1 - stopaj_orani(k, g))) / a['px'] - 1
                            else:
                                olaylar.append({'t': g.isoformat(), 'k': k, 'tur': 'veri', 'seviye': 'uyari', 'metin': f'{k}: temettü ve sermaye işlemi aynı gün; getiri İş Yatırım düzeltilmiş fiyatından alındı (brüt temettü varsayımı)'})
                    eksik[k] = 0
                else:
                    r = 0.0
                    eksik[k] += 1
                    olaylar.append({'t': g.isoformat(), 'k': k, 'tur': 'islem-yok', 'seviye': 'uyari', 'metin': f'{k} bu gün işlem görmedi (fiyat yok); getirisi 0 alındı'})
                R += wk * r
                yeni_w[k] = wk * (1 + r)
            I_tl *= 1 + R
            I_usd *= (1 + R) * (USD[onceki_g] / USD[g]) if USD.get(g) and USD.get(onceki_g) else 1 + R
            t = sum(yeni_w.values())
            w = {k: x / t for k, x in yeni_w.items()}
            seri.append({'t': g.isoformat(), 'tl': I_tl, 'usd': I_usd, 'xu100': XU[g] / xu0 * BAZ if XU.get(g) else None})
            # >5 işlem günü kapalı → çıkar, yedekten al
            for k in [k for k, c in eksik.items() if c > 5 and k in w]:
                yerine = next((y for y in yedek if y not in w and px_gun(y, g)), None)
                cikarilan.add(k)
                w.pop(k)
                metin = f'{k} 5 işlem gününden fazla işlem görmedi; endeksten çıkarıldı' + (f', yerine yedek {yerine} alındı' if yerine else ', yedek bulunamadı')
                olaylar.append({'t': g.isoformat(), 'k': k, 'tur': 'kapsam', 'seviye': 'kritik', 'metin': metin})
                if yerine:
                    yedek.remove(yerine)
                hao2 = {kk: (px_gun(kk, g) or {}).get('hao') or 1.0 for kk in list(w) + ([yerine] if yerine else [])}
                w = agirlik(hao2)
            # %30 ağırlık eşiği
            if max(w.values()) > KURAL['esik']:
                kk = max(w, key=w.get)
                olaylar.append({'t': g.isoformat(), 'k': kk, 'tur': 'esik', 'seviye': 'uyari', 'metin': f'{kk} ağırlığı %{w[kk]*100:.1f} ile %30 eşiğini aştı; ağırlıklar yeniden sınırlandırıldı'})
                w = agirlik({k: (px_gun(k, g) or {}).get('hao') or 1.0 for k in w})
            onceki_g = g
        d0['bitisAgirlik'] = w
        d0['getiriTL'] = None
        donemler.append(d0)
    # dönem getirileri
    idx = {s['t']: s for s in seri}
    for d0 in donemler:
        a = idx.get(d0['agirlikGunu']); b = idx.get(d0['son'])
        if a and b:
            d0['getiriTL'] = b['tl'] / a['tl'] - 1
            d0['getiriUSD'] = b['usd'] / a['usd'] - 1
            d0['getiriXU100'] = b['xu100'] / a['xu100'] - 1 if a['xu100'] and b['xu100'] else None
    # aynı olayın her gün tekrarını sıkıştır
    sikis, son = [], {}
    for o in olaylar:
        key = (o['k'], o['tur'])
        if o['tur'] == 'islem-yok' and key in son and (dt.date.fromisoformat(o['t']) - dt.date.fromisoformat(son[key]['bit'])).days <= 7:
            son[key]['bit'] = o['t']; son[key]['gun'] += 1
            continue
        o = dict(o); o['bit'] = o['t']; o['gun'] = 1
        son[key] = o
        sikis.append(o)
    for o in sikis:
        if o['tur'] == 'islem-yok' and o['gun'] > 1:
            o['metin'] = f"{o['k']} {o['gun']} işlem günü fiyatsız ({o['t']} – {o['bit']}); getirisi 0 alındı"
    return seri, sikis, donemler


# ---------------------------------------------------------------- ana
def main():
    degerlemeler = degerleme_gunleri()
    for v in degerlemeler:
        rows = [sirket(k, v['gun']) for k in UNVAN]
        v['satirlar'] = puanla(rows)
        print(v['gun'], 'havuz', sum(1 for r in rows if not r['elenme']), 'endeks', [r['k'] for r in sorted([r for r in rows if r.get('durum') == 'Endeks'], key=lambda r: r['sira'])], flush=True)
    seri, olaylar, donemler = endeks(degerlemeler)
    # dönem tablosundaki flagleri olay olarak da göster (endeks/yedek üyelerinin kritik flagleri)
    for v, d0 in zip([x for x in degerlemeler if not x['onizleme']], donemler):
        for r in v['satirlar']:
            if r.get('durum') in ('Endeks', 'Yedek'):
                for f in r['flags']:
                    if f['seviye'] == 'kritik':
                        olaylar.append({'t': d0['bas'], 'bit': d0['bas'], 'gun': 1, 'k': r['k'], 'tur': 'secim', 'seviye': 'kritik', 'metin': f"{v['gun']:%d.%m.%Y} seçimi — {r['k']}: {f['metin']}"})
    out = {
        'olusturma': dt.datetime.now().isoformat(timespec='minutes'), 'baz': {'tarih': seri[0]['t'], 'deger': BAZ},
        'kural': KURAL, 'tufe': {k.isoformat(): v for k, v in TUFE_L.items()},
        'degerlemeler': [{'gun': v['gun'].isoformat(), 'hedef': v['hedef'].isoformat(), 'onizleme': v['onizleme'], 'satirlar': v['satirlar']} for v in degerlemeler],
        'donemler': donemler, 'seri': seri, 'olaylar': sorted(olaylar, key=lambda o: o['t']),
    }
    json.dump(out, open(os.path.join(ROOT, 'public', 'data', 'tarihsel.json'), 'w'), ensure_ascii=False, default=str, separators=(',', ':'))
    print('yazıldı', len(seri), 'gün', len(olaylar), 'olay')


if __name__ == '__main__':
    main()
