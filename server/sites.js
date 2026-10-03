import { unzipSync } from 'fflate';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './db.js';

const SITES_DIR = path.join(UPLOAD_DIR, 'sites');
const MAX_FILES = 3000;
const MAX_UNZIPPED_BYTES = 400 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.lottie': 'application/zip',
};

export const isHtmlName = (name) => /\.html?$/i.test(name);
export const isZipName = (name) => /\.zip$/i.test(name);

class SiteError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

/** Picks the page to open first: a root index.html, else the shallowest index.html, else the only/first .html. */
function pickEntry(files) {
  const html = files.filter(isHtmlName).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  if (!html.length) throw new SiteError('The zip has no .html file in it');
  return html.find((f) => /(^|\/)index\.html?$/i.test(f)) ?? html[0];
}

/**
 * The site's top-level pages (each becomes its own review page), in the order the entry page's links
 * mention them, so the client's checklist follows the site's own menu. Nested HTML (partials,
 * components) is ignored.
 */
function orderPages(dir, names, entry) {
  const pages = names.filter((n) => !n.includes('/') && isHtmlName(n));
  if (!pages.includes(entry)) return [entry];
  const html = fs.readFileSync(path.join(dir, entry), 'utf8');
  const linked = [...html.matchAll(/href\s*=\s*["']\.?\/?([^"'#?/]+\.html?)/gi)].map((m) => m[1]);
  const rank = (n) => (n === entry ? -1 : linked.includes(n) ? linked.indexOf(n) : 1000);
  return pages.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * Stores an uploaded .html file or .zip of a static site under uploads/sites/<random>/.
 * Returns the stored folder name (relative to UPLOAD_DIR) and the entry page path within it.
 */
export function storeSite(file) {
  const id = crypto.randomBytes(12).toString('hex');
  const dir = path.join(SITES_DIR, id);
  try {
    if (isHtmlName(file.originalname)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(file.path, path.join(dir, 'index.html'));
      return { storedName: `sites/${id}`, entry: 'index.html', pages: ['index.html'], missing: findMissingFiles(dir) };
    }
    let entries;
    try {
      entries = unzipSync(new Uint8Array(fs.readFileSync(file.path)));
    } catch {
      throw new SiteError('That zip file couldn’t be opened');
    }
    let names = Object.keys(entries).filter((n) => !n.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store)/.test(n));
    if (names.some((n) => n.startsWith('/') || /^[a-z]:/i.test(n) || n.split(/[\\/]/).includes('..'))) {
      throw new SiteError('The zip contains an unsafe file path');
    }
    if (names.length > MAX_FILES) throw new SiteError(`The zip has too many files (max ${MAX_FILES})`);
    const total = names.reduce((sum, n) => sum + entries[n].length, 0);
    if (total > MAX_UNZIPPED_BYTES) throw new SiteError('The unzipped site is too large');

    // If everything sits inside one top-level folder (common when zipping a folder), strip it.
    const tops = new Set(names.map((n) => n.split('/')[0]));
    const strip = tops.size === 1 && names.every((n) => n.includes('/')) ? `${[...tops][0]}/` : '';

    for (const name of names) {
      const rel = name.slice(strip.length);
      const target = path.resolve(dir, rel);
      if (!target.startsWith(dir + path.sep)) throw new SiteError('The zip contains an unsafe file path');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entries[name]);
    }
    names = names.map((n) => n.slice(strip.length));
    const entry = pickEntry(names);
    return { storedName: `sites/${id}`, entry, pages: orderPages(dir, names, entry), missing: findMissingFiles(dir) };
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  } finally {
    fs.rmSync(file.path, { force: true });
  }
}

const ASSET_EXT = 'png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|mov|mp3|wav|woff2?|ttf|otf|json|lottie|glb|gltf';
// Attribute and CSS references, plus quoted asset paths inside scripts (e.g. image lists for a carousel).
const REF_PATTERNS = [
  /\s(?:src|href|poster|data-src|data-bg)\s*=\s*["']([^"']+)["']/gi,
  /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
  new RegExp(`["'\`]([^"'\`\\s<>(){}]+\\.(?:${ASSET_EXT}))(?:[?#][^"'\`]*)?["'\`]`, 'gi'),
];
const SCANNED = /\.(html?|css|js|mjs)$/i;

function listFiles(dir, base = '') {
  return fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? listFiles(dir, path.join(base, d.name)) : [path.join(base, d.name)],
  );
}

/**
 * Local files the pages refer to but the upload doesn't contain, typically because only index.html was
 * uploaded instead of a zip of its folder. Returned so the agency can be warned straight away.
 */
export function findMissingFiles(dir, limit = 30) {
  const missing = new Set();
  const missingPages = new Set();
  const external = new Set();
  for (const rel of listFiles(dir).filter((f) => SCANNED.test(f))) {
    const text = fs.readFileSync(path.join(dir, rel), 'utf8');
    for (const pattern of REF_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        let ref = match[1].trim();
        if (/^file:/i.test(ref)) {
          external.add(ref);
          continue;
        }
        if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{|\$)/i.test(ref) || ref.includes('${')) continue;
        ref = ref.split(/[?#]/)[0];
        if (!ref || ref.endsWith('/')) continue;
        let decoded;
        try {
          decoded = decodeURIComponent(ref);
        } catch {
          decoded = ref;
        }
        // In-page references such as SVG gradients: url(#g), or url(%23g) inside an embedded SVG.
        if (decoded.startsWith('#')) continue;
        const target = decoded.startsWith('/')
          ? path.join(dir, decoded)
          : path.resolve(dir, path.dirname(rel), decoded);
        if (!target.startsWith(dir + path.sep)) continue;
        if (fs.existsSync(target)) continue;
        const name = path.relative(dir, target).split(path.sep).join('/');
        // Links to pages that aren't designed yet are normal in a prototype; report them separately.
        (/\.html?$/i.test(name) ? missingPages : missing).add(name);
      }
    }
  }
  return {
    files: [...missing].sort().slice(0, limit),
    total: missing.size,
    pages: [...missingPages].sort().slice(0, limit),
    computerPaths: [...external].slice(0, 5),
  };
}

/** Points root-relative URLs ("/css/x.css") at the site's own folder instead of the portal. */
function rewriteRootUrls(text, base) {
  return text
    .replace(/(\s(?:src|href|poster|action|data-src)\s*=\s*)(["'])\/(?!\/)/gi, `$1$2${base}`)
    .replace(/(srcset\s*=\s*["'][^"']*)/gi, (m) => m.replace(/(^|,\s*|["']\s*)\/(?!\/)/g, `$1${base}`))
    .replace(/url\(\s*(["']?)\/(?!\/)/gi, `url($1${base}`);
}

const TRUE_MQ = '(min-width: 0px)';
const FALSE_MQ = '(min-width: 999999px)';

/**
 * Inside the portal the page's real device is the reviewer's computer, so CSS written for phones
 * (max-device-width, hover: none, pointer: coarse) would never apply. For Tablet/Mobile previews we
 * rewrite those media features to describe the chosen device instead.
 */
export function rewriteDeviceQueries(text) {
  return text
    .replace(/\(\s*(min-|max-)?device-(width|height|aspect-ratio)\s*:/gi, (m, prefix, feature) => `(${prefix ?? ''}${feature}:`)
    .replace(/\(\s*(?:any-)?pointer\s*:\s*coarse\s*\)/gi, TRUE_MQ)
    .replace(/\(\s*(?:any-)?pointer\s*:\s*(?:fine|none)\s*\)/gi, FALSE_MQ)
    .replace(/\(\s*(?:any-)?hover\s*:\s*none\s*\)/gi, TRUE_MQ)
    .replace(/\(\s*(?:any-)?hover\s*:\s*hover\s*\)/gi, FALSE_MQ)
    .replace(/\(\s*(?:any-)?pointer\s*\)/gi, TRUE_MQ)
    .replace(/\(\s*(?:any-)?hover\s*\)/gi, FALSE_MQ);
}

const customCursorCache = new Map();

/**
 * Whether the site draws its own mouse cursor (cursor: none plus a JS follower, or cursor: url(...)).
 * If so, comment mode keeps the site's cursor instead of forcing a crosshair. Cached per upload.
 */
function usesCustomCursor(dir) {
  if (!customCursorCache.has(dir)) {
    const pattern = /cursor\s*[:=]\s*["'`]?\s*(none|url\()/i;
    customCursorCache.set(
      dir,
      listFiles(dir)
        .filter((f) => SCANNED.test(f))
        .some((f) => pattern.test(fs.readFileSync(path.join(dir, f), 'utf8'))),
    );
  }
  return customCursorCache.get(dir);
}

/** Adds the commenting helper to a page, as early as possible so it sees every click. */
function injectHelper(html, { customCursor = false } = {}) {
  const tag = `<script src="/__portal/frame.js"${customCursor ? ' data-custom-cursor="1"' : ''}></script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}${tag}`);
  return tag + html;
}

/**
 * Serves one file of an uploaded site. Pages are delivered with a CSP sandbox (opaque origin) so their
 * scripts can never act as the portal or read its cookies, even if the URL is opened directly.
 */
export function serveSiteFile(res, storedName, siteToken, relPath, device = null) {
  const dir = path.join(UPLOAD_DIR, storedName);
  let target = path.resolve(dir, decodeURIComponent(relPath || ''));
  if (target !== dir && !target.startsWith(dir + path.sep)) return res.status(404).end();
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target)) {
    // A link to a page that wasn't uploaded (e.g. a menu item not designed yet): show a friendly page that still
    // loads the helper, so the portal knows where the reviewer is and can offer a way back.
    if (/\.html?$/i.test(target) || !path.extname(target)) {
      const name = path.basename(target).replace(/[<>&"']/g, '');
      res.status(404);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', 'sandbox allow-scripts');
      return res.send(
        injectHelper(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6f9;color:#0f1b2d;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 6px}p{margin:0;color:#5b6b80}</style></head>
<body><div><h1>“${name}” isn’t part of this design yet</h1><p>This link goes to a page that wasn’t uploaded for review.</p></div></body></html>`),
      );
    }
    return res.status(404).type('text/plain').send('Not found');
  }

  const ext = path.extname(target).toLowerCase();
  // Keep the device segment in rewritten root-relative URLs so every asset is served for the same device.
  const base = `/sites/${siteToken}/${device ? `~${device}/` : ''}`;
  const touch = device === 'tablet' || device === 'mobile';
  const adapt = (text) => (touch ? rewriteDeviceQueries(text) : text);
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
  res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox');
  // Sandboxed pages have an opaque ("null") origin, so fonts and module scripts need CORS to load.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');

  if (ext === '.html' || ext === '.htm') {
    return res.send(
      injectHelper(adapt(rewriteRootUrls(fs.readFileSync(target, 'utf8'), base)), { customCursor: usesCustomCursor(dir) }),
    );
  }
  if (ext === '.css') return res.send(adapt(rewriteRootUrls(fs.readFileSync(target, 'utf8'), base)));
  res.sendFile(target);
}
