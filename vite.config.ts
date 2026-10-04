import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// 拡張としてビルドするときは lab.ndl.go.jp を直接叩く（host_permissions で CORS 回避）。
// `npm run dev` のときはブラウザの CORS を避けるため /dl/api をプロキシ経由にする。
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: './',
  define: {
    __API_BASE__: JSON.stringify(command === 'serve' ? '' : 'https://lab.ndl.go.jp'),
  },
  server: {
    proxy: {
      '/dl/api': { target: 'https://lab.ndl.go.jp', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { app: here('./app.html'), sidepanel: here('./sidepanel.html') } },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
