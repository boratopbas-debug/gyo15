"""Dipnot (finansal rapor PDF metni) ve faaliyet raporu metninden kira geliri okuma.
Dönüş: {'tutar': float|None (rapor biriminde), 'satirlar': [...], 'durum': 'bulundu'|'yok'|'belirsiz', 'not': str}"""
import re

SAYI = re.compile(r'\(?-?\d{1,3}(?:,\d{3}){2,}\)?|\(?-?\d{1,3}(?:\.\d{3})+(?:,\d+)?\)?|\(?-?\d+,\d+\)?|\(?-?\d{4,}\)?')
HARIC = re.compile(r'sertifika|bedeli|gider|yükümlülü|ödeme|ödenen|öde\b|iade|kiracı|kiraya veren olarak|finansal kiralama|kiralama işlemlerinden|kullanım hakkı|peşin|ertelenmiş|alacak|tahakkuk|indirim|depozito|teminat|maliyet', re.I)
KIRA = re.compile(r'kira\s*gelir|kira\s*hasılat|kiralama\s*gelir|kira\s*\(|^\s*kira\s', re.I)
BASLIK = re.compile(r'H[AÂ]SILAT|H[aâ]sılat|SATIŞLAR\b|Satışlar\b|SATIŞ GELİRLERİ|Satış Gelirleri')


def sayi(s):
    neg = s.startswith('(') or s.startswith('-')
    s = s.strip('()-')
    if re.fullmatch(r'\d{1,3}(?:,\d{3}){2,}', s):
        s = s.replace(',', '')
    if ',' in s and '.' in s:
        v = float(s.replace('.', '').replace(',', '.'))
    elif ',' in s:
        v = float(s.replace(',', '.'))
    else:
        v = float(s.replace('.', ''))
    return -v if neg else v


def sayilar(satir):
    out = []
    for m in SAYI.finditer(satir):
        t = m.group(0)
        # dipnot numarası, yıl gibi küçük tam sayıları ayıkla
        if re.fullmatch(r'\(?\d{4}\)?', t) and 1990 < int(t.strip('()')) < 2100:
            continue
        try:
            out.append(sayi(t))
        except ValueError:
            pass
    return out


def satir_degeri(n):
    """Satırdaki ilk sayı cari dönemdir; bölüm/proje kırılımlı geniş tablolarda son sütun satır toplamıysa onu al."""
    pos = [abs(x) for x in n if x]
    if len(pos) >= 3:
        for k in range(len(pos) - 1, 1, -1):
            if abs(sum(pos[:k]) - pos[k]) <= 0.002 * pos[k]:
                return pos[k]
    return n[0]


def kisa_etiket(l):
    m = SAYI.search(l)
    return bool(m) and len(re.sub(r'[^A-Za-zÇĞİÖŞÜçğıöşü ]', '', l[:m.start()]).split()) <= 7


def tr_bicim(v):
    return f"{abs(v):,.0f}".replace(',', '.')


def _capali(metin, hasilat=None):
    """hasilat: XBRL hasılat (rapor biriminde). Verilirse yalnızca hasılat toplamının geçtiği tablonun çevresi okunur."""
    L = metin.split('\n')
    if hasilat:
        h = tr_bicim(hasilat); h2 = h.replace('.', ',')
        capalar = [i for i, l in enumerate(L) if (h in l or h2 in l) and i > 150]
        adaylar = []
        for i in capalar:
            for j in range(max(0, i - 35), min(len(L), i + 4)):
                l = L[j]
                if KIRA.search(l) and not HARIC.search(l):
                    n = sayilar(l)
                    if n and kisa_etiket(l):
                        adaylar.append({'satir': j, 'capa': i, 'metin': re.sub(r'\s{2,}', ' | ', l.strip())[:160], 'deger': satir_degeri(n), 'toplam': bool(re.search(r'toplam', l, re.I))})
        tekil = {}
        for a in adaylar:
            tekil.setdefault(a['satir'], a)
        adaylar = sorted(tekil.values(), key=lambda a: a['satir'])
        if adaylar:
            capa = adaylar[0]['capa']
            grup = [a for a in adaylar if a['capa'] == capa and 0 < a['deger'] <= hasilat * 1.001]
            top = [a for a in grup if a['toplam']]
            if top:
                return {'tutar': top[0]['deger'], 'satirlar': grup, 'durum': 'bulundu', 'not': 'Hasılat dipnotu: toplam kira satırı'}
            if len(grup) == 1:
                return {'tutar': grup[0]['deger'], 'satirlar': grup, 'durum': 'bulundu', 'not': 'Hasılat dipnotu: tek kira satırı'}
            if grup:
                return {'tutar': sum(a['deger'] for a in grup), 'satirlar': grup, 'durum': 'belirsiz', 'not': f'Hasılat dipnotunda {len(grup)} kira satırı toplandı; çift sayım kontrol edilmeli'}
        if capalar:
            return {'tutar': None, 'satirlar': [], 'durum': 'yok', 'not': 'Hasılat tablosu bulundu, içinde kira satırı yok'}
    return None


