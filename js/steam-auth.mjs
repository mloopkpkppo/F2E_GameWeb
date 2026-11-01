const OPENID = 'https://steamcommunity.com/openid/login';
const NS = 'http://specs.openid.net/auth/2.0';
const encoder = new TextEncoder();
const noStore = {
  'Cache-Control': 'no-store, private',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
};
const authJSON = (value, status = 200) => Response.json(value, { status, headers: noStore });
const b64 = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
function bytes(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
async function key(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export async function signToken(payload, secret) {
  const body = b64(encoder.encode(JSON.stringify(payload)));
  return (
    body +
    '.' +
    b64(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body))))
  );
}
export async function verifyToken(token, secret, origin, kind, now = Date.now()) {
  try {
    if (!token || token.length > 2500 || !secret) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await key(secret),
        bytes(parts[1]),
        encoder.encode(parts[0]),
      ))
    )
      return null;
    const p = JSON.parse(new TextDecoder().decode(bytes(parts[0])));
    return p.origin === origin && p.kind === kind && Number.isFinite(p.exp) && p.exp > now
      ? p
      : null;
  } catch {
    return null;
  }
}
function names(origin) {
  return new URL(origin).protocol === 'https:'
    ? { state: '__Host-pq_steam_state', session: '__Host-pq_steam_session' }
    : { state: 'pq_dev_steam_state', session: 'pq_dev_steam_session' };
}
function cookie(name, value, origin, age) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${origin.startsWith('https:') ? '; Secure' : ''}`;
}
function readCookie(request, name) {
  return (
    (request.headers.get('cookie') || '')
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + '='))
      ?.slice(name.length + 1) || ''
  );
}
const callback = (origin, state) =>
  origin + '/auth/steam/return?state=' + encodeURIComponent(state);
function redirect(location, cookies = []) {
  const headers = new Headers({ ...noStore, Location: location, 'Referrer-Policy': 'no-referrer' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 303, headers });
}
function safeAvatar(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.steamstatic.com') ? u.href : null;
  } catch {
    return null;
  }
}
export function validateAssertion(params, origin, state, now = Date.now()) {
  for (const k of new Set(params.keys()))
    if (params.getAll(k).length !== 1) throw Error('duplicate');
  if (
    params.get('openid.ns') !== NS ||
    params.get('openid.mode') !== 'id_res' ||
    params.get('openid.op_endpoint') !== OPENID
  )
    throw Error('provider');
  const identity = params.get('openid.claimed_id') || '';
  const match = identity.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  if (!match || params.get('openid.identity') !== identity) throw Error('identity');
  if (params.get('openid.return_to') !== callback(origin, state)) throw Error('return');
  const signed = new Set((params.get('openid.signed') || '').split(','));
  for (const field of [
    'op_endpoint',
    'claimed_id',
    'identity',
    'return_to',
    'response_nonce',
    'assoc_handle',
  ])
    if (!signed.has(field)) throw Error('unsigned');
  const nonce = params.get('openid.response_nonce') || '';
  const stamp = Date.parse(nonce.slice(0, 20));
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ.+$/.test(nonce) ||
    !Number.isFinite(stamp) ||
    Math.abs(now - stamp) > 300000
  )
    throw Error('expired');
  return match[1];
}
export async function handleSteamAuth(request, env) {
  const url = new URL(request.url),
    path = url.pathname;
  if (!path.startsWith('/auth/steam') && !path.startsWith('/api/me')) return null;
  const origin = env.SITE_ORIGIN;
  if (path === '/auth/steam/config' && request.method === 'GET')
    return authJSON({
      loginReady:
        !!origin &&
        url.origin === origin &&
        !!env.SESSION_SECRET &&
        env.SESSION_SECRET.length >= 32 &&
        !!env.claimLogin,
      profileReady: !!env.STEAM_API_KEY,
    });
  if (!origin || url.origin !== origin || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32)
    return authJSON({ error: 'Steam 登入尚未完成網站設定。' }, 503);
  const n = names(origin),
    secret = env.SESSION_SECRET;
  const session = await verifyToken(readCookie(request, n.session), secret, origin, 'session');
  const user = session && /^\d{17}$/.test(session.steamid) ? session : null;
  if (path === '/auth/steam' && request.method === 'GET') {
    if (!env.claimLogin) return authJSON({ error: '登入驗證儲存空間尚未設定。' }, 503);
    const state = crypto.randomUUID();
    const stateToken = await signToken(
      { kind: 'state', origin, nonce: state, exp: Date.now() + 600000 },
      secret,
    );
    const params = new URLSearchParams({
      'openid.ns': NS,
      'openid.mode': 'checkid_setup',
      'openid.return_to': callback(origin, state),
      'openid.realm': origin + '/',
      'openid.identity': NS + '/identifier_select',
      'openid.claimed_id': NS + '/identifier_select',
    });
    return redirect(OPENID + '?' + params, [cookie(n.state, stateToken, origin, 600)]);
  }
  if (path === '/auth/steam/return' && request.method === 'GET') {
    const clear = cookie(n.state, '', origin, 0);
    if (url.searchParams.get('openid.mode') === 'cancel')
      return redirect('/account?steam_login=cancelled', [clear]);
    let failure = 'state_missing';
    try {
      const stateCookie = readCookie(request, n.state);
      if (!stateCookie) throw Error();
      failure = 'state_invalid';
      const state = await verifyToken(stateCookie, secret, origin, 'state');
      if (!state) throw Error();
      failure = 'state_mismatch';
      if (state.nonce !== url.searchParams.get('state')) throw Error();
      failure = 'assertion_invalid';
      const steamid = validateAssertion(url.searchParams, origin, state.nonce);
      const params = new URLSearchParams(
        [...url.searchParams].filter(([k]) => k.startsWith('openid.')),
      );
      params.set('openid.mode', 'check_authentication');
      failure = 'steam_unavailable';
      const verified = await fetch(OPENID, {
        method: 'POST',
        body: params,
        signal: AbortSignal.timeout(10000),
        // Workers 不支援 error；manual 搭配下方狀態檢查，仍拒絕所有轉址。
        redirect: 'manual',
      });
      if (!verified.ok) throw Error();
      const verification = await verified.text();
      failure = 'steam_rejected';
      if (!/^is_valid:true\r?$/m.test(verification)) throw Error();
      // 持久儲存保證同一登入回呼只能使用一次，跨伺服器也不會重播。
      failure = 'storage_unavailable';
      if (!env.claimLogin) throw Error();
      const claimed = await env.claimLogin(state.nonce, Date.now() + 600000);
      failure = 'callback_used';
      if (!claimed) throw Error();
      failure = 'session_failed';
      const token = await signToken(
        { kind: 'session', origin, steamid, exp: Date.now() + 8 * 3600000 },
        secret,
      );
      return redirect('/account?steam_login=success', [
        clear,
        cookie(n.session, token, origin, 8 * 3600),
      ]);
    } catch {
      const reference = crypto.randomUUID();
      // 僅記錄步驟與查詢編號，避免把 Cookie、簽章或使用者資料寫入紀錄。
      console.warn(JSON.stringify({ event: 'steam_login_failed', reason: failure, reference }));
      return redirect(
        '/account?' +
          new URLSearchParams({ steam_login: 'failed', reason: failure, ref: reference }),
        [clear],
      );
    }
  }
  if (path === '/auth/steam/logout' && request.method === 'POST') {
    if (request.headers.get('origin') !== origin) return authJSON({ error: '無效的請求來源' }, 403);
    return redirect('/account', [cookie(n.session, '', origin, 0), cookie(n.state, '', origin, 0)]);
  }
  if (path === '/api/me' && request.method === 'GET') {
    if (!user) return authJSON({ authenticated: false });
    const basic = {
      steamid: user.steamid,
      profileUrl: 'https://steamcommunity.com/profiles/' + user.steamid + '/',
    };
    if (!env.STEAM_API_KEY)
      return authJSON({ authenticated: true, user: basic, profileStatus: 'key_required' });
    try {
      const response = await fetch(
        'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?' +
          new URLSearchParams({ key: env.STEAM_API_KEY, steamids: user.steamid }),
        { signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) throw Error();
      const p = (await response.json()).response?.players?.find((p) => p.steamid === user.steamid);
      if (!p) throw Error();
      return authJSON({
        authenticated: true,
        user: {
          ...basic,
          name: String(p.personaname || 'Steam 玩家').slice(0, 100),
          avatar: safeAvatar(p.avatarfull),
          visibility: p.communityvisibilitystate === 3 ? 'public' : 'limited',
        },
        profileStatus: 'ok',
      });
    } catch {
      return authJSON({ authenticated: true, user: basic, profileStatus: 'unavailable' });
    }
  }
  if (path === '/api/me/games' && request.method === 'GET') {
    if (!user) return authJSON({ error: '請先使用 Steam 登入' }, 401);
    if (!env.STEAM_API_KEY)
      return authJSON(
        { error: '網站管理者尚未設定 Steam Web API Key。', status: 'key_required' },
        503,
      );
    try {
      const r = await fetch(
        'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?' +
          new URLSearchParams({
            key: env.STEAM_API_KEY,
            steamid: user.steamid,
            include_appinfo: '1',
            include_played_free_games: '1',
          }),
        { signal: AbortSignal.timeout(12000) },
      );
      if (!r.ok) throw Error();
      const d = (await r.json()).response;
      if (!d || !Number.isFinite(d.game_count))
        return authJSON({
          status: 'unavailable',
          games: null,
          message: 'Steam 沒有提供遊戲庫資料，可能是遊戲詳細資料未公開。登入不會繞過隱私設定。',
        });
      return authJSON({
        status: 'ok',
        count: d.game_count,
        games: (d.games || [])
          .filter((g) => Number.isInteger(g.appid) && g.appid > 0)
          .map((g) => ({
            id: g.appid,
            name: String(g.name || 'Steam 遊戲').slice(0, 150),
            minutes: Number.isFinite(g.playtime_forever) ? g.playtime_forever : 0,
          }))
          .sort((a, b) => b.minutes - a.minutes),
      });
    } catch {
      return authJSON(
        { status: 'unavailable', error: 'Steam 遊戲庫暫時無法取得，請稍後重試。' },
        502,
      );
    }
  }
  return authJSON({ error: '找不到此操作' }, 404);
}
