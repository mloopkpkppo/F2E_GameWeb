import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  accountId: 'c54da0ad9f5eea6294719d2ade805ee9',
  worker: {
    name: 'pixelized-api',
    entrypoint: './js/cloudflare-worker.mjs',
    // Cloudflare 以 UTC 檢查日期；台灣 11/6 凌晨仍是 UTC 11/5。
    compatibilityDate: '2026-11-05',
    workersDev: true,
    previewUrls: false,
    assets: { htmlHandling: 'none', runWorkerFirst: true },
    observability: {
      enabled: true,
      redactQueryString: true,
      traces: { enabled: true, headSamplingRate: 0.1 },
    },
    env: {
      ASSETS: bindings.assets(),
      SITE_ORIGIN: bindings.text('https://pixelized-api.pixelized-mloop.workers.dev'),
      DB: bindings.d1({ id: '61be964c-e942-411a-95b3-807d851369ae', name: 'pixelized-auth' }),
      FRONTEND_ORIGIN: bindings.text('https://mloopkpkppo.github.io'),
      FRONTEND_URL: bindings.text('https://mloopkpkppo.github.io/F2E_GameWeb/'),
      STEAM_API_KEY: bindings.secret(),
      SESSION_SECRET: bindings.secret(),
    },
  },
});
