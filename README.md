# OSG15 Endeks Agent'ı

Osmanlı Portföy GYO 15 Endeksi için seçim taraması yapan, kaynağını gösteren ve onaylı karar hafızasıyla öğrenen agent.

## Ne yapar

- **Sıralama:** KAP'taki 54 GYO'yu kural setinden geçirir, havuzda kalanları 5 oranla puanlar, 15 endeks + 2 yedek seçer.
- **Kaynak izleme:** Tablodaki her sayıya tıklayınca hangi KAP bildiriminden, hangi XBRL kaleminden, hangi dönem sütunundan ve hangi formülle geldiği açılır. Sonraki aşamadaki chatbot bu ağacı okuyacak.
- **Karar hafızası:** Kira geliri tespiti gibi yorum gerektiren kararlar burada tutulur. Kalıcı kararlar ("hasılatın tamamı kira") sonraki raporlarda otomatik uygulanır; dönemlik kararlar için agent önceki dönemin oranından öneri getirir, onaylanınca kayda geçer.
- **Agent:** Hafta içi 09:15'te (ve "Agent'ı çalıştır" ile) KAP'ı tarar, yeni GYO raporlarını çekip işler, günlüğe yazar.

## Klasörler

| Yol | İçerik |
|---|---|
| `public/` | Site (statik). `lib/engine.mjs` hesap motoru tarayıcıda çalışır. |
| `public/data/seed.json` | Elle toplanan girdiler: fiyat, piyasa değeri, temettü, ilk kira tespitleri (11.11.2026) |
| `public/data/kaynak.json` | KAP'tan çekilen XBRL kalemlerinin kompakt hâli |
| `public/data/hafiza-baslangic.json` | Karar hafızasının ilk hâli |
| `lib/kap.mjs` | KAP arama ve bildirim ayrıştırma |
| `lib/agent.mjs` | Agent çekirdeği (adım adım çalışır, 30 sn fonksiyon sınırına sığar) |
| `netlify/functions/` | `durum`, `hafiza`, `agent-adim`, `agent-zamanli` |
| `netlify/edge-functions/auth.js` | Parola koruması |
| `scripts/` | Yerel araçlar: KAP önbelleğini doldurma, statik paket üretme, yerel çalıştırma |

## Tarihsel endeks hesabı (`endeks.html`)

Son 2 yılın 9 değerlemesi (Ara 2024 – Eyl 2026 + Aralık 2026 önizlemesi) kural setiyle yeniden yapılır ve endeks günlük olarak hesaplanır (TL ve USD getiri endeksi, baz 31.12.2024 = 1.000).
Sayfada grafik, tarihle arama (o gün geçerli dönem, üyeler, ağırlıklar, giren/çıkan), her değerlemenin seçim tablosu ve flag listesi var.

Veri hattı Python'dur (`scripts/tarihsel/`), önbellek `data/cache/tarihsel/` altında tutulur (git'e girmez):

```bash
python3 scripts/tarihsel/fetch.py search   # KAP FR + ODA bildirim aramaları (2024'ten bugüne)
python3 scripts/tarihsel/fetch.py prices   # İş Yatırım günlük fiyat, PD, halka açık PD, USD, BIST 100
python3 scripts/tarihsel/katalog.py        # aramalardan GYO finansal rapor / faaliyet raporu kataloğu + idx.txt
cat data/cache/tarihsel/idx.txt | xargs -P 6 -n 10 python3 scripts/tarihsel/kap_parse.py   # rapor sayfaları → XBRL
python3 scripts/tarihsel/temettu.py        # KAP kâr payı kararları + İş Yatırım ödemeleri
python3 scripts/tarihsel/pdf.py            # seçilen raporların dipnot PDF'leri ve aynı dönem faaliyet raporları → metin
python3 scripts/tarihsel/build.py          # seçimler + endeks → public/data/tarihsel.json
```

| Dosya | İş |
|---|---|
| `ortak.py` | Rapor kataloğu, değerleme günü itibarıyla rapor seçimi, XBRL okuma |
| `kira.py` | Kira gelirini dipnottan iki yöntemle okur (HASILAT başlıklı not, XBRL hasılat toplamının geçtiği tablo); faaliyet raporunda teyit arar |
| `temettu.py` | Kâr payı kararları (genel kurul tarihi, 1 TL nominal başına brüt, taksitler, avans) |
| `build.py` | LTM FAVÖK (TÜFE katsayıları raporlardan türetilir), seçim, puanlama, ağırlık (%3–%13), getiri endeksi, olaylar ve flag'ler |

## Veri tablosu (`veri.html`)

