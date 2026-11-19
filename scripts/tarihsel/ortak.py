"""Tarihsel endeks hesabının ortak yardımcıları: yollar, tarih, rapor kataloğu, XBRL okuma."""
import json, os, csv, re, datetime as dt, statistics

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, 'data', 'cache', 'tarihsel')
HERE = os.path.dirname(os.path.abspath(__file__))

AY = {'3 Aylık': 3, '6 Aylık': 6, '9 Aylık': 9, 'Yıllık': 12, '12 Aylık': 12}

# XBRL kalem adları (engine.mjs / kap-xbrl.mjs ile aynı sırayla; ilk bulunan kullanılır)
XBRL = {
    'CA': ['ifrs-full_CurrentAssets'], 'CL': ['ifrs-full_CurrentLiabilities'], 'TA': ['ifrs-full_Assets'], 'TL': ['ifrs-full_Liabilities'],
    'EQ': ['ifrs-full_EquityAttributableToOwnersOfParent', 'ifrs-full_Equity'], 'EQT': ['ifrs-full_Equity'], 'EL': ['ifrs-full_EquityAndLiabilities'],
    'CASH': ['ifrs-full_CashAndCashEquivalents'], 'CFI': ['kap-fr_CurrentFinancialInvestments'],
    'STB': ['kap-fr_CurrentBorowings', 'kap-fr_CurrentBorrowings'], 'CPLTB': ['kap-fr_CurrentPortionOfNoncurrentBorrowings'], 'LTB': ['ifrs-full_LongtermBorrowings'],
    'OFL_C': ['ifrs-full_OtherCurrentFinancialLiabilities'], 'OFL_N': ['ifrs-full_OtherNoncurrentFinancialLiabilities'],
    'REV': ['ifrs-full_Revenue'], 'GP': ['ifrs-full_GrossProfit'], 'GA': ['ifrs-full_AdministrativeExpense'], 'MKT': ['kap-fr_MarketingExpense'],
    'RD': ['ifrs-full_ResearchAndDevelopmentExpense'], 'DA': ['ifrs-full_AdjustmentsForDepreciationAndAmortisationExpense'],
}
BS = {'CA', 'CL', 'TA', 'TL', 'EQ', 'EQT', 'EL', 'CASH', 'CFI', 'STB', 'CPLTB', 'LTB', 'OFL_C', 'OFL_N'}


def d(s):
    """'30.10.2024 18:39:22' | '30.10.2024' | '30-10-2024' → date"""
    s = s.strip()[:10]
    if '-' in s and len(s.split('-')[0]) == 4:
        return dt.date.fromisoformat(s)
    sep = '.' if '.' in s else '-'
    g, a, y = s.split(sep)
    return dt.date(int(y), int(a), int(g))


def evren():
    return list(csv.DictReader(open(os.path.join(HERE, 'evren.csv'), encoding='utf-8')))


def rapor(idx):
    f = os.path.join(CACHE, 'rapor', f'{idx}.json')
    return json.load(open(f)) if os.path.exists(f) else None


def carpan(r):
    b = (r or {}).get('birim') or 'TL'
    return 1e6 if b.startswith('1.000.000') else 1000 if b.startswith('1.000') else 1


def kalem(r, key, kolon=0):
    """kolon 0 = cari dönem (kümülatif), 1 = önceki dönem. Döner: (değer TL, kullanılan ad) ya da (None, None)."""
    for ad in XBRL[key]:
        for t in r['tablolar'].values():
            v = t['rows'].get(ad)
            if v is not None and len(v) > kolon and v[kolon] is not None:
                return v[kolon] * carpan(r), ad
    return None, None


def katalog():
    """Şirket → [rapor kayıtları]; her kayıt: idx, yayim (datetime), yil, ay, nitelik, donemSonu (date)."""
    fr = json.load(open(os.path.join(CACHE, 'fr_gyo.json')))
    kod = {r['kod'] for r in evren()}
    out = {}
    for x in fr:
        r = rapor(x['disclosureIndex'])
        if not r or not r.get('cari') or x['ruleType'] not in AY:
            continue
        for k in [s.strip() for s in (x['stockCodes'] or '').split(',')]:
            if k in kod:
                out.setdefault(k, []).append({
                    'idx': x['disclosureIndex'], 'yayim': dt.datetime.strptime(x['publishDate'], '%d.%m.%Y %H:%M:%S'),
                    'yil': x['year'], 'ay': AY[x['ruleType']], 'nitelik': r['nitelik'], 'donemSonu': d(r['cari']), 'birim': r['birim'],
                })
    return out


def secili(kayitlar, gun, oncelik_konsolide=True):
    """gun itibarıyla yayımlanmış en güncel dönemin raporu; konsolide varsa konsolide; aynı dönemde düzeltme varsa en son yayımlanan."""
    sinir = dt.datetime.combine(gun, dt.time(23, 59))
    aday = [x for x in kayitlar if x['yayim'] <= sinir]
    if not aday:
        return None
    son = max(x['donemSonu'] for x in aday)
    ayni = [x for x in aday if x['donemSonu'] == son]
    kons = [x for x in ayni if x['nitelik'] == 'Konsolide']
    havuz = kons if (kons and oncelik_konsolide) else ayni
    return max(havuz, key=lambda x: x['yayim'])


def yillik(kayitlar, gun, fy_sonu, nitelik):
    sinir = dt.datetime.combine(gun, dt.time(23, 59))
    aday = [x for x in kayitlar if x['yayim'] <= sinir and x['ay'] == 12 and x['donemSonu'] == fy_sonu]
    ayni = [x for x in aday if x['nitelik'] == nitelik] or aday
    return max(ayni, key=lambda x: x['yayim']) if ayni else None