def _baslikli(metin):
    L = metin.split('\n')
    # içindekiler sayfasını atla: başlıktan sonra en az 2 sayısal satır olan bloklar
    bloklar = []
    for i, l in enumerate(L):
        if i > 200 and BASLIK.search(l) and len(l.strip()) < 120:
            blk = L[i:i + 70]
            if sum(1 for x in blk if re.search(r'\d{1,3}\.\d{3}', x)) >= 2:
                bloklar.append((i, blk))
    adaylar = []
    for i, blk in bloklar:
        for j, l in enumerate(blk):
            if KIRA.search(l) and not HARIC.search(l):
                n = sayilar(l)
                if n and kisa_etiket(l):
                    adaylar.append({'satir': i + j, 'metin': re.sub(r'\s{2,}', ' | ', l.strip())[:160], 'deger': satir_degeri(n), 'toplam': bool(re.search(r'toplam', l, re.I))})
    # aynı satır birden fazla blokta görünebilir
    tekil = {}
    for a in adaylar:
        tekil.setdefault(a['satir'], a)
    adaylar = sorted(tekil.values(), key=lambda a: a['satir'])
    if not adaylar:
        return {'tutar': None, 'satirlar': [], 'durum': 'yok', 'not': 'Hasılat dipnotunda kira satırı bulunamadı' if bloklar else 'Hasılat dipnotu bulunamadı'}
    # ilk dipnot bloğundaki satırlar (aynı tablo); toplam satırı varsa onu al
    ilk_blok = adaylar[0]['satir']
    grup = [a for a in adaylar if a['satir'] - ilk_blok < 30]
    top = [a for a in grup if a['toplam']]
    if top:
        return {'tutar': top[0]['deger'], 'satirlar': grup, 'durum': 'bulundu', 'not': 'Dipnottaki toplam kira satırı'}
    pozitif = [a for a in grup if a['deger'] > 0]
    if len(pozitif) == 1:
        return {'tutar': pozitif[0]['deger'], 'satirlar': grup, 'durum': 'bulundu', 'not': 'Dipnotta tek kira satırı'}
    return {'tutar': sum(a['deger'] for a in pozitif), 'satirlar': grup, 'durum': 'belirsiz',
            'not': f'Dipnotta {len(pozitif)} kira satırı toplandı; çift sayım olmadığı kontrol edilmeli'}


def faaliyet(metin):
    """Faaliyet raporunda kira geliri geçen sayısal satırlar ve yüzde ifadeleri."""
    out = []
    for i, l in enumerate(metin.split('\n')):
        if KIRA.search(l) and not HARIC.search(l):
            n = sayilar(l)
            p = re.findall(r'%\s?\d+(?:,\d+)?|\d+(?:,\d+)?\s?%', l)
            if n or p:
                out.append({'satir': i, 'metin': re.sub(r'\s{2,}', ' | ', l.strip())[:180], 'sayilar': n[:4], 'yuzde': p[:3]})
    return out[:15]


def eslesir(a, b, tol=0.02):
    """İki tutar farklı birimlerde olabilir (TL / bin TL / mn TL)."""
    if not a or not b:
        return False
    for c in (1, 1e3, 1e6, 1e-3, 1e-6):
        if abs(a * c - b) <= tol * max(abs(b), 1):
            return True
    return False


def _konumlu(satir):
    """Satırdaki sayılar ve bitiş sütunları (pdftotext -layout sağa yaslı sütunlar için)."""
    out = []
    for m in SAYI.finditer(satir):
        t = m.group(0)
        if re.fullmatch(r'\(?\d{4}\)?', t) and 1990 < int(t.strip('()')) < 2100:
            continue
        try:
            out.append((sayi(t), m.end()))
        except ValueError:
            pass
    return out


