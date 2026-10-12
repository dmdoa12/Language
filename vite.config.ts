/// <reference types="vitest/config" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const DICT_DIR = join(import.meta.dirname, 'node_modules/kuromoji/dict');

// kuromoji 사전(.dat.gz)을 /dict/ 로 제공한다. 저장소에는 넣지 않고 빌드 때 node_modules 에서 복사.
// 압축 파일 그대로(Content-Encoding 없이) 보내야 kuromoji 가 직접 풀 수 있다.
function kuromojiDict(): Plugin {
  return {
    name: 'kuromoji-dict',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/\/dict\/([\w.]+\.dat\.gz)$/);
        if (!match) return next();
        try {
          const data = readFileSync(join(DICT_DIR, match[1]!));
          res.setHeader('Content-Type', 'application/octet-stream');
          res.end(data);
        } catch {
          res.statusCode = 404;
          res.end();
        }
      });
    },
    generateBundle() {
      for (const file of readdirSync(DICT_DIR)) {
        if (!file.endsWith('.dat.gz')) continue;
        this.emitFile({ type: 'asset', fileName: `dict/${file}`, source: readFileSync(join(DICT_DIR, file)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    kuromojiDict(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: '일본에서의 하루',
        short_name: '일본에서의 하루',
        description: '한국어 상황을 보고 일본어로 말하는 회화 복습',
        lang: 'ko',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#2f5d8a',
        background_color: '#f7f6f2',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // 사전은 설치 때 받지 않고, 처음 쓸 때 받아 캐시해 두면 이후 오프라인에서도 쓴다.
        runtimeCaching: [
          {
            urlPattern: /\/dict\/[\w.]+\.dat\.gz$/,
            handler: 'CacheFirst',
            options: { cacheName: 'kuromoji-dict', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  base: './',
  resolve: {
    alias: [
      // kuromoji 가 쓰는 Node path 모듈 대신 (path.join 만 필요)
      { find: /^path$/, replacement: join(import.meta.dirname, 'src/shims/path.ts') },
      // kuromoji 의 gunzip (zlibjs) 을 ES 모듈 환경에서 동작하게 감싼 것
      { find: /^zlibjs\/bin\/gunzip\.min\.js$/, replacement: join(import.meta.dirname, 'src/shims/zlibGunzip.ts') },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
