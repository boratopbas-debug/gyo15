// POST /api/agent-adim — agent'ın bir adımını çalıştırır (≈20 sn). Tarayıcı kuyruk bitene kadar tekrar çağırır.
import { adim } from '../../lib/agent.mjs';
import { json } from '../../lib/store.mjs';
export default async (req) => {
  if (req.method !== 'POST') return json({ hata: 'POST bekleniyor' }, 405);
  return json(await adim(20000));
};
