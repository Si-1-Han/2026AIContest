import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // three.js가 커서 기본 경고 기준(500kB)을 넘는다. 코드 분할은 M4에서 검토
    chunkSizeWarningLimit: 1600,
  },
  server: {
    // `vercel dev` 없이 `npm run dev`만 쓸 때 /api/guide는 404 → 클라이언트 폴백으로 동작한다.
    port: 5173,
  },
});
