import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizePath, type Plugin } from 'vite';

/** Rebuild source data on save, then reload only after all outputs are ready. */
export function campusDataPlugin(): Plugin {
  const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
  const source = normalizePath(`${backend}data/`);
  const output = normalizePath(fileURLToPath(new URL('../public/data/', import.meta.url)));
  const python = fileURLToPath(new URL(
    process.platform === 'win32' ? '../../backend/.venv/Scripts/python.exe' : '../../backend/.venv/bin/python',
    import.meta.url,
  ));
  return {
    name: 'campus-data-on-save',
    enforce: 'pre',
    apply: 'serve',
    configureServer(server) {
      let timer: ReturnType<typeof setTimeout>;
      let running = false;
      let pending = false;
      let closed = false;
      let child: ReturnType<typeof spawn> | undefined;
      const build = () => {
        if (closed) return;
        if (running) { pending = true; return; }
        running = true;
        server.config.logger.info('[campus] 원본 데이터 변환 중…');
        const args = ['-m', 'campus.pipeline', 'build'];
        child = spawn(existsSync(python) ? python : 'uv', existsSync(python) ? args : ['run', 'python', ...args], {
          cwd: backend, stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });
        child.on('error', (error) => server.config.logger.error(error.message));
        child.on('close', (code) => {
          running = false;
          if (closed) return;
          if (pending) { pending = false; build(); return; }
          if (code === 0) {
            server.config.logger.info('[campus] 데이터 반영 완료');
            if (server.config.mode === 'static') server.ws.send({ type: 'full-reload', path: '*' });
            else server.ws.send({ type: 'custom', event: 'campus:data-updated', data: {} });
          } else server.config.logger.error('[campus] 변환 실패: JSON 오류를 수정하고 다시 저장하세요.');
        });
      };
      const changed = (file: string) => {
        const path = normalizePath(file);
        if (path.startsWith(`${source}private/`)) return;
        if (!path.startsWith(source) || !/\.(json|geojson)$/.test(path)) return;
        clearTimeout(timer);
        timer = setTimeout(build, 400);
      };
      server.watcher.add(source);
      server.watcher.on('all', (_event, file) => changed(file));
      server.httpServer?.once('close', () => {
        closed = true;
        clearTimeout(timer);
        child?.kill();
      });
      build();
    },
    handleHotUpdate(context) {
      // Public JSON writes otherwise trigger reloads halfway through a build.
      if (normalizePath(context.file).startsWith(output)) return [];
      if (normalizePath(context.file).startsWith(source) && context.server.config.mode !== 'static') return [];
    },
  };
}
