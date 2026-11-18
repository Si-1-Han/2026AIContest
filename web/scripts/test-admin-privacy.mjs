import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer, loadConfigFromFile } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, `${root}vite.config.ts`);
const server = await createServer({
  ...loaded.config,
  configFile: false,
  root,
  plugins: loaded.config.plugins.filter((plugin) => plugin.name !== 'campus-data-on-save'),
  server: {
    ...loaded.config.server, port: 0, open: false,
    fs: { ...loaded.config.server.fs, allow: [fileURLToPath(new URL('../../', import.meta.url))] },
  },
});
try {
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const privatePath = fileURLToPath(new URL('../../backend/data/private/admins.json', import.meta.url)).replaceAll('\\', '/');
  const response = await fetch(`${base}@fs/${privatePath}`);
  assert.equal(response.status, 403, 'Vite must deny access to private administrator files');
  console.log('Verified private administrator JSON is blocked by the development server.');
} finally {
  await server.close();
}
