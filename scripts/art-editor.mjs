import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, readdir, mkdir, open, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const slugify = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const maxBytes = 100 * 1024 * 1024;

async function mediumsAt(repository) {
  const entries = await readdir(path.join(repository, 'src/content/art'));
  const mediums = new Map();
  for (const entry of entries.filter(name => name.endsWith('.md'))) {
    const source = await readFile(path.join(repository, 'src/content/art', entry), 'utf8');
    // Suggestions only: existing entries use quoted, single-line medium and image fields.
    const medium = source.match(/^medium:\s*"([^"\n]+)"/m)?.[1];
    const folder = source.match(/^heroImage:\s*"\/artworks\/([^/"\n]+)\//m)?.[1];
    if (medium) mediums.set(medium, folder || mediums.get(medium));
  }
  return mediums;
}

export async function savePainting(form, repository = root) {
  const field = (name, max = 200) => {
    const value = form.get(name);
    if (typeof value !== 'string' || !value.trim() || value.length > max || /\0/.test(value)) throw new Error(`Please provide a valid ${name}.`);
    return value.trim();
  };
  const name = field('name');
  const medium = field('medium');
  const dimensions = field('dimensions');
  const author = field('author');
  const text = field('text', 10000);
  const date = field('date');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date) || Number(date.slice(0, 4)) < 1000) throw new Error('Choose a valid year and month.');
  const status = field('status');
  const visibility = field('visibility');
  if (!['Available', 'Sold'].includes(status) || !['public', 'private'].includes(visibility)) throw new Error('Invalid availability or visibility.');
  const closeups = form.getAll('closeups').filter(file => typeof file !== 'string' && file.size);
  const images = [form.get('preview'), ...closeups];
  const alts = form.getAll('alt');
  if (images.length > 21 || alts.length !== closeups.length) throw new Error('Use one preview and at most 20 close-ups, each with a description.');
  if (alts.some(alt => typeof alt !== 'string' || !alt.trim() || alt.length > 500)) throw new Error('Describe each close-up (up to 500 characters).');
  let total = 0;
  const files = [];
  for (const [index, image] of images.entries()) {
    if (!image || typeof image === 'string' || !image.size || image.size > 20 * 1024 * 1024) throw new Error('Each image must be between 1 byte and 20 MB.');
    total += image.size;
    if (total > maxBytes) throw new Error('Keep the total upload under 100 MB.');
    const bytes = Buffer.from(await image.arrayBuffer());
    const extension = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'jpg'
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
      : bytes.toString('ascii', 0, 6).match(/^GIF8[79]a$/) ? 'gif'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
    if (!extension) throw new Error('Use JPEG, PNG, WebP or GIF images.');
    files.push({ bytes, filename: `${index === 0 ? 'preview' : `closeup-${index}`}.${extension}` });
  }
  const mediumSlug = slugify(medium).slice(0, 60);
  const nameSlug = slugify(name).slice(0, 120);
  if (!mediumSlug || !nameSlug) throw new Error('Use at least one Latin letter or number in the name and medium.');
  const slug = `${mediumSlug}-${date}-${nameSlug}`;
  const mediums = await mediumsAt(repository);
  const suggested = mediums.get(medium);
  // Never allow metadata or uploaded filenames to supply filesystem paths.
  const folder = suggested && !/[\\/]/.test(suggested) && !['.', '..'].includes(suggested) ? suggested : mediumSlug;
  const parent = path.join(repository, 'public/artworks', folder);
  const directory = path.join(parent, slug);
  const content = path.join('src/content/art', `${slug}.md`);
  await mkdir(parent, { recursive: true });
  try { await mkdir(directory); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('This painting already exists. Change the title or date; existing files were kept.'); throw error; }
  const urls = files.map(file => `/artworks/${folder}/${slug}/${file.filename}`);
  const quote = JSON.stringify;
  const lines = ['---', `name: ${quote(name)}`, `medium: ${quote(medium)}`, `dimensions: ${quote(dimensions)}`, `year: ${Number(date.slice(0, 4))}`, `month: ${Number(date.slice(5))}`, `heroImage: ${quote(urls[0])}`];
  if (closeups.length) {
    lines.push('closeups:');
    closeups.forEach((_, index) => lines.push(`  - src: ${quote(urls[index + 1])}`, `    alt: ${quote(alts[index].trim())}`));
  }
  lines.push(`author: ${quote(author)}`, `text: ${quote(text)}`, `status: ${quote(status)}`, `visibility: ${quote(visibility)}`, '---', '');
  let metadataCreated = false;
  try {
    for (const file of files) await writeFile(path.join(directory, file.filename), file.bytes, { flag: 'wx' });
    // Publish metadata last so Astro never sees a painting whose images are still being copied.
    const metadata = await open(path.join(repository, content), 'wx');
    metadataCreated = true;
    try { await metadata.writeFile(lines.join('\n')); }
    finally { await metadata.close(); }
  } catch (error) {
    if (metadataCreated) await rm(path.join(repository, content), { force: true });
    await rm(directory, { recursive: true, force: true });
    if (error.code === 'EEXIST') throw new Error('This painting already exists. Existing files were kept.');
    throw error;
  }
  return { content, images: urls };
}

export function createEditorServer(repository = root) {
  const token = randomBytes(32).toString('hex');
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const origin = `http://127.0.0.1:${res.socket.localPort}`;
      if (req.headers.host !== new URL(origin).host) { res.writeHead(403).end('Local access only.'); return; }
      if (req.method === 'GET' && req.url === '/') {
        const html = await readFile(new URL('art-editor.html', import.meta.url), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html.replace('__TOKEN__', token));
      } else if (req.method === 'GET' && req.url === '/editor.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }).end(await readFile(new URL('art-editor-client.js', import.meta.url)));
      } else if (req.method === 'GET' && req.url === '/mediums') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify([...(await mediumsAt(repository)).keys()].sort()));
      } else if (req.method === 'POST' && req.url === '/paintings') {
        if (req.headers.origin !== origin || req.headers['x-editor-token'] !== token) { res.writeHead(403).end('Open the form from the local editor.'); return; }
        if (!req.headers['content-type']?.startsWith('multipart/form-data;')) throw new Error('Use the image upload form.');
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > maxBytes + 1024 * 1024) { res.writeHead(413).end('Upload is too large (100 MB total).'); return; }
          chunks.push(chunk);
        }
        const form = await new Request(origin, { method: 'POST', headers: { 'Content-Type': req.headers['content-type'] }, body: Buffer.concat(chunks) }).formData();
        const saved = await savePainting(form, repository);
        res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify(saved));
      } else { res.writeHead(404).end('Not found.'); }
    } catch (error) {
      console.error(error.message);
      if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.message);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createEditorServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(4322, '127.0.0.1', () => console.log('Add a painting: http://127.0.0.1:4322\nFiles are saved locally. Review and commit them when ready. Stop with Ctrl-C.'));
}
