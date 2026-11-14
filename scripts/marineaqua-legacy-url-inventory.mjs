import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const OLD_ORIGIN = 'https://marine-aqua.vn';
const NEW_ORIGIN = 'https://marine-aqua.io.vn';
const OUT = 'legacy-url-inventory';
const REPORT = {
  generatedAt: new Date().toISOString(),
  oldOrigin: OLD_ORIGIN,
  newOrigin: NEW_ORIGIN,
  sitemapSources: { old: [], current: [] },
  totals: {},
  mappings: [],
  unresolved: [],
  errors: [],
};

await mkdir(OUT, { recursive: true });

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'MarineAqua-Legacy-URL-Audit/1.0', accept: 'application/xml,text/plain,*/*' },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url);
  return { url: response.url, text: await response.text(), status: response.status };
}

function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map(match => match[1].replaceAll('&amp;', '&').trim())
    .filter(Boolean);
}

async function sitemapTree(origin, label) {
  const queue = [
    origin + '/robots.txt',
    origin + '/sitemap_index.xml',
    origin + '/sitemap-index.xml',
    origin + '/wp-sitemap.xml',
    origin + '/sitemap.xml',
  ];
  const seen = new Set();
  const pageUrls = new Set();
  const sourceDocs = [];
  const errors = [];
  while (queue.length && seen.size < 100) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const { url: finalUrl, text } = await fetchText(url);
      sourceDocs.push({ requested: url, final: finalUrl, bytes: text.length });
      if (/robots\.txt(?:$|\?)/i.test(new URL(finalUrl).pathname)) {
        for (const line of text.split(/\r?\n/)) {
          const match = line.match(/^\s*Sitemap:\s*(https?:\/\/\S+)/i);
          if (match) queue.push(match[1].trim());
        }
        continue;
      }
      const found = locs(text);
      if (!found.length) continue;
      const isIndex = /<sitemapindex[\s>]/i.test(text);
      if (isIndex) {
        for (const child of found) queue.push(child);
      } else {
        for (const item of found) {
          try {
            const parsed = new URL(item);
            if (parsed.origin === origin) pageUrls.add(parsed.href);
          } catch {}
        }
      }
    } catch (error) {
      errors.push({ url, error: String(error?.message || error).slice(0, 300) });
    }
  }
  REPORT.sitemapSources[label] = sourceDocs;
  if (!pageUrls.size) {
    throw new Error(label + ' sitemap discovery returned no page URLs. Tried: ' + [...seen].join(', '));
  }
  REPORT.errors.push(...errors.map(item => ({ scope: label, ...item })));
  return [...pageUrls].sort();
}

function normalizedPath(url) {
  const parsed = new URL(url);
  let path = decodeURIComponent(parsed.pathname).replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}
function lastSlug(path) {
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return '';
  const pageIndex = parts.lastIndexOf('page');
  return pageIndex > 0 ? parts[pageIndex - 1] : parts[parts.length - 1];
}
function candidatePaths(oldPath, newPaths) {
  const slug = lastSlug(oldPath);
  if (!slug) return [];
  const exact = newPaths.filter(path => path === oldPath);
  if (exact.length) return exact;
  const slugMatches = newPaths.filter(path => lastSlug(path) === slug);
  if (/^\/danh-muc\//i.test(oldPath)) {
    const flat = newPaths.filter(path => path === '/san-pham/' + slug || path.startsWith('/san-pham/' + slug + '/'));
    return flat.length ? flat : slugMatches;
  }
  return slugMatches;
}

const oldUrls = await sitemapTree(OLD_ORIGIN, 'old');
const newUrls = await sitemapTree(NEW_ORIGIN, 'current');
const oldByPath = new Map(oldUrls.map(url => [normalizedPath(url), url]));
const newByPath = new Map(newUrls.map(url => [normalizedPath(url), url]));
const newPaths = [...newByPath.keys()];
for (const [oldPath, oldUrl] of oldByPath) {
  if (newByPath.has(oldPath)) continue;
  const candidates = candidatePaths(oldPath, newPaths);
  if (candidates.length === 1) {
    REPORT.mappings.push({
      from: oldPath,
      to: candidates[0],
      type: 301,
      confidence: /^\/danh-muc\//i.test(oldPath) ? 'category-slug-live-match' : 'unique-final-slug',
      sourceUrl: oldUrl,
      destinationUrl: NEW_ORIGIN + candidates[0],
    });
  } else {
    REPORT.unresolved.push({
      from: oldPath,
      reason: candidates.length ? 'ambiguous-destination' : 'no-live-destination-with-matching-slug',
      candidates: candidates.slice(0, 10),
      sourceUrl: oldUrl,
    });
  }
}
REPORT.totals = {
  oldSitemapUrls: oldUrls.length,
  currentSitemapUrls: newUrls.length,
  alreadyMatchingPaths: oldByPath.size - REPORT.mappings.length - REPORT.unresolved.length,
  uniqueMappings: REPORT.mappings.length,
  unresolved: REPORT.unresolved.length,
};
assert.ok(REPORT.totals.oldSitemapUrls > 0 && REPORT.totals.currentSitemapUrls > 0);
await writeFile(OUT + '/report.json', JSON.stringify(REPORT, null, 2) + '\n');
await writeFile(OUT + '/mappings.csv',
  ['from,to,type,confidence', ...REPORT.mappings.map(x =>
    [x.from,x.to,x.type,x.confidence].map(v => '"' + String(v).replaceAll('"','""') + '"').join(',')
  )].join('\n') + '\n');
await writeFile(OUT + '/unresolved.json', JSON.stringify(REPORT.unresolved, null, 2) + '\n');
console.log('MARINEAQUA_LEGACY_URL_INVENTORY=' + JSON.stringify(REPORT.totals));
console.log('MARINEAQUA_LEGACY_URL_MAPPING_CANDIDATES=' + REPORT.mappings.length);
console.log('MARINEAQUA_LEGACY_URL_UNRESOLVED=' + REPORT.unresolved.length);
