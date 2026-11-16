// Basit parola koruması: Netlify ortam değişkeni SITE_PASSWORD. Kullanıcı adı serbest.
export default async (request, context) => {
  const parola = Netlify.env.get('SITE_PASSWORD');
  if (!parola) return new Response('SITE_PASSWORD ortam değişkeni tanımlı değil.', { status: 503 });
  const h = request.headers.get('authorization') || '';
  if (h.startsWith('Basic ')) {
    const [, p] = atob(h.slice(6)).split(':');
    if (p === parola) return context.next();
  }
  return new Response('Giriş gerekli', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="OSG15", charset="UTF-8"' } });
};
