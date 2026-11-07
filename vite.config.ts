import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/strategic-card-wars/' : '/',
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