def iki_sutun(metin, hasilat_c, hasilat_o):
    """Hasılat dipnotunda cari ve önceki dönem sütunlarını XBRL hasılat toplamlarıyla bulur, kira satırlarını bu iki sütundan okur.
    hasilat_c / hasilat_o rapor biriminde. Sütun eşlemesi karakter konumuyla yapılır; boş hücre ('-') sütun kaydırmaz.
    Dönüş: {'cari', 'onceki', 'satirlar', 'durum': bulundu|belirsiz|yok, 'not'}"""
    if not metin or not hasilat_c:
        return {'cari': None, 'onceki': None, 'satirlar': [], 'durum': 'yok', 'not': 'Metin ya da hasılat yok'}
    L = metin.split('\n')

    def esit(v, h):
        return h is not None and abs(abs(v) - abs(h)) <= max(1.0, 0.0005 * abs(h))

    adaylar = []
    for i, l in enumerate(L):
        if i < 120:
            continue
        nums = _konumlu(l)
        ic = next((p for v, p in nums if esit(v, hasilat_c)), None)
        if ic is None:
            continue
        io = next((p for v, p in nums if hasilat_o and esit(v, hasilat_o) and p != ic), None)
        kira = []
        for j in range(max(0, i - 40), min(len(L), i + 4)):
            s = L[j]
            if j == i or not KIRA.search(s) or HARIC.search(s) or not kisa_etiket(s):
                continue
            n = _konumlu(s)
            if not n:
                continue
            vc = next((v for v, p in n if abs(p - ic) <= 4), None)
            vo = next((v for v, p in n if io is not None and abs(p - io) <= 4), None)
            if vc is None and vo is None:
                # sütun konumu tutmadı (farklı sayfa düzeni) → sıra ile oku
                vc = n[0][0]
                vo = n[1][0] if len(n) > 1 and io is not None else None
                konum = False
            else:
                konum = True
            kira.append({'satir': j, 'metin': re.sub(r'\s{2,}', ' | ', s.strip())[:160], 'cari': abs(vc) if vc else 0.0,
                         'onceki': abs(vo) if vo else (0.0 if io is not None else None), 'konum': konum, 'toplam': bool(re.search(r'toplam', s, re.I))})
        if kira:
            adaylar.append((i, io is not None, kira))
    if not adaylar:
        return {'cari': None, 'onceki': None, 'satirlar': [], 'durum': 'yok', 'not': 'Hasılat toplamının geçtiği tabloda kira satırı yok'}
    # önceki dönem sütunu da bulunan ilk tablo tercih edilir
    adaylar.sort(key=lambda a: (not a[1], a[0]))
    i, onceki_var, kira = adaylar[0]
    tek = {}
    for a in kira:
        tek.setdefault(a['satir'], a)
    kira = sorted(tek.values(), key=lambda a: a['satir'])
    top = [a for a in kira if a['toplam']]
    grup = top[:1] if top else [a for a in kira if a['cari'] or a['onceki']]
    if not grup:
        return {'cari': 0.0, 'onceki': 0.0 if onceki_var else None, 'satirlar': kira, 'durum': 'belirsiz', 'not': 'Kira satırı var ama tutarı boş'}
    cari = sum(a['cari'] or 0 for a in grup)
    onceki = sum(a['onceki'] or 0 for a in grup) if onceki_var else None
    if cari > hasilat_c * 1.001 or (onceki is not None and hasilat_o and onceki > hasilat_o * 1.001):
        return {'cari': None, 'onceki': None, 'satirlar': grup, 'durum': 'yok', 'not': 'Okunan kira hasılattan büyük, atıldı'}
    durum = 'bulundu' if (len(grup) == 1 and all(a['konum'] for a in grup)) else 'belirsiz'
    nt = ('Toplam kira satırı' if top else ('Tek kira satırı' if len(grup) == 1 else f'{len(grup)} kira satırı toplandı; çift sayım kontrol edilmeli'))
    if not onceki_var:
        nt += '; önceki dönem sütunu hasılat toplamıyla eşlenemedi'
    if not all(a['konum'] for a in grup):
        nt += '; sütun konumu tutmadı, sırayla okundu'
        durum = 'belirsiz'
    return {'cari': cari, 'onceki': onceki, 'satirlar': grup, 'durum': durum, 'not': nt}


def dipnot(metin, hasilat=None):
    """İki yöntem: (A) HASILAT başlıklı dipnot bloğu, (B) XBRL hasılat toplamının geçtiği tablo. Uyuşursa 'bulundu'."""
    a = _baslikli(metin)
    b = _capali(metin, hasilat) if hasilat else None
    if a['tutar'] is not None and hasilat and a['tutar'] > hasilat * 1.001:
        a = {**a, 'tutar': None, 'durum': 'yok', 'not': a['not'] + ' (bulunan tutar hasılattan büyük, atıldı)'}
    if b is None or (b['tutar'] is None and b['durum'] == 'yok' and a['tutar'] is None):
        return {**a, 'yontem': 'A'}
    if a['tutar'] is not None and b['tutar'] is not None:
        if abs(a['tutar'] - b['tutar']) <= 0.002 * max(a['tutar'], 1):
            return {**a, 'durum': 'bulundu', 'yontem': 'A+B'}
        return {**a, 'durum': 'belirsiz', 'yontem': 'A≠B', 'not': f"İki okuma farklı: başlıklı dipnot {a['tutar']:,.0f}, hasılat tablosu {b['tutar']:,.0f}", 'alternatif': b['tutar']}
    if a['tutar'] is not None:
        return {**a, 'durum': 'belirsiz' if a['durum'] == 'belirsiz' else 'tek', 'yontem': 'A'}
    if b['tutar'] is not None:
        return {**b, 'durum': 'belirsiz' if b['durum'] == 'belirsiz' else 'tek', 'yontem': 'B'}
    return {'tutar': None, 'satirlar': [], 'durum': 'yok', 'not': b['not'], 'yontem': '-'}
