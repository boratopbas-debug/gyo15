"""GYO veri tablosu: evrendeki şirketlerin en son finansal raporundan toplam varlıklar, hasılat, kira geliri ve FAVÖK.
Hasılat, kira ve FAVÖK hem rapor dönemi (ör. 9 ay) hem son 12 ay (LTM) olarak verilir:
    LTM = cari dönem + son yıllık rapor × TÜFE katsayısı − önceki yılın aynı dönemi (cari raporda yeniden düzenlenmiş sütun)
Kira geliri dipnottan (hasılat tablosu, iki sütun) okunur, faaliyet raporunda teyit aranır; dipnotta kira satırı yoksa
karar hafızasındaki yorum ya da oran tahmini kullanılır ve flag'lenir.
Çıktı: public/data/veri.json, public/data/OSG15_GYO_Veri.xlsx
Kullanım: python3 scripts/tarihsel/veri.py [indir]   ('indir' önce gereken PDF'leri çeker)"""
import json, os, sys, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build as B
import kira as K
from ortak import ROOT, rapor, kalem, carpan, secili, yillik

BUGUN = dt.date.today()
F = B.F
HAFIZA = B.HAFIZA
ELLE = {k: v for k, v in json.load(open(os.path.join(ROOT, 'data', 'kira-elle.json'))).items() if not k.startswith('_')}


def kap(idx):
    return f'https://www.kap.org.tr/tr/Bildirim/{idx}' if idx else None


def raporlar(k):
    """Son rapor, son yıllık rapor (aynı nitelik tercihli), önceki yılın aynı dönem raporu."""
    kay = B.KAT.get(k, [])
    s = secili(kay, BUGUN)
    if not s:
        return None, None, None
    fy = None
    if s['ay'] != 12:
        fy_sonu = max((x['donemSonu'] for x in kay if x['ay'] == 12 and x['donemSonu'] < s['donemSonu']), default=None)
        fy = yillik(kay, BUGUN, fy_sonu, s['nitelik']) if fy_sonu else None
    once_sonu = s['donemSonu'].replace(year=s['donemSonu'].year - 1)
    ob = [x for x in kay if x['donemSonu'] == once_sonu and x['ay'] == s['ay']]
    ob_ayni = [x for x in ob if x['nitelik'] == s['nitelik']] or ob
    ob = max(ob_ayni, key=lambda x: x['yayim']) if ob_ayni else None
    return s, fy, ob


def plan():
    """İndirilecek dipnot ve faaliyet raporu PDF'leri."""
    gerek = {}
    for k in B.UNVAN:
        for x in raporlar(k):
            if not x:
                continue
            r = rapor(x['idx'])
            if r and r['ekler']:
                gerek[x['idx']] = r['ekler'][0]
            fa = B.faaliyet_raporu(k, x)
            if fa:
                gerek[f"fa{fa['disclosureIndex']}"] = fa['disclosureIndex']
    return gerek


def fa_bilgi(k, x):
    fa = B.faaliyet_raporu(k, x) if x else None
    m = B.metin(f"fa{fa['disclosureIndex']}") if fa else None
    sat = K.faaliyet(m) if m else []
    return fa, m, sat


def fa_teyit(sat, tutar_rb):
    return bool(tutar_rb) and any(K.eslesir(tutar_rb, n) for x in sat for n in x['sayilar'])


def yaklasik(a, b, tol=0.005):
    return a is not None and b is not None and abs(a - b) <= tol * max(abs(a), abs(b), 1)


