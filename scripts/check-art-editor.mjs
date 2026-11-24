import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { request } from 'node:http';
import { createEditorServer, savePainting } from './art-editor.mjs';

const repository = await mkdtemp(path.join(tmpdir(), 'mago-art-editor-'));
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
function painting(name = 'A "quiet" cup\nAnother line') {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name, medium: 'Oil', dimensions: '20 × 30 cm', date: '2026-11', author: 'Mago', text: 'First line\n---\nSecond line', status: 'Sold', visibility: 'private' })) form.set(key, value);
  form.set('preview', new File([png], '../../preview.png', { type: 'image/png' }));
  form.append('closeups', new File([png], 'detail.png', { type: 'image/png' }));
  form.append('alt', 'Detail of the rim');
  return form;
}
let server;
try {
  await mkdir(path.join(repository, 'src/content/art'), { recursive: true });
  await writeFile(path.join(repository, 'src/content/art/existing.md'), '---\nmedium: "Oil"\nheroImage: "/artworks/Oil/existing.jpg"\n---\n');
  const saved = await savePainting(painting(), repository);
  assert(saved.content.startsWith('src/content/art/oil-2026-11-'));
  assert(saved.images.every(url => url.startsWith('/artworks/Oil/')));
  const markdown = await readFile(path.join(repository, saved.content), 'utf8');
  assert(markdown.includes('visibility: "private"'));
  assert(markdown.includes('status: "Sold"'));
  assert(markdown.includes('month: 11'));
  assert(markdown.includes('    alt: "Detail of the rim"'));
  assert.equal(JSON.parse(markdown.match(/^text: (.*)$/m)[1]), 'First line\n---\nSecond line');
  assert.equal(JSON.parse(markdown.match(/^name: (.*)$/m)[1]), 'A "quiet" cup\nAnother line');
  for (const url of saved.images) assert.deepEqual(await readFile(path.join(repository, 'public', url)), png);
  await assert.rejects(savePainting(painting(), repository), /already exists/);
  assert.equal(await readFile(path.join(repository, saved.content), 'utf8'), markdown);
  const badDate = painting('Bad date'); badDate.set('date', '2026-13');
  await assert.rejects(savePainting(badDate, repository), /year and month/);
  const badImage = painting('Bad image'); badImage.set('preview', new File(['<script>bad</script>'], 'test.png', { type: 'image/png' }));
  await assert.rejects(savePainting(badImage, repository), /JPEG/);
  const badAlt = painting('Missing alt'); badAlt.delete('alt');
  await assert.rejects(savePainting(badAlt, repository), /description/);
  const badVisibility = painting('Bad visibility'); badVisibility.set('visibility', '../../');
  await assert.rejects(savePainting(badVisibility, repository), /visibility/);
  const single = painting('Single image'); single.delete('closeups'); single.delete('alt'); single.set('visibility', 'public');
  const singleSaved = await savePainting(single, repository);
  assert.equal(singleSaved.images.length, 1);
  assert(!(await readFile(path.join(repository, singleSaved.content), 'utf8')).includes('closeups:'));
  // Existing metadata must survive a collision even when its image directory is absent.
  await writeFile(path.join(repository, 'src/content/art/oil-2026-11-collision.md'), 'keep me');
  await assert.rejects(savePainting(painting('Collision'), repository), /already exists/);
  assert.equal(await readFile(path.join(repository, 'src/content/art/oil-2026-11-collision.md'), 'utf8'), 'keep me');
  assert(!(await readdir(path.join(repository, 'public/artworks/Oil'))).includes('oil-2026-11-collision'));

  server = createEditorServer(repository);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  const token = (await page.text()).match(/name="editor-token" content="([a-f0-9]+)"/)[1];
  assert(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal((await fetch(`${origin}/editor.js`)).status, 200);
  assert.deepEqual(await (await fetch(`${origin}/mediums`)).json(), ['Oil']);
  const badHostStatus = await new Promise((resolve, reject) => {
    const req = request(origin, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(badHostStatus, 403);
  const post = headers => fetch(`${origin}/paintings`, { method: 'POST', headers, body: painting('HTTP painting') });
  assert.equal((await post({ Origin: 'https://evil.example', 'X-Editor-Token': token })).status, 403);
  assert.equal((await post({ Origin: origin })).status, 403);
  const response = await post({ Origin: origin, 'X-Editor-Token': token });
  assert.equal(response.status, 201);
  assert((await response.json()).content.endsWith('http-painting.md'));
  console.log('Local art editor saving, validation, collision and HTTP checks passed.');
} finally {
  if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(repository, { recursive: true, force: true });
}