54 şirketin en son raporundan **toplam varlıklar, hasılat, kira geliri, FAVÖK**; hasılat, kira ve FAVÖK hem rapor dönemi hem **son 12 ay** olarak.
Sayfada Excel (`public/data/OSG15_GYO_Veri.xlsx`: Veri, 12 ay köprüsü (formüllü), Flagler, Açıklama) ve CSV (`;` ayraç, `,` ondalık) indirme düğmeleri var.

```bash
python3 scripts/tarihsel/veri.py indir    # gereken dipnot ve faaliyet raporu PDF'lerini çeker, veri.json + xlsx + csv üretir
```

- 12 ay = dönem + son yıllık rapor × TÜFE katsayısı − önceki yılın aynı dönemi (son rapordaki karşılaştırmalı sütun).
- Kira: hasılat dipnotundan iki sütunlu otomatik okuma (`kira.iki_sutun`), faaliyet raporunda teyit; dipnotta açık satır yoksa karar hafızası.
- `data/kira-elle.json`: otomatik okumanın yetmediği yerlerde (çok satırlı/bölümlü tablolar, taranmış PDF → OCR, faaliyet raporu tabloları) elle kontrol edilmiş tutarlar ve kaynak satırları.
- Kira tespiti: **Doğrudan** (dipnotta açık kira satırı), **Yorum** (kalemden çıkarım), **Tahmini** (oranla ya da yıllıklandırma). Doğrudan olmayanlar "Kira flag".

Flag türleri: **Doğrulanamadı** (veri iki kaynakta teyit edilemedi), **Çelişki** (iki kaynak farklı), **Tahmini**, **Çıkarım** (karar hafızasından), **Teyitli**. Endeks/yedek sınırındaki teyitsiz veriler "kritik" olarak grafikte de gösterilir.

## Son 12 / 6 / 3 ay sıralaması

Sıralama sayfasında üç sekme var: **12 aylık**, **6 aylık**, **3 aylık**. Pencere yalnızca akım kalemlerini (FAVÖK, hasılat, kira geliri) değiştirir; bilanço, piyasa değeri ve temettü aynı kalır.

- 12 ay = cari dönem + son yıllık × TÜFE katsayısı − önceki yıl aynı dönem.
- 6 ay = son rapor − aynı yılın 3 aylık ara raporu × TÜFE katsayısı; 3 ay = son rapor − 6 aylık ara rapor × TÜFE katsayısı. Katsayı ara rapor dönem sonundan son rapor dönem sonuna (`build.TUFE_L`).
- Kira/Varlık ve FAVÖK/FD için 6 ve 3 aylık tutarlar × 12/ay ile yıllığa çevrilir; Kira/Hasılat çevrilmez.
- Ara rapordaki kira dipnottan okunur; elle kontrol edilenler `data/kira-elle.json` içinde `rapor3` / `rapor6` anahtarlarıyla.
- Köprüler `veri.json` satırlarında `pencere["6"]`, `pencere["3"]`; motor `public/lib/engine.mjs` (`pencereHesapla`).
- Excel: `OSG15_GYO_Veri.xlsx` (6 ay ve 3 ay köprüsü sayfaları) ve `OSG15_Siralama.xlsx` (Endeks 12/6/3 ay + Karşılaştırma):

```bash
python3 scripts/tarihsel/veri.py indir
node scripts/siralama.mjs && python3 scripts/tarihsel/siralama_excel.py
```

## Netlify kurulumu

1. Bu repoyu Netlify'da **Add new site → Import an existing project** ile bağla. Build command boş, publish `public` (netlify.toml'da tanımlı).
2. **Site configuration → Environment variables** altına `SITE_PASSWORD` ekle. Site açılırken kullanıcı adı serbest, parola bu.
3. Deploy et. Durum (karar hafızası, günlük, agent'ın çektiği yeni raporlar) Netlify Blobs'ta tutulur, ek kurulum gerekmez.

## Yerel çalıştırma

```bash
npm install
npm run fetch          # seed'deki KAP bildirimlerini data/cache'e çeker
npm run build-static   # public/data/kaynak.json ve hafiza-baslangic.json üretir
npm run run-local      # sıralamayı terminale yazar
```

## Bilinen sınırlar (1. aşama)

- Fiyat, piyasa değeri ve temettü 11.11.2026 tarihli; agent bunları henüz güncellemiyor. Değerleme gününde (14.12.2026) güncellenmeli.
- Yeni dönem kira tutarı dipnot PDF'inden otomatik okunmuyor; agent önceki dönem oranıyla öneri getiriyor, onay bekliyor.
- KAP'ın Netlify (AWS) IP'lerinden gelen istekleri engelleyip engellemediği canlıda test edilecek. Engellerse agent günlüğe "Agent durdu" yazar; o durumda `scripts/` ile yerelde çalıştırılır.
