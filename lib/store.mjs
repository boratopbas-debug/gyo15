// Netlify Blobs üzerinde kalıcı durum: karar hafızası, agent günlüğü, yeni çekilen KAP kaynakları, güncel rapor eşlemesi.
import { getStore } from '@netlify/blobs';
import fs from 'node:fs';
import path from 'node:path';

const store = () => getStore({ name: 'osg15', consistency: 'strong' });

function dosya(ad) {
  const adaylar = [path.join(process.cwd(), 'public/data', ad), path.join(process.env.LAMBDA_TASK_ROOT || '', 'public/data', ad)];
  for (const p of adaylar) if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  throw new Error(`${ad} bulunamadı`);
}
export const seed = () => dosya('seed.json');
export const kaynakStatik = () => dosya('kaynak.json');

export async function oku(anahtar, varsayilan) {
  const v = await store().get(anahtar, { type: 'json' });
  return v ?? (typeof varsayilan === 'function' ? varsayilan() : varsayilan);
}
export async function yaz(anahtar, deger) { await store().setJSON(anahtar, deger); }

export const hafizaOku = () => oku('hafiza', () => dosya('hafiza-baslangic.json'));
export const gunlukOku = () => oku('gunluk', []);
export const guncelOku = () => oku('guncel', {});        // kod → { kap, fy, ay, kf?, donem, ruleType, year }
export const kaynakEkOku = () => oku('kaynak-ek', {});   // bildirim idx → kompakt bildirim

export async function gunlugeEkle(kayit) {
  const g = await gunlukOku();
  g.unshift({ zaman: new Date().toISOString(), ...kayit });
  await yaz('gunluk', g.slice(0, 500));
}

export const json = (veri, durum = 200) => new Response(JSON.stringify(veri), { status: durum, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
