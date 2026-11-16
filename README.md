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
