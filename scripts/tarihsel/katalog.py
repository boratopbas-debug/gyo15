"""KAP FR arama önbelleğinden GYO evrenine ait finansal rapor ve faaliyet raporu bildirimlerini ayıklar.
fetch.py search'ten sonra, kap_parse.py'den önce çalışır.
Çıktı: data/cache/tarihsel/fr_gyo.json, fa_gyo.json, idx.txt (ayrıştırılacak finansal rapor numaraları)
Kullanım: python3 scripts/tarihsel/katalog.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ortak import CACHE, evren

KOD = {r['kod'] for r in evren()}


def gyo_mu(x):
    return any(s.strip() in KOD for s in (x.get('stockCodes') or '').split(','))


if __name__ == '__main__':
    ara = json.load(open(os.path.join(CACHE, 'search_FR.json')))
    hepsi = {x['disclosureIndex']: x for v in ara.values() for x in v if gyo_mu(x)}
    fr = [x for x in hepsi.values() if x['subject'] == 'Finansal Rapor']
    fa = [x for x in hepsi.values() if (x['subject'] or '').startswith('Faaliyet Raporu (')]
    json.dump(sorted(fr, key=lambda x: x['disclosureIndex']), open(os.path.join(CACHE, 'fr_gyo.json'), 'w'), ensure_ascii=False)
    json.dump(sorted(fa, key=lambda x: x['disclosureIndex']), open(os.path.join(CACHE, 'fa_gyo.json'), 'w'), ensure_ascii=False)
    open(os.path.join(CACHE, 'idx.txt'), 'w').write('\n'.join(str(x['disclosureIndex']) for x in fr))
    print('finansal rapor', len(fr), 'faaliyet raporu', len(fa))
