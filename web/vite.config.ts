import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { campusDataPlugin } from './scripts/campus-data-plugin.ts';

/** `npm run dev`가 함께 띄우는 Python 서버 (uvicorn) */
const PY_API = process.env.PY_API ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react(), tailwindcss(), campusDataPlugin()],
  build: {
    // three.js가 커서 기본 경고 기준(500kB)을 넘는다. 코드 분할은 M4에서 검토
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5173,
    // Python API를 같은 주소로 쓰기 위한 프록시 (CORS·환경변수 불필요).
    // /api/guide는 Vercel 함수라 여기서는 404 → 브라우저 규칙 기반 폴백으로 동작한다.
    proxy: {
      '/api/v1': { target: PY_API, changeOrigin: true },
      '/health': { target: PY_API, changeOrigin: true },
    },
  },
});
