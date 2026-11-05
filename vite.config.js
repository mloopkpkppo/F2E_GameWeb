import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  publicDir: '.local/cloudflare-public',
  plugins: [cloudflare()],
});
