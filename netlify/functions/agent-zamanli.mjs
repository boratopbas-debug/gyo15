// Hafta içi her sabah 09:15 (İstanbul) agent'ı çalıştırır. Kuyruk uzunsa sonraki adımları
// sayfadaki "Agent'ı çalıştır" düğmesi ya da ertesi zamanlanmış çalışma tamamlar.
import { adim } from '../../lib/agent.mjs';
export default async () => { await adim(22000); };
export const config = { schedule: '15 6 * * 1-5' };