def sirket(k):
    fl = []
    s, fy, ob = raporlar(k)
    row = {'k': k, 'u': B.UNVAN[k], 'flags': fl}
    if not s:
        fl.append(F('dogrulanamadi', "KAP'ta finansal rapor bulunamadı", 'kritik'))
        return row
    r = rapor(s['idx']); c = carpan(r); ay = s['ay']
    TA, _ = kalem(r, 'TA', 0)
    REV_c, _ = kalem(r, 'REV', 0)
    REV_o, _ = kalem(r, 'REV', 1)
    fav_c, _ = B.favok(r, 0)
    fav_o, _ = B.favok(r, 1)
    if TA is None:
        fl.append(F('dogrulanamadi', "Toplam varlıklar XBRL'de bulunamadı", 'kritik'))
    if REV_c is None:
        fl.append(F('dogrulanamadi', "Hasılat XBRL'de bulunamadı; 0 alındı"))
        REV_c = 0.0
    REV_o = REV_o or 0.0
    # XBRL ↔ PDF teyidi
    m = B.metin(s['idx'])
    if m:
        eksik = [ad for v, ad in ((TA, 'toplam varlıklar'), (REV_c, 'hasılat')) if v and K.tr_bicim(v / c) not in m and K.tr_bicim(v / c).replace('.', ',') not in m]
        fl.append(F('dogrulanamadi', f"XBRL'deki {', '.join(eksik)} tutarı dipnotlu PDF'te birebir bulunamadı", 'bilgi') if eksik
                  else F('teyit', "Toplam varlıklar ve hasılat XBRL ile dipnotlu PDF'te aynı", 'bilgi'))
    else:
        fl.append(F('dogrulanamadi', 'Dipnotlu PDF metne çevrilemedi (taranmış olabilir); PDF teyidi ve dipnottan kira okuma yapılamadı'))

    # yıllık rapor ve TÜFE katsayısı
    kf = rf = cf = None
    REV_f = fav_f = None
    if ay != 12:
        if fy:
            kf = B.katsayi(fy['donemSonu'], s['donemSonu'])
            rf = rapor(fy['idx']); cf = carpan(rf)
            REV_f, _ = kalem(rf, 'REV', 0)
            REV_f = REV_f or 0.0
            fav_f, _ = B.favok(rf, 0)
            if fy['nitelik'] != s['nitelik']:
                fl.append(F('veri', f"Yıllık rapor {fy['nitelik'].lower()}, dönem raporu {s['nitelik'].lower()}; 12 ay karışık nitelikle hesaplandı"))
        if fy and not kf:
            fl.append(F('dogrulanamadi', "TÜFE katsayısı bulunamadı; 12 aylık değerler dönem × 12/" + str(ay) + " ile yıllıklandırıldı", 'uyari'))

    # ------------------------------------------------ kira
    # Her dönem için (tutar, tespit, kaynak). tespit: Doğrudan | Yorum | Tahmini
    h = HAFIZA.get(k)
    tip = h['oneri'].get('tip') if h else None
    cikarim = bool(h and (h['oneri'].get('cikarim') or h['durum'] != 'onaylandi'))
    oku = K.iki_sutun(m, REV_c / c, REV_o / c) if m else {'cari': None, 'onceki': None, 'satirlar': [], 'durum': 'yok', 'not': 'Dipnot metni yok'}
    tek = K.dipnot(m, REV_c / c) if m else {'tutar': None, 'durum': 'yok', 'not': 'Dipnot metni yok', 'satirlar': []}
    fa_c, fa_cm, fa_csat = fa_bilgi(k, s)
    dip_c = oku['cari'] * c if oku['cari'] is not None else (tek['tutar'] * c if tek['tutar'] is not None else None)
    dip_o = oku['onceki'] * c if oku['onceki'] is not None else None
    kural_not = h['oneri'].get('not', '') if h else ''
    KC = KO = KF = None   # (tutar, tespit, kaynak)

    # dönem
    if tip in ('tamami', 'sifir'):
        t = 'Yorum' if cikarim else 'Doğrudan'
        KC = (REV_c if tip == 'tamami' else 0.0, t, ('Hasılatın tamamı kira' if tip == 'tamami' else 'Kira yok') + f' (karar hafızası): {kural_not}')
        if tip == 'sifir' and dip_c:
            fl.append(F('celiski', f"Hafıza 'kira yok' diyor ama dipnotta kira olabilecek satır var ({dip_c/1e6:,.1f} mn TL)"))
    elif h and tip == 'tutar' and h.get('kaynakIdx') == s['idx']:
        tt = float(h['oneri']['tutar'])
        KC = (tt, 'Yorum' if cikarim else 'Doğrudan', f'Karar hafızası ({"onaylı" if h["durum"] == "onaylandi" else "onay bekliyor"}): {kural_not}')
        if dip_c is not None and yaklasik(dip_c, tt) and dip_o is not None:
            KO = (dip_o, KC[1], 'Son raporun hasılat dipnotu, önceki yıl sütunu')
    elif dip_c is not None:
        dur = oku['durum'] if oku['cari'] is not None else tek['durum']
        KC = (dip_c, 'Doğrudan' if dur == 'bulundu' else 'Yorum', 'Dipnot (otomatik okuma): ' + (oku['not'] if oku['cari'] is not None else tek['not']))
        if dip_o is not None:
            KO = (dip_o, KC[1], 'Son raporun hasılat dipnotu, önceki yıl sütunu')
    else:
        KC = (0.0, 'Tahmini', f"Kira satırı bulunamadı → 0 ({oku['not']})")

    # yıllık rapor
    if ay != 12 and fy:
        mf = B.metin(fy['idx'])
        if tip in ('tamami', 'sifir'):
            KF = (REV_f if tip == 'tamami' else 0.0, KC[1], 'Karar hafızası kuralı yıllık hasılata uygulandı')
        elif mf and REV_f:
            REV_fo, _ = kalem(rf, 'REV', 1)
            fo = K.iki_sutun(mf, REV_f / cf, (REV_fo or 0) / cf)
            ft = K.dipnot(mf, REV_f / cf)
            v = fo['cari'] if fo['cari'] is not None else ft['tutar']
            if v is not None:
                KF = (v * cf, 'Doğrudan' if (fo['durum'] if fo['cari'] is not None else ft['durum']) == 'bulundu' else 'Yorum', 'Yıllık raporun hasılat dipnotu (otomatik okuma)')
        elif not mf:
            fl.append(F('dogrulanamadi', "Yıllık raporun dipnotlu PDF'i metne çevrilemedi (taranmış olabilir)", 'bilgi'))

    # önceki yıl aynı dönem
    kb = None
    if ob and ob['donemSonu'] in B.TUFE_L and s['donemSonu'] in B.TUFE_L:
        kb = B.TUFE_L[s['donemSonu']] / B.TUFE_L[ob['donemSonu']]
    if ay != 12 and KO is None:
        if tip in ('tamami', 'sifir'):
            KO = (REV_o if tip == 'tamami' else 0.0, KC[1], 'Karar hafızası kuralı önceki yıl hasılatına uygulandı')
        elif ob and kb and B.metin(ob['idx']):
            rb = rapor(ob['idx']); cb = carpan(rb); mb = B.metin(ob['idx'])
            rev_b, _ = kalem(rb, 'REV', 0)
            if rev_b:
                o1 = K.iki_sutun(mb, rev_b / cb, None)
                v = o1['cari'] if o1['cari'] is not None else K.dipnot(mb, rev_b / cb)['tutar']
                if v is not None:
                    KO = (v * cb * kb, 'Doğrudan', f'Önceki yılın {ay} aylık raporunun dipnotu × TÜFE ({kb:.4f})')

    # elle kontrol edilmiş tutarlar
    el = ELLE.get(k, {})
    TES = {'dogrudan': 'Doğrudan', 'yorum': 'Yorum', 'tahmini': 'Tahmini'}
    for per in ('donem', 'yillik'):
        e = el.get(per)
        if e:
            val = (float(e['tutar']), TES[e['tespit']], 'Elle kontrol: ' + e['kaynak'])
            if per == 'donem':
                KC = val
            else:
                KF = val
    e = el.get('onceki')
    if e:
        if 'tutar' in e:
            KO = (float(e['tutar']), TES[e['tespit']], 'Elle kontrol: ' + e['kaynak'])
        elif 'tutar_eski' in e and kb:
            KO = (float(e['tutar_eski']) * kb, TES[e['tespit']], f"Elle kontrol: {e['kaynak']} ({kb:.4f})")
        elif e.get('formul') == 'yillik_orantili' and KF and kf:
            KO = (KF[0] * kf * ay / 12, TES[e['tespit']], 'Elle kontrol: ' + e['kaynak'])
        elif e.get('formul') == 'donem_ile_ayni':
            KO = (KC[0], TES[e['tespit']], 'Elle kontrol: ' + e['kaynak'])
        elif e.get('formul') == 'oran_yillik' and KF and REV_f:
            KO = (REV_o * KF[0] / REV_f, TES[e['tespit']], 'Elle kontrol: ' + e['kaynak'] + f' (%{KF[0]/REV_f*100:.1f})')

    # eksikler: oranla tahmin
    oran = KC[0] / REV_c if REV_c else 0.0
    if ay != 12 and fy and KF is None:
        KF = (oran * REV_f, 'Tahmini', f'Dönem kira/hasılat oranı (%{oran*100:.1f}) × yıllık hasılat')
    if ay != 12 and KO is None:
        KO = (oran * REV_o, 'Tahmini', f'Dönem kira/hasılat oranı (%{oran*100:.1f}) × önceki yıl hasılatı')
    kc, ko, kfy = KC[0], (KO[0] if KO else None), (KF[0] if KF else None)

    # faaliyet raporu teyidi
    fa_c_ok = bool(kc) and fa_teyit(fa_csat, kc / c)
    if fa_c_ok:
        fl.append(F('teyit', 'Dönem kira tutarı faaliyet raporunda da geçiyor', 'bilgi'))
    fa_f_ok = False
    if KF and fy:
        _, _, fa_fsat = fa_bilgi(k, fy)
        fa_f_ok = bool(kfy) and fa_teyit(fa_fsat, kfy / cf)
    # flag'ler
    adlar = {'donem': f'{ay} aylık dönem', 'yillik': 'yıllık rapor', 'onceki': f'önceki yıl {ay} ay'}
    for per, X in (('donem', KC), ('yillik', KF), ('onceki', KO)):
        if not X or X[1] == 'Doğrudan':
            continue
        if per != 'donem' and X[1] == KC[1] and 'Karar hafızası kuralı' in X[2]:
            continue   # dönemle aynı kural, ayrıca flag'lemeye gerek yok
        fl.append(F('tahmini' if X[1] == 'Tahmini' else 'cikarim', f"Kira ({adlar[per]}) {X[1].lower()}: {X[2]}"[:300],
                    'uyari'))
    if kc and REV_c and kc > REV_c * 1.001:
        fl.append(F('celiski', 'Dönem kira geliri hasılattan büyük' + (' (yatırım amaçlı gayrimenkul dipnotu brüt, hasılat iadelerle net)' if k == 'DZGYO' else ''), 'bilgi' if k == 'DZGYO' else 'uyari'))
    if ay != 12 and kfy is not None and kf and ko is not None and kfy * kf - ko < -0.02 * max(kc, 1):
        fl.append(F('celiski', f"Yıllık kira × TÜFE ({kfy*kf/1e6:,.1f} mn) önceki yılın {ay} aylık kirasından ({ko/1e6:,.1f} mn) küçük: son çeyrek negatif çıkıyor; raporlar arasında sınıflama/kapsam farkı olabilir"))
    if ay != 12 and REV_f is not None and kf and REV_f * kf - REV_o < -0.02 * max(REV_c, 1):
        fl.append(F('celiski', f"Yıllık hasılat × TÜFE önceki yılın {ay} aylık hasılatından küçük; son çeyrek hasılatı negatif çıkıyor (yeniden düzenleme/durdurulan faaliyet olabilir)", 'bilgi'))
    if ay != 12 and not fy:
        fl.append(F('tahmini', "KAP'ta 2025 yıllık raporu yok (şirketin KAP'taki ilk finansal raporu 2026'ya ait); 12 aylık hasılat, kira ve FAVÖK dönem × 12/" + str(ay) + " ile yıllıklandırıldı", 'uyari'))
    if el.get('not'):
        fl.append(F('veri', el['not'].strip(), 'bilgi'))
    if s['donemSonu'] < max(x['donemSonu'] for v in B.KAT.values() for x in v):
        fl.append(F('veri', f"Son yayımlanan rapor {s['donemSonu']:%d.%m.%Y} dönemine ait; daha yeni dönem raporu henüz KAP'ta yok", 'uyari'))

    # ------------------------------------------------ 12 ay
    def ltm(cari, yil, once):
        if ay == 12:
            return cari, 'Yıllık rapor (12 ay)'
        if yil is not None and kf:
            return cari + yil * kf - (once or 0.0), f'{ay} ay + yıllık × {kf:.4f} − önceki yıl {ay} ay'
        return cari * 12 / ay, f'{ay} ay × 12/{ay}'

    REV_l, formul = ltm(REV_c, REV_f, REV_o)
    fav_l, _ = ltm(fav_c, fav_f, fav_o)
    kira_l, _ = ltm(kc, kfy, ko)
    kira_ltm_formul = None
    if el.get('ltm', {}).get('formul') == 'yilliklandir':
        kira_l, kira_ltm_formul = kc * 12 / ay, 'yilliklandir'
        fl.append(F('tahmini', '12 aylık kira yıllıklandırıldı: ' + el['ltm']['kaynak'], 'uyari'))
    if kira_l is not None and kira_l < 0:
        fl.append(F('celiski', f'12 aylık kira negatif çıktı ({kira_l/1e6:,.1f} mn TL); önceki yıl tutarı kontrol edilmeli', 'kritik'))
    if kira_l and REV_l and kira_l > REV_l * 1.01:
        fl.append(F('celiski', '12 aylık kira 12 aylık hasılattan büyük çıktı', 'uyari'))
    bilesen = [X[1] for X in (KF, KO) if X]
    kira_12 = 'Doğrudan' if all(b_ == 'Doğrudan' for b_ in bilesen + [KC[1]]) else ('Tahmini' if 'Tahmini' in bilesen + [KC[1]] else 'Yorum')
    if (ay != 12 and not fy) or kira_ltm_formul:
        kira_12 = 'Tahmini'
    row.update({
        'donemSonu': s['donemSonu'].isoformat(), 'ay': ay, 'nitelik': s['nitelik'], 'birim': r['birim'],
        'rapor': {'idx': s['idx'], 'url': kap(s['idx']), 'yayim': s['yayim'].isoformat(sep=' ')},
        'yillik': {'idx': fy['idx'], 'url': kap(fy['idx']), 'donemSonu': fy['donemSonu'].isoformat()} if fy else None,
        'onceki': {'idx': ob['idx'], 'url': kap(ob['idx'])} if ob else None,
        'faaliyet': {'idx': fa_c['disclosureIndex'], 'url': kap(fa_c['disclosureIndex'])} if fa_c else None,
        'kf': kf, 'formul': formul,
        'TA': TA,
        'hasilat': {'donem': REV_c, 'yillik': REV_f, 'onceki': REV_o, 'ltm': REV_l},
        'kira': {'donem': kc, 'yillik': kfy, 'onceki': ko, 'ltm': kira_l, 'ltmFormul': kira_ltm_formul, 'tespit': KC[1], 'tespit12': kira_12, 'not': KC[2],
                 'donemKaynak': KC[2], 'oncekiKaynak': KO[2] if KO else None, 'yillikKaynak': KF[2] if KF else None,
                 'oncekiTespit': KO[1] if KO else None, 'yillikTespit': KF[1] if KF else None,
                 'dipnotSatir': [a['metin'] for a in oku.get('satirlar', [])][:4] or [a['metin'] for a in tek.get('satirlar', [])][:4],
                 'faaliyetSatir': [x['metin'] for x in fa_csat][:4], 'faaliyetTeyit': fa_c_ok, 'yillikFaaliyetTeyit': fa_f_ok},
        'favok': {'donem': fav_c, 'yillik': fav_f, 'onceki': fav_o, 'ltm': fav_l},
        'oran': {'kg': kira_l / REV_l if REV_l else None, 'kv': kira_l / TA if TA and kira_l is not None else None},
    })
    row['kiraFlag'] = KC[1] != 'Doğrudan' or kira_12 != 'Doğrudan'
    return row


