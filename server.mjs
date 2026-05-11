#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HOST = process.env.APPS_HOST || '127.0.0.1';
const PORT = Number(process.env.APPS_PORT || 8786);
const BASE = '/apps';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const INDEX_PATH = path.join(ROOT, 'index.html');
const TAILNET_BASE = process.env.TAILNET_BASE_URL || 'https://srv1499816.tail6adf1a.ts.net';

const GROUPS = {
  custom: {
    id: 'custom',
    label: 'Custom Apps',
    description: 'Designed and fully built by Humanity Labs.',
  },
  base: {
    id: 'base',
    label: 'Base Tailnet Apps',
    description: 'Baseline services using our Tailnet app template.',
  },
};

const APPS = [
  { id:'appsmanager', group:'custom', name:'Apps Manager', path:'/apps', service:'apps-manager.service', repoPath:'/root/.openclaw/workspace/AGENT-OSCAR/Code/tailnet-app-manager', healthUrl:'http://127.0.0.1:8786/apps/api/health', canUpdate:true, icon:'/apps/assets/app-appsmanager.png' },
  { id:'mizel', group:'custom', name:'Mizel', path:'/mizel', service:'mizel-local.service', repoPath:'/root/.openclaw/workspace/AGENT-OSCAR/Code/mizel', healthUrl:'http://127.0.0.1:8791/mizel', canUpdate:true, icon:'/apps/assets/app-mizel.png' },
  { id:'mindfeed', group:'custom', name:'MindFeed', path:'/mindfeed', service:'mindfeed.service', repoPath:'/root/.openclaw/workspace/AGENT-OSCAR/Code/mindfeed', healthUrl:'http://127.0.0.1:8787/mindfeed', canUpdate:true, icon:'/apps/assets/app-mindfeed.png' },
  { id:'bookcompressor', group:'custom', name:'BookCompressor', path:'/bookcompressor', service:'bookcompressor.service', repoPath:'/root/.openclaw/workspace/AGENT-OSCAR/Code/book-compressor', healthUrl:'http://127.0.0.1:3000/bookcompressor/api/health', canUpdate:true, icon:'/apps/assets/app-bookcompressor.png' },
  { id:'clawtabs', group:'custom', name:'ClawTabs', path:'/clawtabs', service:'clawtabs.service', repoPath:'/root/.openclaw/workspace/AGENT-OSCAR/Code/claw-tabs', healthUrl:'http://127.0.0.1:8788/clawtabs/api/health', canUpdate:true, icon:'/apps/assets/app-clawtabs.png' },
  { id:'browser', group:'base', name:'Browser', path:'/browser', service:'remote-browser.service', repoPath:'/root/.openclaw/workspace/AGENT-OSCAR/Code/tailnet-browser', healthUrl:'http://127.0.0.1:6080', canUpdate:true, icon:'/apps/assets/app-browser.png' },
  { id:'terminal', group:'base', name:'Terminal', path:'/terminal', service:'web-terminal.service', repoPath:'/root/.openclaw/workspace/AGENT-OSCAR/Code/tailnet-terminal', healthUrl:'http://127.0.0.1:7681', canUpdate:true, icon:'/apps/assets/app-terminal.png' },
  { id:'localstt', group:'base', name:'LocalSTT', path:'/stt', service:'local-stt.service', repoPath:'/root/.openclaw/workspace/AGENT-OSCAR/Code/mizel-local-stt', healthUrl:'http://127.0.0.1:9099/health', canUpdate:true, icon:'/apps/assets/app-mizelstt.png' },
  { id:'localllm', group:'base', name:'LocalLLM', path:'/llm/v1/models', service:'local-llm.service', repoPath:'/root/.openclaw/workspace/AGENT-OSCAR/Code/mizel-local-llm', healthUrl:'http://127.0.0.1:9098/v1/models', canUpdate:true, icon:'/apps/assets/app-appsmanager.png' },
];

const MIME = {
  '.html':'text/html; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8',
  '.png':'image/png',
};

const STATIC_ROUTES = {
  [`${BASE}/manifest.webmanifest`]: path.join(ROOT, 'manifest.webmanifest'),
  [`${BASE}/icon-192.png`]: path.join(ROOT, 'icon-192.png'),
  [`${BASE}/icon-512.png`]: path.join(ROOT, 'icon-512.png'),
  [`${BASE}/apple-touch-icon.png`]: path.join(ROOT, 'apple-touch-icon.png'),
};

function resolveStaticPath(pathname) {
  if (STATIC_ROUTES[pathname]) return STATIC_ROUTES[pathname];
  if (!pathname.startsWith(`${BASE}/assets/`)) return null;
  const relative = pathname.slice(`${BASE}/assets/`.length);
  if (!relative || relative.includes('..') || path.isAbsolute(relative)) return null;
  return path.join(ROOT, 'assets', relative);
}

function send(res, code, body, headers={}) {
  res.writeHead(code, { 'Cache-Control':'no-store', ...headers });
  res.end(body);
}

