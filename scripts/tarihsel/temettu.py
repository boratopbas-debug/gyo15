"""Kâr payı verisi: KAP "Kar Payı Dağıtım İşlemlerine İlişkin Bildirim"leri (karar ve genel kurul tarihleri, 1 TL nominal başına brüt tutar,
taksit tarihleri) + İş Yatırım ödeme tablosu (toplam tutar ve ödeme tarihleri; çapraz kontrol için).
Çıktı: data/cache/tarihsel/temettu/temettu.json
Kullanım: python3 scripts/tarihsel/temettu.py"""
import json, os, re, sys, html, subprocess, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ortak import CACHE, evren, d

OUT = os.path.join(CACHE, 'temettu')
SAYF = os.path.join(OUT, 'kap')
os.makedirs(SAYF, exist_ok=True)
KOD = {r['kod'] for r in evren()}


def metin(raw):
    h = raw.replace('\\u003c', '<').replace('\\u003e', '>').replace('\\"', '"').replace('\\u0026', '&')
    t = re.sub(r'<[^>]+>', ' | ', h)
    t = html.unescape(re.sub(r'(\s*\|\s*)+', ' | ', t))
    i = t.find('Özet Bilgi | ')
    return t[i:] if i > 0 else t


def tr_sayi(s):
    return float(s.replace('.', '').replace(',', '.'))


def ayristir(t, kod):
    i = t.find('Özet Bilgi | ')
    t = t[i:] if i > 0 else t
    o = {}
    m = re.search(r'Özet Bilgi \| ([^|]+)', t); o['ozet'] = m.group(1).strip() if m else ''
    m = re.search(r'Karar Tarihi \| (\d\d\.\d\d\.\d{4})', t); o['karar'] = m.group(1) if m else None
    m = re.search(r'Genel Kurul Tarihi \| (\d\d\.\d\d\.\d{4})', t); o['gk'] = m.group(1) if m else None
    m = re.search(r'Nakit Kar Payı Ödeme Şekli \| ([^|]+)', t); o['sekil'] = m.group(1).strip() if m else None
    o['duzeltme'] = bool(re.search(r'Düzeltme mi \? \| Evet', t))
    o['guncelleme'] = bool(re.search(r'Güncelleme mi \? \| Evet', t))
    o['avans'] = bool(re.search(r'avans', o['ozet'], re.I)) or 'Kar Payı Avansı Hak Kullanım Tarihi' in t or 'Kar Payı Avansı Dağıtımı İçin Yetki' in t
    o['gkKarari'] = bool(re.search(r'genel kurul', o['ozet'], re.I)) and not re.search(r'öneri|teklif|sunulacak', o['ozet'], re.I)
    # 1 TL nominal başına brüt: "<grup>, KOD, ISIN | [Peşin | N. Taksit | TOPLAM |] brüt TL | brüt % | stopaj | net TL | net %"
    def grup_brut(etiket_kod):
        rows = re.findall(rf'{etiket_kod}, (TR[A-Z0-9]+) \| (?:(Peşin|TOPLAM|\d+\. Taksit) \| )?([\d.,]+) \| ([\d.,]+) \| ([\d.,]+) \|', t)
        if not rows:
            return None, None
        top = [r for r in rows if r[1] == 'TOPLAM']
        if top:
            return tr_sayi(top[0][2]), tr_sayi(top[0][4])
        tak = {}
        for r in rows:
            tak.setdefault(r[1] or 'tek', (tr_sayi(r[2]), tr_sayi(r[4])))
        return sum(v[0] for v in tak.values()), max(v[1] for v in tak.values())
    o['brutTL'], o['stopaj'] = grup_brut(re.escape(kod))
    oranlar = {}
    for g in sorted(set(re.findall(r'([A-Z]) Grubu, [^,|]+, TR[A-Z0-9]+ \|', t))):
        v, _ = grup_brut(rf'{g} Grubu, [^,|]+')
        if v is not None:
            oranlar[g] = v
    o['gruplar'] = oranlar
    o['imtiyaz'] = len(set(oranlar.values())) > 1
    # taksit / ödeme tarihleri
    o['tarihler'] = sorted(set(re.findall(r'Ödeme Tarihi \| (\d\d\.\d\d\.\d{4})', t)))
    m = re.search(r'TOPLAM \| ([\d.,]+) \|', t)
    o['toplamNet'] = tr_sayi(m.group(1)) if m else None
    o['taksitler'] = sorted(set(re.findall(r'(\d+)\. Taksit \| (\d\d\.\d\d\.\d{4})', t)))
    o['dagitilmayacak'] = bool(re.search(r'dağıtılmama|dağıtım yapılmama|Ödenmeyecek', o['ozet'] + ' ' + (o['sekil'] or ''), re.I))
    return o


def indir(idx):
    f = os.path.join(SAYF, f'{idx}.txt')
    if os.path.exists(f) and os.path.getsize(f) > 100:
        return open(f, encoding='utf-8').read()
    for i in range(3):
        r = subprocess.run(['curl', '-sSL', '-m', '90', '-A', 'Mozilla/5.0 (OSG15 agent)', f'https://www.kap.org.tr/tr/Bildirim/{idx}'], capture_output=True)
        if r.returncode == 0 and len(r.stdout) > 5000:
            t = metin(r.stdout.decode('utf-8', 'ignore'))
            open(f, 'w', encoding='utf-8').write(t)
            return t
        time.sleep(3)
    return ''


def main():
    oda = json.load(open(os.path.join(CACHE, 'search_ODA.json')))
    kayit = []
    gor = set()
    for v in oda.values():
        for x in v:
            if 'Kar Payı' not in (x.get('subject') or '') or x['disclosureIndex'] in gor:
                continue
            ks = [s.strip() for s in (x['stockCodes'] or '').split(',') if s.strip() in KOD]
            if ks:
                gor.add(x['disclosureIndex'])
                kayit.append((ks[0], x))
    out = {}
    for n, (k, x) in enumerate(sorted(kayit, key=lambda z: z[1]['disclosureIndex'])):
        t = indir(x['disclosureIndex'])
        o = ayristir(t, k)
        o.update({'idx': x['disclosureIndex'], 'yayim': x['publishDate'], 'url': f"https://www.kap.org.tr/tr/Bildirim/{x['disclosureIndex']}"})
        out.setdefault(k, []).append(o)
        print(n, k, x['publishDate'][:10], o['ozet'][:50], o['karar'], o['gk'], o['brutTL'], o['avans'], flush=True)
    isy = json.load(open(os.path.join(OUT, 'is_temettu.json')))
    odeme = {}
    for k, rows in isy.items():
        if k.startswith('_'):
            continue
        tek = {}
        for r in rows:
            if r['tarih'] and r['toplam'] is not None:
                tek[r['tarih']] = {'tarih': r['tarih'], 'toplam': r['toplam'], 'hb': r['hb']}
        odeme[k] = sorted(tek.values(), key=lambda z: z['tarih'])
    json.dump({'kap': out, 'odeme': odeme}, open(os.path.join(OUT, 'temettu.json'), 'w'), ensure_ascii=False)


if __name__ == '__main__':
    main()