# ---------------------------------------------------------------- Excel
def excel(rows, yol):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    wb = Workbook()
    hdr_fill = PatternFill('solid', fgColor='0F6B5C'); hdr_font = Font(bold=True, color='FFFFFF')
    flag_fill = PatternFill('solid', fgColor='FBF0D9'); kirm = PatternFill('solid', fgColor='F6E0DC')
    ince = Side(style='thin', color='D5DDDA')
    TL = '#,##0;[Red]-#,##0'; YZ = '0.0%'

    def basla(ws, basliklar, genislik):
        ws.append(basliklar)
        for i, (h, w) in enumerate(zip(basliklar, genislik), 1):
            cl = ws.cell(row=1, column=i); cl.fill = hdr_fill; cl.font = hdr_font
            cl.alignment = Alignment(wrap_text=True, vertical='center'); ws.column_dimensions[get_column_letter(i)].width = w
        ws.row_dimensions[1].height = 42
        ws.freeze_panes = 'C2'

    # 1) Veri
    ws = wb.active; ws.title = 'Veri'
    B1 = ['Kod', 'Şirket', 'Son rapor dönem sonu', 'Rapor dönemi (ay)', 'Nitelik',
          'Toplam varlıklar (TL)', 'Hasılat - dönem (TL)', 'Hasılat - son 12 ay (TL)',
          'Kira geliri - dönem (TL)', 'Kira geliri - son 12 ay (TL)', 'FAVÖK - dönem (TL)', 'FAVÖK - son 12 ay (TL)',
          'Kira / Hasılat (12 ay)', 'Kira / Toplam varlık (12 ay)',
          'Kira tespiti (dönem)', 'Kira tespiti (12 ay)', 'Kira flag', 'Kira açıklaması (dönem)', 'Uyarılar (kritik/uyarı)', '12 ay formülü', 'TÜFE katsayısı (yıllık → dönem sonu)',
          'Finansal rapor (KAP)', 'Yıllık rapor (KAP)', 'Faaliyet raporu (KAP)']
    basla(ws, B1, [8, 30, 12, 8, 16, 18, 17, 17, 17, 17, 17, 17, 10, 10, 12, 12, 8, 60, 60, 30, 12, 34, 34, 34])
    for r in rows:
        if 'TA' not in r:
            ws.append([r['k'], r['u']] + [None] * 15 + ['; '.join(f['metin'] for f in r['flags'])])
            continue
        uyari = '; '.join(f"[{B_TUR.get(f['tur'], f['tur'])}] {f['metin']}" for f in r['flags'] if f['seviye'] in ('kritik', 'uyari'))
        ws.append([r['k'], r['u'], dt.date.fromisoformat(r['donemSonu']), r['ay'], r['nitelik'],
                   r['TA'], r['hasilat']['donem'], r['hasilat']['ltm'], r['kira']['donem'], r['kira']['ltm'], r['favok']['donem'], r['favok']['ltm'],
                   r['oran']['kg'], r['oran']['kv'], r['kira']['tespit'], r['kira']['tespit12'], 'EVET' if r['kiraFlag'] else '', r['kira']['not'], uyari, r['formul'], r['kf'],
                   r['rapor']['url'], (r['yillik'] or {}).get('url'), (r['faaliyet'] or {}).get('url')])
        i = ws.max_row
        ws.cell(row=i, column=3).number_format = 'DD.MM.YYYY'
        for col in range(6, 13):
            ws.cell(row=i, column=col).number_format = TL
        for col in (13, 14):
            ws.cell(row=i, column=col).number_format = YZ
        ws.cell(row=i, column=21).number_format = '0.0000'
        if r['kira']['tespit'] != 'Doğrudan':
            for col in (9, 15):
                ws.cell(row=i, column=col).fill = flag_fill
        if r['kira']['tespit12'] != 'Doğrudan':
            for col in (10, 16):
                ws.cell(row=i, column=col).fill = flag_fill
        if r['kiraFlag']:
            ws.cell(row=i, column=17).fill = flag_fill
        if any(f['seviye'] == 'kritik' for f in r['flags']):
            ws.cell(row=i, column=19).fill = kirm
        for col in (22, 23, 24):
            cl = ws.cell(row=i, column=col)
            if cl.value:
                cl.hyperlink = cl.value; cl.font = Font(color='0F6B5C', underline='single')
        for col in (18, 19):
            ws.cell(row=i, column=col).alignment = Alignment(wrap_text=False)
    ws.auto_filter.ref = f'A1:{get_column_letter(len(B1))}{ws.max_row}'

    # 2) 12 ay köprüsü (formüllü)
    ws2 = wb.create_sheet('12 ay köprüsü')
    B2 = ['Kod', 'Rapor dönemi (ay)', 'TÜFE katsayısı',
          'Hasılat cari', 'Hasılat yıllık', 'Hasılat önceki yıl aynı dönem', 'Hasılat 12 ay',
          'Kira cari', 'Kira yıllık', 'Kira önceki yıl aynı dönem', 'Kira 12 ay',
          'FAVÖK cari', 'FAVÖK yıllık', 'FAVÖK önceki yıl aynı dönem', 'FAVÖK 12 ay',
          'Kira dönem kaynağı', 'Kira yıllık kaynağı', 'Kira önceki yıl kaynağı']
    basla(ws2, B2, [8, 8, 10, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 50, 50, 50])
    for r in rows:
        if 'TA' not in r:
            continue
        i = ws2.max_row + 1
        ay, kf = r['ay'], r['kf']

        def f(cari_col, yil_col, once_col):
            if ay == 12:
                return f'={cari_col}{i}'
            if kf is None or r['yillik'] is None:
                return f'={cari_col}{i}*12/B{i}'
            return f'={cari_col}{i}+{yil_col}{i}*C{i}-{once_col}{i}'
        ws2.append([r['k'], ay, kf,
                    r['hasilat']['donem'], r['hasilat']['yillik'], r['hasilat']['onceki'], f('D', 'E', 'F'),
                    r['kira']['donem'], r['kira']['yillik'], r['kira']['onceki'], (f'=H{i}*12/B{i}' if r['kira'].get('ltmFormul') == 'yilliklandir' else f('H', 'I', 'J')),
                    r['favok']['donem'], r['favok']['yillik'], r['favok']['onceki'], f('L', 'M', 'N'),
                    f"[{r['kira']['tespit']}] {r['kira']['donemKaynak']}",
                    f"[{r['kira']['yillikTespit']}] {r['kira']['yillikKaynak']}" if r['kira']['yillikKaynak'] else '',
                    f"[{r['kira']['oncekiTespit']}] {r['kira']['oncekiKaynak']}" if r['kira']['oncekiKaynak'] else ''])
        ws2.cell(row=i, column=3).number_format = '0.0000'
        for col in range(4, 16):
            ws2.cell(row=i, column=col).number_format = TL
        for col in (7, 11, 15):
            ws2.cell(row=i, column=col).font = Font(bold=True)

    # 3) Flagler
    ws3 = wb.create_sheet('Flagler')
    basla(ws3, ['Kod', 'Şirket', 'Tür', 'Seviye', 'Açıklama'], [8, 30, 16, 9, 120])
    sira = {'kritik': 0, 'uyari': 1, 'bilgi': 2}
    for r in rows:
        for fl in sorted(r['flags'], key=lambda f: sira[f['seviye']]):
            ws3.append([r['k'], r['u'], B_TUR.get(fl['tur'], fl['tur']), fl['seviye'], fl['metin']])
            if fl['seviye'] == 'kritik':
                ws3.cell(row=ws3.max_row, column=4).fill = kirm
            elif fl['seviye'] == 'uyari':
                ws3.cell(row=ws3.max_row, column=4).fill = flag_fill
    ws3.auto_filter.ref = f'A1:E{ws3.max_row}'

    # 4) Açıklama
    ws4 = wb.create_sheet('Açıklama')
    ws4.column_dimensions['A'].width = 130
    for satir in ACIKLAMA:
        ws4.append([satir])
    ws4['A1'].font = Font(bold=True, size=13)
    wb.save(yol)


