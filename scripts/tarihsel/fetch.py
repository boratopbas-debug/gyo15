"""Geçmiş veri toplayıcı: KAP FR/CA bildirim aramaları, İş Yatırım günlük fiyat geçmişi.
Kullanım: python3 scripts/tarihsel/fetch.py [search|prices|all]
Önbellek: data/cache/tarihsel/ (git'e girmez)."""
import json, os, sys, time, datetime as dt, subprocess, csv

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
C = os.path.join(ROOT, 'data', 'cache', 'tarihsel')
os.makedirs(C, exist_ok=True)
KAP = 'https://www.kap.org.tr'
BASLA = dt.date(2024, 1, 1)


def curl(args, tries=3):
    for i in range(tries):
        r = subprocess.run(['curl', '-sS', '-L', '-m', '90', '-A', 'Mozilla/5.0 (OSG15 agent)'] + args, capture_output=True)
        if r.returncode == 0 and r.stdout:
            return r.stdout
        time.sleep(2 * (i + 1))
    raise RuntimeError(f'curl failed: {args[-1]} {r.stderr[:200]}')


def kap_search(cls, d0, d1):
    body = {"fromDate": str(d0), "toDate": str(d1), "memberType": "IGS", "disclosureClass": cls, "subjectList": [], "mkkMemberOidList": [],
            "inactiveMkkMemberOidList": [], "bdkMemberOidList": [], "mainSector": "", "sector": "", "subSector": "", "marketOidList": [],
            "isLate": "", "term": "", "ruleType": "", "period": "", "year": "", "index": "", "fromSrc": False, "srcCategory": "", "discIndex": []}
    out = curl(['-X', 'POST', '-H', 'Content-Type: application/json', f'{KAP}/tr/api/disclosure/members/byCriteria', '-d', json.dumps(body)])
    return json.loads(out)


def search_all(cls, step=6):
    f = os.path.join(C, f'search_{cls}.json')
    have = json.load(open(f)) if os.path.exists(f) else {}
    d0 = BASLA
    today = dt.date.today()
    while d0 <= today:
        d1 = min(today, d0 + dt.timedelta(days=step))
        key = str(d0)
        if key not in have or d1 >= today - dt.timedelta(days=1):
            x = kap_search(cls, d0, d1)
            if len(x) >= 2000:
                print('UYARI: 2000 sınırı', cls, d0, file=sys.stderr)
            have[key] = x
            json.dump(have, open(f, 'w'))
        d0 = d1 + dt.timedelta(days=1)
    n = sum(len(v) for v in have.values())
    print(cls, 'toplam', n)


def kodlar():
    return [r['kod'] for r in csv.DictReader(open(os.path.join(os.path.dirname(__file__), 'evren.csv'), encoding='utf-8'))]


def prices(extra=('XGMYO', 'XU100')):
    os.makedirs(os.path.join(C, 'fiyat'), exist_ok=True)
    for k in list(kodlar()) + list(extra):
        f = os.path.join(C, 'fiyat', f'{k}.json')
        rows = []
        a = dt.date(2024, 6, 1)
        while a <= dt.date.today():
            b = min(dt.date.today(), a + dt.timedelta(days=180))
            url = ('https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil?'
                   f'hisse={k}&startdate={a:%d-%m-%Y}&enddate={b:%d-%m-%Y}')
            try:
                d = json.loads(curl([url]))
                rows += d.get('value') or []
            except Exception as e:
                print('fiyat hata', k, a, e, file=sys.stderr)
            a = b + dt.timedelta(days=1)
        json.dump(rows, open(f, 'w'))
        print(k, len(rows))


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('search', 'all'):
        search_all('FR')
        search_all('CA')
    if what in ('prices', 'all'):
        prices()
