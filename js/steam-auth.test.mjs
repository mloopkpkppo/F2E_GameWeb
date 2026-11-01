import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleSteamAuth,
  signToken,
  verifyToken,
  validateAssertion,
  summarizeLibraryPrices,
} from './steam-auth.mjs';
const origin = 'https://pixel.test',
  secret = 'test-only-secret-that-is-long-enough-to-sign',
  steamid = '76561198000000000';
test('library valuation sums only valid TWD minor-unit prices and reports missing quotes', () => {
  const quote = (currency, final) => ({
    success: true,
    data: { price_overview: { currency, final } },
  });
  assert.deepEqual(
    summarizeLibraryPrices([1, 2, 3, 4, 5, 6, 7], {
      1: quote('TWD', 12345),
      2: quote('TWD', 0),
      3: quote('USD', 500),
      4: { success: true, data: [] },
      5: quote('TWD', -1),
      6: quote('TWD', 1.5),
    }),
    { total: 12345, priced: 2, unpriced: 5, currency: 'TWD' },
  );
});

test('valuation requires login and prices only a bounded batch of the signed-in library', async () => {
  const env = { ...environment(), STEAM_API_KEY: 'test-key-not-real' };
  assert.equal(
    (await handleSteamAuth(new Request(origin + '/api/me/games/value'), env)).status,
    401,
  );
  const token = await signToken(
    { kind: 'session', origin, steamid, exp: Date.now() + 10000 },
    secret,
  );
  const cookie = '__Host-pq_steam_session=' + token;
  const old = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url, options) => {
    const u = new URL(url);
    if (u.hostname === 'api.steampowered.com') {
      assert.equal(u.searchParams.get('steamid'), steamid);
      return Response.json({
        response: {
          game_count: 51,
          games: Array.from({ length: 51 }, (_, i) => ({
            appid: i + 1,
            name: 'Game',
            playtime_forever: i === 0 ? -10 : 60,
          })),
        },
      });
    }
    assert.equal(u.hostname, 'store.steampowered.com');
    assert.equal(u.searchParams.get('cc'), 'tw');
    assert.equal(u.searchParams.get('filters'), 'price_overview');
    assert.equal(options.redirect, 'manual');
    const ids = u.searchParams.get('appids').split(',').map(Number);
    assert.ok(ids.length <= 50);
    requested.push(...ids);
    return Response.json(
      Object.fromEntries(
        ids.map((id) => [
          id,
          { success: true, data: { price_overview: { currency: 'TWD', final: 10000 } } },
        ]),
      ),
    );
  };
  try {
    const req = (offset) =>
      new Request(
        origin + '/api/me/games/value?offset=' + offset + '&steamid=76561198000000001&appids=999',
        { headers: { cookie } },
      );
    const first = await handleSteamAuth(req(0), env);
    assert.match(first.headers.get('cache-control'), /no-store/);
    const batch1 = await first.json();
    assert.equal(batch1.total, 500000);
    assert.equal(batch1.nextOffset, 50);
    const batch2 = await (await handleSteamAuth(req(50), env)).json();
    assert.equal(batch2.total, 10000);
    assert.equal(batch2.nextOffset, null);
    assert.equal(new Set(requested).size, 51);
    assert.ok(!requested.includes(999));
    assert.equal((await handleSteamAuth(req('-1'), env)).status, 400);
    globalThis.fetch = async () => Response.json({ response: {} });
    assert.equal((await (await handleSteamAuth(req(0), env)).json()).games, null);
  } finally {
    globalThis.fetch = old;
  }
});
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
    assert.equal(options.redirect, 'manual');
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

test('callback failures identify the step without logging cookies, identity or assertions', async () => {
  const env = environment();
  const { state, cookie } = await loginStart(env);
  const oldFetch = globalThis.fetch;
  const oldWarn = console.warn;
  const logs = [];
  console.warn = (message) => logs.push(JSON.parse(message));
  globalThis.fetch = async () => new Response('is_valid:true\n');
  const cases = [
    { cookie: '', reason: 'state_missing' },
    { cookie: '__Host-pq_steam_state=broken', reason: 'state_invalid' },
    { cookie, state: 'another-login', reason: 'state_mismatch' },
    { cookie, malformed: true, reason: 'assertion_invalid' },
    {
      cookie,
      env: {
        ...env,
        claimLogin: async () => {
          throw Error('database failed');
        },
      },
      reason: 'storage_unavailable',
    },
    { cookie, env: { ...env, claimLogin: async () => false }, reason: 'callback_used' },
    {
      cookie,
      fetch: async () => {
        throw Error('network failed');
      },
      reason: 'steam_unavailable',
    },
    { cookie, fetch: async () => new Response('is_valid:false\n'), reason: 'steam_rejected' },
    {
      cookie,
      fetch: async (_url, options) => {
        assert.equal(options.redirect, 'manual');
        return new Response(null, { status: 302, headers: { location: 'https://example.com' } });
      },
      reason: 'steam_unavailable',
    },
  ];
  try {
    for (const scenario of cases) {
      const params = assertion(scenario.state || state);
      if (scenario.malformed) params.delete('openid.identity');
      globalThis.fetch = scenario.fetch || (async () => new Response('is_valid:true\n'));
      const response = await handleSteamAuth(
        new Request(origin + '/auth/steam/return?' + params, {
          headers: { cookie: scenario.cookie },
        }),
        scenario.env || env,
      );
      const redirect = new URL(response.headers.get('location'), origin);
      assert.equal(redirect.searchParams.get('reason'), scenario.reason);
      assert.match(redirect.searchParams.get('ref'), /^[0-9a-f-]{36}$/);
      assert.equal(response.headers.getSetCookie().length, 1);
      assert.match(response.headers.getSetCookie()[0], /Max-Age=0/);
      assert.deepEqual(logs.at(-1), {
        event: 'steam_login_failed',
        reason: scenario.reason,
        reference: redirect.searchParams.get('ref'),
      });
    }
    assert.ok(!JSON.stringify(logs).includes(steamid));
    assert.ok(!JSON.stringify(logs).includes(cookie));
  } finally {
    globalThis.fetch = oldFetch;
    console.warn = oldWarn;
  }
});