B_TUR = {'dogrulanamadi': 'Doğrulanamadı', 'celiski': 'Çelişki', 'tahmini': 'Tahmini', 'cikarim': 'Yorum/Çıkarım', 'veri': 'Veri', 'teyit': 'Teyitli'}
ACIKLAMA = [
    'OSG15 GYO veri tablosu — nasıl hesaplandı',
    '',
    'Kaynak: KAP. Her şirketin bugün itibarıyla yayımlanmış en son finansal raporu (konsolide varsa konsolide). Tutarlar TL; raporun cari dönem sonu satın alma gücüyle (TMS 29).',
    'Toplam varlıklar: son raporun bilançosu (XBRL "TOPLAM VARLIKLAR"), dipnotlu PDF ile karşılaştırıldı.',
    'Hasılat: XBRL "Hasılat". Dönem = raporun kümülatif dönemi (ör. 9 ay).',
    'FAVÖK: brüt kâr + pazarlama + genel yönetim + Ar-Ge giderleri + amortisman (nakit akış tablosundaki amortisman düzeltmesi). OSG15 kural setiyle aynı.',
    'Son 12 ay: cari dönem + son yıllık rapor × TÜFE katsayısı − önceki yılın aynı dönemi. Önceki yılın aynı dönemi cari raporun karşılaştırmalı sütunundan alınır (zaten cari dönem alım gücünde).',
    '   Yıllık rapor bir önceki yıl sonu alım gücünde olduğu için TÜFE katsayısıyla cari dönem sonuna taşınır. Katsayı KAP\'taki yeniden düzenlenmiş bilançolardan türetildi.',
    'Kira geliri: dipnotlu PDF\'teki hasılat tablosundan okunur. XBRL hasılat toplamının geçtiği satırla sütun konumu eşlenir, kira satırlarının cari ve önceki dönem değerleri alınır.',
    '   Aynı tutar faaliyet raporunda aranır, bulunursa "teyitli" flag\'i düşülür.',
    '   Dipnotta açık bir kira satırı yoksa karar hafızasındaki yorum kullanılır (ör. "hasılatın tamamı kira", "kira yok", elle okunan tutar) ve satır "Kira flag = EVET" olarak işaretlenir.',
    '   Yıllık rapordan ya da önceki yılın sütunundan kira okunamazsa cari dönemin kira/hasılat oranı uygulanır ve "Tahmini" flag\'i düşülür.',
    'Kira tespiti: Doğrudan = dipnotta (ya da bölüm/YAG dipnotunda) açıkça kira olarak verilen tutar; Yorum = kalemden çıkarım (ör. "yurtiçi satışlar" kira kabul edildi, faaliyet raporu tablosu); Tahmini = oranla tahmin.',
    '   "Kira tespiti (12 ay)" yıllık rapor ve önceki yıl bileşenlerinin en zayıfını gösterir. Flag\'li hücreler sarı; ayrıntı "Flagler" ve "12 ay köprüsü" sayfalarında.',
    'Elle kontrol: otomatik okumanın yetmediği (çok satırlı/bölümlü tablolar, taranmış PDF) şirketlerde tutarlar dipnot ve faaliyet raporundan elle okundu; kaynak satırı köprü sayfasında yazılı (repo: data/kira-elle.json).',
    '"12 ay köprüsü" sayfasında her bileşen ayrı ve 12 ay sütunları Excel formülüdür; kontrol için kullanılabilir.',
]


