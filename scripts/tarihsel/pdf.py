"""Seçilen finansal raporların dipnot PDF'lerini ve aynı dönem faaliyet raporlarını indirir, metne çevirir (pdftotext -layout).
PDF'ler silinir, yalnızca metin data/cache/tarihsel/metin/ altında kalır.
Kullanım: python3 scripts/tarihsel/pdf.py"""
import os, sys, json, subprocess, tempfile, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ortak import CACHE, rapor
import kap_parse

METIN = os.path.join(CACHE, 'metin')
os.makedirs(METIN, exist_ok=True)


def indir(anahtar, ek):
    out = os.path.join(METIN, f'{anahtar}.txt')
    if os.path.exists(out) and os.path.getsize(out) > 500:
        return anahtar, 'cached'
    if str(anahtar).startswith('fa'):
        kap_parse.fetch(ek)                     # faaliyet raporu bildirim sayfası → ek listesi
        r = rapor(ek)
        if not r or not r['ekler']:
            return anahtar, 'ek-yok'
        ek = r['ekler'][0]
    with tempfile.TemporaryDirectory() as tmp:
        p = os.path.join(tmp, 'a.pdf')
        for i in range(3):
            x = subprocess.run(['curl', '-sSL', '-m', '240', '-A', 'Mozilla/5.0 (OSG15 agent)', '-o', p, f'https://www.kap.org.tr/tr/api/file/download/{ek}'])
            if x.returncode == 0 and os.path.exists(p) and os.path.getsize(p) > 2000:
                break
        else:
            return anahtar, 'indirilemedi'
        subprocess.run(['pdftotext', '-layout', p, out], capture_output=True)
        if not os.path.exists(out) or os.path.getsize(out) < 500:
            open(out, 'w').write('')
            return anahtar, 'metin-yok (taranmış PDF olabilir)'
    return anahtar, 'ok'


if __name__ == '__main__':
    import build
    gerek = build.plan()
    print(len(gerek), 'dosya', flush=True)
    with cf.ThreadPoolExecutor(6) as ex:
        for a, durum in ex.map(lambda kv: indir(*kv), gerek.items()):
            print(a, durum, flush=True)