async function systemctl(args) {
  try {
    const { stdout } = await execFileAsync('systemctl', args, { timeout: 15000, maxBuffer: 2_000_000 });
    return { ok:true, out:String(stdout || '').trim() };
  } catch (err) {
    const out = String(err?.stdout || err?.stderr || err?.message || '').trim();
    return { ok:false, out };
  }
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function checkHealth(url) {
  if (!url) return { code:null, ok:false };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { method:'GET', signal: controller.signal });
    clearTimeout(timer);
    return { code: res.status, ok: res.status >= 200 && res.status < 400 };
  } catch {
    return { code: null, ok:false };
  }
}

async function appStatus(app) {
  const [installed, active, enabled, health] = await Promise.all([
    exists(app.repoPath),
    systemctl(['is-active', app.service]),
    systemctl(['is-enabled', app.service]),
    checkHealth(app.healthUrl),
  ]);

  return {
    ...app,
    installed,
    serviceActive: active.ok && active.out === 'active',
    serviceEnabled: enabled.ok && enabled.out.includes('enabled'),
    healthCode: health.code,
    healthOk: health.ok,
    publicUrl: `${TAILNET_BASE}${app.path}`,
  };
}

async function handleAction({ appId, action }) {
  const app = APPS.find(a => a.id === appId);
  if (!app) throw new Error('Unknown appId');
  if (!['restart','update'].includes(action)) throw new Error('Invalid action');

  let logs = [];

  if (action === 'update') {
    if (!app.canUpdate) throw new Error('Update not available for this app');
    if (!(await exists(app.repoPath))) throw new Error('Repo not found for this app');

    const pull = await execFileAsync('git', ['-C', app.repoPath, 'pull', '--ff-only'], { timeout: 180000, maxBuffer: 2_000_000 })
      .then(r => ({ ok:true, out:String((r.stdout||'') + (r.stderr||'')).trim() }))
      .catch(e => ({ ok:false, out:String((e.stdout||'') + (e.stderr||'') + (e.message||'')).trim() }));

    logs.push(`git pull: ${pull.ok ? 'ok' : 'failed'}`);
    if (pull.out) logs.push(pull.out);
    if (!pull.ok) throw new Error(logs.join('\n'));

    if (app.id === 'bookcompressor') {
      const build = await execFileAsync('npm', ['run', 'build'], { cwd: app.repoPath, timeout: 300000, maxBuffer: 4_000_000 })
        .then(r => ({ ok:true, out:String((r.stdout||'') + (r.stderr||'')).trim() }))
        .catch(e => ({ ok:false, out:String((e.stdout||'') + (e.stderr||'') + (e.message||'')).trim() }));
      logs.push(`npm build: ${build.ok ? 'ok' : 'failed'}`);
      if (build.out) logs.push(build.out.slice(-1500));
      if (!build.ok) throw new Error(logs.join('\n'));
    }
  }

  const restart = await systemctl(['restart', app.service]);
  logs.push(`restart ${app.service}: ${restart.ok ? 'ok' : 'failed'}`);
  if (restart.out) logs.push(restart.out);
  if (!restart.ok) throw new Error(logs.join('\n'));

  return { ok:true, output: logs.join('\n') };
}

const server = http.createServer(async (req, res) => {
  try {
    const method = (req.method || 'GET').toUpperCase();
    const host = req.headers.host || `${HOST}:${PORT}`;
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = decodeURIComponent(url.pathname);

    const staticFile = resolveStaticPath(pathname);
    if (staticFile) {
      try {
        const body = await fs.readFile(staticFile);
        const ext = path.extname(staticFile).toLowerCase();
        return send(res, 200, body, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      } catch {
        return send(res, 404, 'Not Found', { 'Content-Type':'text/plain; charset=utf-8' });
      }
    }

    if (pathname === `${BASE}/api/health`) {
      return send(res, 200, JSON.stringify({ ok:true, app:'tailnet-app-manager' }), { 'Content-Type': MIME['.json'] });
    }

    if (pathname === `${BASE}/api/status`) {
      const apps = await Promise.all(APPS.map(appStatus));
      return send(res, 200, JSON.stringify({ ok:true, apps, groups: GROUPS }), { 'Content-Type': MIME['.json'] });
    }

    if (pathname === `${BASE}/api/action`) {
      if (method !== 'POST') return send(res, 405, JSON.stringify({ error:'Method Not Allowed' }), { 'Content-Type': MIME['.json'] });
      let body = '';
      for await (const chunk of req) body += chunk;
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch { parsed = {}; }
      try {
        const out = await handleAction(parsed);
        return send(res, 200, JSON.stringify(out), { 'Content-Type': MIME['.json'] });
      } catch (err) {
        return send(res, 400, JSON.stringify({ ok:false, error: String(err?.message || err) }), { 'Content-Type': MIME['.json'] });
      }
    }

    if (pathname === BASE || pathname === `${BASE}/`) {
      const html = await fs.readFile(INDEX_PATH);
      return send(res, 200, html, { 'Content-Type': MIME['.html'] });
    }

    return send(res, 404, 'Not Found', { 'Content-Type':'text/plain; charset=utf-8' });
  } catch (err) {
    return send(res, 500, String(err?.message || err), { 'Content-Type':'text/plain; charset=utf-8' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[apps-manager] serving ${BASE} at http://${HOST}:${PORT}${BASE}`);
});