def csv_yaz(rows, yol):
    """Türkçe Excel için: ';' ayraç, ',' ondalık, UTF-8 BOM. Tutarlar tam TL."""
    import csv
    def n(v, d=0):
        return '' if v is None else (f'{v:.{d}f}'.replace('.', ','))
    with open(yol, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['Kod', 'Şirket', 'Dönem sonu', 'Ay', 'Toplam varlıklar', 'Hasılat dönem', 'Hasılat 12 ay', 'Kira dönem', 'Kira 12 ay',
                    'FAVÖK dönem', 'FAVÖK 12 ay', 'Kira/Hasılat 12 ay', 'Kira/Varlık 12 ay', 'Kira tespiti dönem', 'Kira tespiti 12 ay', 'Kira flag', 'KAP'])
        for r in rows:
            if 'TA' not in r:
                continue
            w.writerow([r['k'], r['u'], r['donemSonu'], r['ay'], n(r['TA']), n(r['hasilat']['donem']), n(r['hasilat']['ltm']), n(r['kira']['donem']), n(r['kira']['ltm']),
                        n(r['favok']['donem']), n(r['favok']['ltm']), n(r['oran']['kg'], 4), n(r['oran']['kv'], 4), r['kira']['tespit'], r['kira']['tespit12'],
                        'EVET' if r['kiraFlag'] else '', r['rapor']['url']])


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'indir':
        import pdf, concurrent.futures as cf_
        gerek = plan()
        print(len(gerek), 'dosya', flush=True)
        with cf_.ThreadPoolExecutor(6) as ex:
            for a, durum in ex.map(lambda kv: pdf.indir(*kv), gerek.items()):
                if durum not in ('cached', 'ok'):
                    print(a, durum, flush=True)
    rows = [sirket(k) for k in B.UNVAN]
    out = {'olusturma': dt.datetime.now().isoformat(timespec='minutes'), 'satirlar': rows}
    json.dump(out, open(os.path.join(ROOT, 'public', 'data', 'veri.json'), 'w'), ensure_ascii=False, default=str, separators=(',', ':'))
    excel(rows, os.path.join(ROOT, 'public', 'data', 'OSG15_GYO_Veri.xlsx'))
    csv_yaz(rows, os.path.join(ROOT, 'public', 'data', 'OSG15_GYO_Veri.csv'))
    print('yazıldı', len(rows), 'şirket;', sum(1 for r in rows if r.get('kiraFlag')), 'kira flag')


if __name__ == '__main__':
    main()
