import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only endpoint: POST /__save?name=<file> writes the raw body into ./recordings/<file>.
// Used by the in-app recorder and screenshot button so files land on disk without a download prompt.
function savePlugin() {
  return {
    name: 'save-endpoint',
    configureServer(server) {
      server.middlewares.use('/__save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only'); }
        const url = new URL(req.url, 'http://x');
        const name = (url.searchParams.get('name') || 'out.bin').replace(/[^a-zA-Z0-9_.-]/g, '_');
        const dir = path.resolve('recordings');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, name);
        const ws = fs.createWriteStream(file);
        req.pipe(ws);
        ws.on('finish', () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, file })); });
        ws.on('error', e => { res.statusCode = 500; res.end(String(e)); });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [savePlugin()],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    // never reload the page while a recording is in progress: ignore everything that is not app source
    watch: { ignored: ['**/recordings/**', '**/docs/**', '**/tools/**', '**/content/**', '**/scripts/**', '**/*.md', '**/spike/**', '**/.claude/**'] },
  },
  build: { target: 'es2022', sourcemap: false },
});
