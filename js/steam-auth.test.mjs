import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSteamAuth, signToken, verifyToken, validateAssertion } from './steam-auth.mjs';
const origin = 'https://pixel.test',
  secret = 'test-only-secret-that-is-long-enough-to-sign',
  steamid = '76561198000000000';
function environment() {
  const used = new Set();
  return {
    SITE_ORIGIN: origin,
    SESSION_SECRET: secret,
    claimLogin: async (id) => {
      if (used.has(id)) return false;
      used.add(id);
      return true;
    },
  };
}
function assertion(state) {
  return new URLSearchParams({
    state: state,
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.identity': 'https://steamcommunity.com/openid/id/' + steamid,
    'openid.claimed_id': 'https://steamcommunity.com/openid/id/' + steamid,
    'openid.return_to': origin + '/auth/steam/return?state=' + state,
    'openid.response_nonce': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') + 'nonce',
    'openid.assoc_handle': 'test-association',
    'openid.signed': 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'test-signature',
  });
}
async function loginStart(env) {
  const r = await handleSteamAuth(new Request(origin + '/auth/steam'), env);
  const u = new URL(r.headers.get('location'));
  return {
    r,
    state: new URL(u.searchParams.get('openid.return_to')).searchParams.get('state'),
    cookie: r.headers.getSetCookie()[0].split(';')[0],
  };
}
test('signed sessions reject tampering, expired values, other sites and state tokens', async () => {
  const token = await signToken(
    { kind: 'session', origin, steamid, exp: Date.now() + 10000 },
    secret,
  );
  assert.equal((await verifyToken(token, secret, origin, 'session')).steamid, steamid);
  assert.equal(await verifyToken(token + 'x', secret, origin, 'session'), null);
  assert.equal(await verifyToken(token, secret, 'https://evil.test', 'session'), null);
  assert.equal(await verifyToken(token, secret, origin, 'state'), null);
  assert.equal(await verifyToken(token, secret, origin, 'session', Date.now() + 20000), null);
});
test('anonymous users can check setup; library requires identity and profile responses are private', async () => {
  const env = environment();
  const config = await handleSteamAuth(new Request(origin + '/auth/steam/config'), env);
  assert.deepEqual(await config.json(), { loginReady: true, profileReady: false });
  assert.equal((await handleSteamAuth(new Request(origin + '/api/me/games'), env)).status, 401);
  const me = await handleSteamAuth(new Request(origin + '/api/me'), env);
  assert.deepEqual(await me.json(), { authenticated: false });
  assert.match(me.headers.get('cache-control'), /no-store/);
  assert.equal(
    (await handleSteamAuth(new Request(origin + '/auth/steam'), { ...env, claimLogin: null }))
      .status,
    503,
  );
});
test('login uses the official Steam endpoint and a secure HttpOnly state cookie', async () => {
  const { r } = await loginStart(environment());
  const u = new URL(r.headers.get('location'));
  assert.equal(u.origin, 'https://steamcommunity.com');
  assert.equal(u.pathname, '/openid/login');
  assert.equal(u.searchParams.get('openid.mode'), 'checkid_setup');
  const c = r.headers.getSetCookie()[0];
  assert.match(c, /^__Host-pq_steam_state=/);
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /; Secure/);
  assert.doesNotMatch(c, /Domain=/);
});
test('assertions reject spoofed providers, unsigned fields, return URL changes, duplicate values and stale nonces', () => {
  const state = 'example';
  assert.equal(validateAssertion(assertion(state), origin, state), steamid);
  for (const [field, value] of [
    ['openid.op_endpoint', 'https://evil.test'],
    ['openid.return_to', 'https://evil.test'],
    ['openid.identity', 'https://steamcommunity.com/openid/id/76561198000000001'],
    ['openid.signed', 'identity'],
    ['openid.response_nonce', '2020-01-01T00:00:00Zold'],
  ]) {
    const a = assertion(state);
    a.set(field, value);
    assert.throws(() => validateAssertion(a, origin, state));
  }
  const duplicate = assertion(state);
  duplicate.append('state', state);
  assert.throws(() => validateAssertion(duplicate, origin, state));
});
test('verified login issues a session; the same callback cannot be replayed; failed verification never issues a session', async () => {
  const old = globalThis.fetch;
  const env = environment();
  const { state, cookie } = await loginStart(env);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://steamcommunity.com/openid/login');
    assert.equal(options.body.get('openid.mode'), 'check_authentication');
    return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
  };
  try {
    const req = () =>
      new Request(origin + '/auth/steam/return?' + assertion(state), { headers: { cookie } });
    const ok = await handleSteamAuth(req(), env);
    assert.equal(ok.headers.get('location'), '/account?steam_login=success');
    assert.equal(ok.headers.getSetCookie().length, 2);
    const sessionCookie = ok.headers
      .getSetCookie()
      .find((c) => c.startsWith('__Host-pq_steam_session='))
      .split(';')[0];
    const me = await handleSteamAuth(
      new Request(origin + '/api/me', { headers: { cookie: sessionCookie } }),
      env,
    );
    const d = await me.json();
    assert.equal(d.authenticated, true);
    assert.equal(d.user.steamid, steamid);
    assert.equal(d.profileStatus, 'key_required');
    const replay = await handleSteamAuth(req(), env);
    assert.match(replay.headers.get('location'), /failed/);
    assert.equal(replay.headers.getSetCookie().length, 1);
    globalThis.fetch = async () => new Response('is_valid:false\n');
    const failed = await handleSteamAuth(req(), env);
    assert.match(failed.headers.get('location'), /failed/);
    const noCookie = await handleSteamAuth(
      new Request(origin + '/auth/steam/return?' + assertion(state)),
      env,
    );
    assert.match(noCookie.headers.get('location'), /failed/);
  } finally {
    globalThis.fetch = old;
  }
});
test('only the current verified account is queried; private library is not reported as empty; logout is same-origin POST', async () => {
  const old = globalThis.fetch;
  const env = { ...environment(), STEAM_API_KEY: 'test-key-not-real' };
  const token = await signToken(
    { kind: 'session', origin, steamid, exp: Date.now() + 10000 },
    secret,
  );
  const cookie = '__Host-pq_steam_session=' + token;
  let response = { response: {} };
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    assert.equal(u.searchParams.get('steamid'), steamid);
    return Response.json(response);
  };
  try {
    const req = () =>
      new Request(origin + '/api/me/games?steamid=76561198000000001', { headers: { cookie } });
    const privateData = await handleSteamAuth(req(), env);
    assert.equal((await privateData.json()).games, null);
    assert.match(privateData.headers.get('cache-control'), /no-store/);
    response = { response: { game_count: 0 } };
    assert.deepEqual((await (await handleSteamAuth(req(), env)).json()).games, []);
    response = {
      response: {
        game_count: 1,
        games: [{ appid: 413150, name: 'Stardew Valley', playtime_forever: 120 }],
      },
    };
    const visible = await (await handleSteamAuth(req(), env)).json();
    assert.equal(visible.games[0].minutes, 120);
    assert.ok(!JSON.stringify(visible).includes('test-key'));
    const csrf = await handleSteamAuth(
      new Request(origin + '/auth/steam/logout', {
        method: 'POST',
        headers: { origin: 'https://evil.test', cookie },
      }),
      env,
    );
    assert.equal(csrf.status, 403);
    const logout = await handleSteamAuth(
      new Request(origin + '/auth/steam/logout', { method: 'POST', headers: { origin, cookie } }),
      env,
    );
    assert.equal(logout.status, 303);
    assert.ok(logout.headers.getSetCookie().every((c) => c.includes('Max-Age=0')));
  } finally {
    globalThis.fetch = old;
  }
});
