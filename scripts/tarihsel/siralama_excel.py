"""OSG15 sıralaması: son 12, 6 ve 3 ay pencereleri ayrı sayfalarda + karşılaştırma sayfası.
Girdi: public/data/siralama.json (node scripts/siralama.mjs üretir). Çıktı: public/data/OSG15_Siralama.xlsx
Kullanım: node scripts/siralama.mjs && python3 scripts/tarihsel/siralama_excel.py"""
import json, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = json.load(open(os.path.join(ROOT, 'public', 'data', 'siralama.json')))
HDR = PatternFill('solid', fgColor='0F6B5C'); HF = Font(bold=True, color='FFFFFF')
RENK = {'Endeks': PatternFill('solid', fgColor='DDEFE9'), 'Yedek': PatternFill('solid', fgColor='FBF0D9'), 'Elendi': PatternFill('solid', fgColor='F6E0DC')}
TL = '#,##0;[Red]-#,##0'; YZ = '0.0%'; YZ2 = '0.00%'
SIRA = {'Endeks': 0, 'Yedek': 1, 'Havuzda': 2, 'Elendi': 3}


def basla(ws, b, gen):
    ws.append(b)
    for i, (h, w) in enumerate(zip(b, gen), 1):
        c = ws.cell(row=1, column=i); c.fill = HDR; c.font = HF; c.alignment = Alignment(wrap_text=True, vertical='center')
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[1].height = 44
    ws.freeze_panes = 'D2'


wb = Workbook()
wb.remove(wb.active)
for w in ('12', '6', '3'):
    ws = wb.create_sheet(f'Endeks {w} ay')
    yil = '' if w == '12' else ', yıllık'
    B = ['Sıra', 'Kod', 'Şirket', 'Durum', 'Toplam puan', 'PD/DD', f'FAVÖK/FD ({w} ay{yil})', 'Temettü verimi (%)', 'Cari oran', 'Yükümlülük/Varlık',
         f'Kira/Hasılat ({w} ay)', f'Kira/Varlık ({w} ay{yil})', f'Hasılat ({w} ay, TL)', f'Kira geliri ({w} ay, TL)', f'FAVÖK ({w} ay, TL)',
         'Piyasa değeri (TL)', 'Firma değeri (TL)', 'Toplam varlıklar (TL)', 'Eleme nedeni', 'Bayraklar']
    basla(ws, B, [6, 8, 30, 9, 9, 8, 10, 9, 8, 10, 10, 10, 17, 17, 17, 17, 17, 17, 50, 90])
    rows = sorted(D['pencereler'][w], key=lambda r: (SIRA[r['durum']], r['sira'] or 0, r['k']))
    for r in rows:
        o = r['oran']
        ws.append([r['sira'], r['k'], r['u'], r['durum'], r['toplam'], o['pddd'], o['fav'], o['dy'], o['cr'], o['lev'], o['kg'], o['kv'],
                   r['hasilat'], r['kira'], r['favok'], r['PD'], r['FD'], r['TA'], '; '.join(r['elenme']), ' · '.join(r['bayraklar'])])
        i = ws.max_row
        for c, f in ((5, '0.00'), (6, '0.00'), (7, YZ), (8, '0.00'), (9, '0.00'), (10, YZ), (11, YZ), (12, YZ2)):
            ws.cell(row=i, column=c).number_format = f
        for c in range(13, 19):
            ws.cell(row=i, column=c).number_format = TL
        if r['durum'] in RENK:
            ws.cell(row=i, column=4).fill = RENK[r['durum']]
    ws.auto_filter.ref = f'A1:{get_column_letter(len(B))}{ws.max_row}'

# Karşılaştırma
ws = wb.create_sheet('Karşılaştırma')
basla(ws, ['Kod', 'Şirket', '12 ay', '6 ay', '3 ay', 'Kira/Hasılat 12 ay', 'Kira/Hasılat 6 ay', 'Kira/Hasılat 3 ay', 'Kira/Varlık 12 ay', 'Kira/Varlık 6 ay (yıllık)', 'Kira/Varlık 3 ay (yıllık)', 'Endekste kaç pencerede'],
      [8, 30, 12, 12, 12, 10, 10, 10, 10, 10, 10, 10])
P = {w: {r['k']: r for r in D['pencereler'][w]} for w in ('12', '6', '3')}
ds = lambda r: 'Elendi' if r['durum'] == 'Elendi' else f"{r['durum']} {r['sira']}."
for k in sorted(P['12'], key=lambda k: (sum(P[w][k]['durum'] != 'Endeks' for w in P), P['12'][k]['sira'] or 99, k)):
    a, b, c = P['12'][k], P['6'][k], P['3'][k]
    ws.append([k, a['u'], ds(a), ds(b), ds(c), a['oran']['kg'], b['oran']['kg'], c['oran']['kg'], a['oran']['kv'], b['oran']['kv'], c['oran']['kv'],
               sum(x['durum'] == 'Endeks' for x in (a, b, c))])
    i = ws.max_row
    for col, x in ((3, a), (4, b), (5, c)):
        if x['durum'] in RENK:
            ws.cell(row=i, column=col).fill = RENK[x['durum']]
    for col in (6, 7, 8):
        ws.cell(row=i, column=col).number_format = YZ
    for col in (9, 10, 11):
        ws.cell(row=i, column=col).number_format = YZ2
ws.auto_filter.ref = f'A1:L{ws.max_row}'

# Açıklama
ws = wb.create_sheet('Açıklama')
ws.column_dimensions['A'].width = 130
for s in [
    'OSG15 sıralaması — son 12, 6 ve 3 ay pencereleri',
    '',
    f"Fiyat, piyasa değeri ve temettü: {D['fiyatTarihi']}. Karar hafızası: ilk hâl (sitedeki onaylar sonradan değişmişse site esas alınır). Oluşturma: {D['olusturma']}.",
    'Pencere yalnızca akım kalemlerini değiştirir: FAVÖK, hasılat ve kira geliri. Bilanço kalemleri, piyasa değeri ve temettü üç sayfada da aynıdır.',
    '12 ay: cari dönem + son yıllık rapor × TÜFE katsayısı − önceki yılın aynı dönemi.',
    '6 ay: 9 aylık rapor − 3 aylık ara rapor × TÜFE katsayısı (Nisan–Eylül 2026). 3 ay: 9 aylık rapor − 6 aylık ara rapor × TÜFE katsayısı (Temmuz–Eylül 2026).',
    'Kira/Varlık ve FAVÖK/FD oranlarında 6 ve 3 aylık tutarlar × 12/ay ile yıllığa çevrilir (eşik %2,5 yıllık); Kira/Hasılat çevrilmez.',
    'Eleme: Yükümlülük/Varlık > %85, ya da Kira/Hasılat < %15 ve Kira/Varlık < %2,5. Puan: PD/DD %50, FAVÖK/FD %20, temettü verimi %20, cari oran %5, Yük./Varlık %5.',
    'Köprülerin bileşenleri ve kaynakları: OSG15_GYO_Veri.xlsx ("12 ay köprüsü", "6 ay köprüsü", "3 ay köprüsü" sayfaları).',
]:
    ws.append([s])
ws['A1'].font = Font(bold=True, size=13)
wb.save(os.path.join(ROOT, 'public', 'data', 'OSG15_Siralama.xlsx'))
print('yazıldı')
