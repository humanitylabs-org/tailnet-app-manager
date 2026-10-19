import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const canonical = 'https://wizard.tailc0f369.ts.net';
test('canonical ingress preserves browser headers on all route classes', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tailnet-origin-'));
  const upstream = http.createServer((req,res) => {
    if(req.url === '/redirect') {res.writeHead(302,{location:'/next'});res.end();return;}
    res.setHeader('content-type','application/json');res.end(JSON.stringify(req.headers));
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const probe = http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const port = probe.address().port;await new Promise(r=>probe.close(r));
  const routes = ['/plain','/nesquena','/hermesUI','/android-apps','/meditation','/video-editor','/cinequeue','/movies','/wizdom','/wizard-search','/wizard-calendar'];
  fs.writeFileSync(path.join(dir,'routes.json'),JSON.stringify({routes:Object.fromEntries(routes.map(r=>[r,{target:`http://127.0.0.1:${upstream.address().port}`}]))}));
  fs.writeFileSync(path.join(dir,'missing.json'),JSON.stringify({apps:{}}));
  const env={...process.env,CLOUDFLARE_ROUTE_PORT:String(port),CLOUDFLARE_ROUTE_CONFIG:path.join(dir,'routes.json'),CLOUDFLARE_PWA_CATALOG:path.join(dir,'missing.json')};
  delete env.CLOUDFLARE_PUBLIC_ORIGIN;delete env.CLOUDFLARE_PUBLIC_ORIGIN_ALIASES;
  const child=spawn(process.execPath,[new URL('./private-route-adapter.mjs',import.meta.url).pathname],{env,stdio:['ignore','pipe','pipe']});
  let errors='';child.stderr.on('data',data=>{errors+=data;});
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}upstream.closeAllConnections();await new Promise(r=>upstream.close(r));fs.rmSync(dir,{recursive:true,force:true});});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('adapter exited: '+errors);})]);
  const base=`http://127.0.0.1:${port}`;
  for(const route of routes){
    const referer=canonical+route+'/source?keep=1';
    const r=await fetch(base+route+'/echo',{method:'POST',headers:{origin:canonical,referer,'sec-fetch-site':'same-origin','x-forwarded-host':'spoof.invalid'},body:'{}'});
    assert.equal(r.status,200,route);const h=await r.json();
    assert.equal(h.origin,canonical);assert.equal(h.referer,referer);assert.equal(h['x-forwarded-host'],'wizard.tailc0f369.ts.net');
    assert.equal(h.host,['/nesquena','/hermesUI'].includes(route)?'wizard.tailc0f369.ts.net':`127.0.0.1:${upstream.address().port}`);
  }
  for(const headers of [{origin:'https://evil.example'},{origin:canonical,'sec-fetch-site':'cross-site'}]){
    const r=await fetch(base+'/plain/echo',{method:'POST',headers,body:'{}'});assert.equal(r.status,403);
  }
  const r=await fetch(base+'/plain/redirect',{redirect:'manual'});assert.equal(r.headers.get('location'),canonical+'/plain/next');
});
