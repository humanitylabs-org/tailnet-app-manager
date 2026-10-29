import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));

test('the retained directory clearly identifies itself as Legacy apps', () => {
  assert.match(html, /<title>Legacy apps<\/title>/);
  assert.match(html, /<h1>Legacy apps<\/h1>/);
  assert.match(html, /apple-mobile-web-app-title" content="Legacy apps"/);
  assert.equal(manifest.name, 'Legacy apps');
  assert.equal(manifest.short_name, 'Legacy apps');
});

test('legacy users have an explicit route to the current Wizard shell', () => {
  assert.match(html, /older app directory is being retired/);
  assert.match(html, /href="\/wizard-os-home\/">Open Wizard<\/a>/);
});

test('the existing installed app identity and scope remain unchanged', () => {
  for (const field of ['id', 'start_url', 'scope']) assert.equal(manifest[field], '/apps/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.capture_links, 'none');
});
