// GET /api/durum → tarayıcının hesap için ihtiyaç duyduğu tüm değişken durum.
import { hafizaOku, gunlukOku, guncelOku, kaynakEkOku, oku, json } from '../../lib/store.mjs';
export default async () => {
  const [hafiza, gunluk, guncel, kaynakEk, agent] = await Promise.all([hafizaOku(), gunlukOku(), guncelOku(), kaynakEkOku(), oku('agent-durum', { calisiyor: false })]);
  return json({ hafiza, gunluk: gunluk.slice(0, 200), guncel, kaynakEk, agent });
};
