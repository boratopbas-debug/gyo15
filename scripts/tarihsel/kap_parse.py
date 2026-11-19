"""KAP finansal rapor bildirim sayfasını indirir ve kompakt JSON'a çevirir.
Kullanım: python3 scripts/tarihsel/kap_parse.py IDX [IDX ...]
Çıktı: data/cache/tarihsel/rapor/IDX.json — nitelik, para birimi, tablo başlıkları, tüm XBRL kalemleri (sütun sırasıyla), PDF ekleri."""
import re, json, html, os, sys, subprocess, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'cache', 'tarihsel', 'rapor')
os.makedirs(OUT, exist_ok=True)


def unescape(h):
    return h.replace('\\u003c', '<').replace('\\u003e', '>').replace('\\"', '"').replace('\\r\\n', ' ').replace('\\u0026', '&')


def text_of(h):
    t = re.sub(r'<[^>]+>', ' ', h)
    return html.unescape(re.sub(r'\s+', ' ', t))


def parse(raw):
    h = unescape(raw)
    t = text_of(h)
    m = re.search(r'Finansal Tablo Niteliği\s+(Konsolide Olmayan|Konsolide)', t)
    nitelik = m.group(1) if m else None
    m = re.search(r'Sunum Para Birimi\s+(1\.000 TL|1\.000\.000 TL|TL|USD|EUR)', t)
    birim = m.group(1) if m else None
    m = re.search(r'Yıl\s+(\d{4})\s+Periyot\s+(\S+(?: Aylık)?)', t)
    ekler = list(dict.fromkeys(re.findall(r'api/file/download/([0-9a-f]{32})', h)))
    ek_ad = list(dict.fromkeys(n.strip() for n in re.findall(r'([^<>"]{3,160}\.pdf)', t, re.I)))
    tablolar = {}
    parts = re.split(r'<table class="financial-table (tbl_[a-z_0-9]+)"', h)
    for i in range(1, len(parts), 2):
        role, body = parts[i], parts[i + 1]
        hdr = re.findall(r'class="context-header" column-id="(\d+)"><div><div class="gwt-HTML multi-language-content content-tr"[^>]*>(.*?)</div>', body)
        cols = [re.sub(r'\s+', ' ', text_of(re.sub(r'<br/?>', ' ', x))).strip() for _, x in hdr]
        rows = {}
        for r in re.split(r'<tr class="general_role_\d+-row-\d+ ', body):
            if 'data-input-row' not in r[:80]:
                continue
            mm = re.search(r'taxonomy-field-name">([^|<]+)', r)
            if not mm:
                continue
            vals = re.findall(r'col-order-class-(\d+)"><div><div([^>]*)>', r)
            v = []
            for _, a in vals:
                tt = re.search(r'title="([^"]*)"', a)
                try:
                    v.append(float(tt.group(1)) if tt and tt.group(1) not in ('',) else None)
                except ValueError:
                    v.append(None)
            if any(x is not None for x in v):
                rows.setdefault(mm.group(1), v)
        tablolar[role] = {'cols': cols, 'rows': rows}
    m = re.search(r'Cari Dönem\s+(\d\d\.\d\d\.\d{4})', t)
    return {'nitelik': nitelik, 'birim': birim, 'cari': m.group(1) if m else None, 'ekler': ekler, 'ekAd': ek_ad[:6], 'tablolar': tablolar}


def fetch(idx):
    f = os.path.join(OUT, f'{idx}.json')
    if os.path.exists(f) and os.path.getsize(f) > 200:
        return 'cached'
    for i in range(3):
        r = subprocess.run(['curl', '-sSL', '-m', '120', '-A', 'Mozilla/5.0 (OSG15 agent)', f'https://www.kap.org.tr/tr/Bildirim/{idx}'], capture_output=True)
        if r.returncode == 0 and len(r.stdout) > 5000:
            d = parse(r.stdout.decode('utf-8', 'ignore'))
            d['idx'] = int(idx)
            json.dump(d, open(f, 'w'), ensure_ascii=False)
            return 'ok'
        time.sleep(3 * (i + 1))
    return 'fail'


if __name__ == '__main__':
    for idx in sys.argv[1:]:
        print(idx, fetch(idx), flush=True)
