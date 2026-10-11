import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({ plugins: [
  react(),
  VitePWA({ registerType: 'autoUpdate', includeAssets: ['icon-192.png', 'icon-512.png'], manifest: {
    name: 'Моя аптечка', short_name: 'Аптечка', description: 'Семейная аптечка всегда под рукой',
    theme_color: '#f7f4ec', background_color: '#f7f4ec', display: 'standalone', start_url: '/', lang: 'ru',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
  }, workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,png,svg,webp}'] } }),
] });
