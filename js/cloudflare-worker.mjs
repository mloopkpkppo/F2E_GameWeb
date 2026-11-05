import { createHandler } from './api.mjs';

export async function serveCloudflare(request, env, app) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const publicAPI = url.pathname === '/api/catalog' || /^\/api\/game\/\d+$/.test(url.pathname);
  if (origin && origin !== url.origin && (!publicAPI || origin !== env.FRONTEND_ORIGIN)) {
    return new Response('Forbidden', { status: 403 });
  }
  if (request.method === 'OPTIONS') {
    if (!publicAPI || origin !== env.FRONTEND_ORIGIN) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      },
    });
  }
  const handler = createHandler(async (path) => {
    const assetURL = new URL(path, url.origin);
    const asset = await env.ASSETS.fetch(new Request(assetURL));
    if (!asset.ok) return null;
    return { body: asset.body, type: asset.headers.get('Content-Type') };
  });
  const claimLogin = env.DB
    ? async (nonce, expires) => {
        await env.DB.prepare('DELETE FROM steam_login_nonces WHERE expires < ?')
          .bind(Date.now())
          .run();
        const result = await env.DB.prepare(
          'INSERT OR IGNORE INTO steam_login_nonces (nonce,expires) VALUES (?,?)',
        )
          .bind(nonce, expires)
          .run();
        return result.meta.changes === 1;
      }
    : null;
  const runtime = { ...env, claimLogin, SITE_ORIGIN: env.SITE_ORIGIN || url.origin };
  const response = app ? await app.fetch(request, runtime) : await handler(request, runtime);
  const headers = new Headers(response.headers);
  if (publicAPI && origin === env.FRONTEND_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.append('Vary', 'Origin');
  }
  if (env.FRONTEND_URL && headers.get('Content-Type')?.includes('text/html')) {
    const html = (await response.text()).replace(
      /href="\/(games|indie|minigames|deals)?([?#][^"]*)?"/g,
      (_, page, query = '') => `href="${env.FRONTEND_URL}${page ? page + '/' : ''}${query}"`,
    );
    return new Response(html, { status: response.status, headers });
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  fetch(request, env) {
    return serveCloudflare(request, env);
  },
};
