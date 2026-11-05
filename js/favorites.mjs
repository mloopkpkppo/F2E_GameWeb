import { catalog } from './catalog.js';

const favoriteIds = new Set(catalog.map((game) => game.id));
const favoriteJSON = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });

export function createFavoritesStore(db, local = false) {
  if (!db) return null;
  const insert = 'INSERT OR IGNORE INTO user_favorites (steamid,appid) VALUES (?,?)';
  return {
    async list(steamid) {
      const sql = 'SELECT appid FROM user_favorites WHERE steamid = ? ORDER BY appid';
      const rows = local
        ? db.prepare(sql).all(steamid)
        : (await db.prepare(sql).bind(steamid).all()).results;
      return rows.map((row) => row.appid);
    },
    async change(steamid, appid, saved) {
      const sql = saved ? insert : 'DELETE FROM user_favorites WHERE steamid = ? AND appid = ?';
      if (local) db.prepare(sql).run(steamid, appid);
      else await db.prepare(sql).bind(steamid, appid).run();
    },
    async import(steamid, ids) {
      if (!ids.length) return;
      if (!local) {
        await db.batch(ids.map((id) => db.prepare(insert).bind(steamid, id)));
        return;
      }
      db.exec('BEGIN');
      try {
        const statement = db.prepare(insert);
        for (const id of ids) statement.run(steamid, id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

async function favoriteBody(request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') throw Error();
  const reader = request.body?.getReader();
  if (!reader) throw Error();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 4096) {
      await reader.cancel();
      throw Error();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

export async function handleFavorites(request, env, user) {
  if (!user) return favoriteJSON({ error: '請先登入 Steam。' }, 401);
  const path = new URL(request.url).pathname;
  const method = request.method;
  const reading = path === '/api/me/favorites' && method === 'GET';
  const changing = path === '/api/me/favorites' && method === 'PUT';
  const importing = path === '/api/me/favorites/import' && method === 'POST';
  if (!reading && !changing && !importing) return favoriteJSON({ error: '不支援的操作。' }, 405);
  if (!reading && request.headers.get('Origin') !== env.SITE_ORIGIN) {
    return favoriteJSON({ error: '無效的請求來源。' }, 403);
  }
  if (!env.favoritesStore) return favoriteJSON({ error: '帳號收藏暫時無法使用。' }, 503);
  let body;
  if (!reading) {
    try {
      body = await favoriteBody(request);
      const expected = importing ? ['ids'] : ['appid', 'saved'];
      if (
        !body ||
        typeof body !== 'object' ||
        Object.keys(body).some((key) => !expected.includes(key))
      )
        throw Error();
      if (importing) {
        if (
          !Array.isArray(body.ids) ||
          body.ids.length > favoriteIds.size ||
          body.ids.some((id) => !Number.isSafeInteger(id) || !favoriteIds.has(id))
        )
          throw Error();
      } else if (
        !Number.isSafeInteger(body.appid) ||
        !favoriteIds.has(body.appid) ||
        typeof body.saved !== 'boolean'
      )
        throw Error();
    } catch {
      return favoriteJSON({ error: '無效的收藏資料。' }, 400);
    }
  }
  try {
    if (changing) await env.favoritesStore.change(user.steamid, body.appid, body.saved);
    if (importing) await env.favoritesStore.import(user.steamid, [...new Set(body.ids)]);
    return favoriteJSON({
      steamid: user.steamid,
      ids: await env.favoritesStore.list(user.steamid),
    });
  } catch {
    return favoriteJSON({ error: '收藏同步失敗，請稍後再試。' }, 503);
  }
}
