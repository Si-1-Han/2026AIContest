import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const python = fileURLToPath(new URL(
  process.platform === 'win32' ? '../../backend/.venv/Scripts/python.exe' : '../../backend/.venv/bin/python',
  import.meta.url,
));
const args = ['-m', 'uvicorn', 'campus.api.main:app', '--reload', '--port', '8000'];
const child = spawn(existsSync(python) ? python : 'uv', existsSync(python) ? args : ['run', 'python', ...args], {
  cwd: backend,
  stdio: 'inherit',
  env: { ...process.env, CAMPUS_DEV_RELOAD: 'true' },
});
child.on('error', (error) => { console.error(error); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
