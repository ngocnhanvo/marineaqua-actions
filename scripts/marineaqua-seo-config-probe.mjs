import { mkdir, writeFile } from 'node:fs/promises';

const WP = 'https://admin.marine-aqua.io.vn';
const FRONT = 'https://marine-aqua.io.vn';
const OLD = 'https://marine-aqua.vn';
const OUT = 'marineaqua-seo-config-probe';
const report = { checkedAt: new Date().toISOString(), errors: [] };
await mkdir(OUT, { recursive: true });

async function get(url, accept = '*/*') {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { accept, 'user-agent': 'MarineAqua-SEO-Config-Probe/1.0' },
    signal: AbortSignal.timeout(25000),
  });
  const text = await response.text();
  return { status: response.status, finalUrl: response.url, bytes: text.length, text, headers: {
    contentType: response.headers.get('content-type') || '',
    location: response.headers.get('location') || '',
  }};
}
function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(x => x[1].trim());
}

try {
  const result = await get(WP + '/wp-json/esc-seo-files/v1/public', 'application/json');
  if (result.status !== 200) throw new Error('SEO Files REST HTTP ' + result.status);
  const data = JSON.parse(result.text);
  if (data?.version !== 1 || !['manual','auto'].includes(data?.sitemap?.mode) ||
      !Array.isArray(data?.sitemap?.extra) || !Array.isArray(data?.sitemap?.exclude) ||
      typeof data?.sitemap?.xml !== 'string') throw new Error('SEO Files response schema invalid');
  report.wordpress = {
    status: result.status,
    site: data.site || '',
    sitemapMode: data.sitemap.mode,
    manualXmlBytes: data.sitemap.xml.length,
    manualXmlLocCount: locs(data.sitemap.xml).length,
    extraUrlCount: data.sitemap.extra.length,
    excludeUrlCount: data.sitemap.exclude.length,
    robotsBytes: String(data.robots || '').length,
    llmsBytes: String(data.llms || '').length,
  };
} catch (error) {
  report.errors.push({ scope: 'wordpress-config', message: String(error?.message || error) });
}

try {
  const result = await get(FRONT + '/sitemap.xml', 'application/xml,text/xml,*/*');
  report.publicSitemap = {
    status: result.status, finalUrl: result.finalUrl, bytes: result.bytes,
    contentType: result.headers.contentType, locCount: locs(result.text).length,
    root: (result.text.match(/<(urlset|sitemapindex)\b/i) || [])[1] || null,
  };
} catch (error) {
  report.errors.push({ scope: 'public-sitemap', message: String(error?.message || error) });
}

try {
  const result = await get(OLD + '/818641-2', 'text/html,*/*');
  const html = result.text;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '';
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '';
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1] || '';
  const visibleText = html
    .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<svg[\\s\\S]*?<\\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ').trim();
  const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] || '';
  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\\/ld\\+json["'][^>]*>([\\s\\S]*?)<\\/script>/gi)]
    .map(match => match[1].slice(0, 5000)).slice(0, 5);
  report.legacyRoute = {
    status: result.status, finalUrl: result.finalUrl, location: result.headers.location,
    title, h1, canonical, metaDescription, htmlBytes: result.bytes,
    bodyTextExcerpt: visibleText.slice(0, 5000),
    jsonLdBlocks,
    notFoundMarker: /page not found|không tìm thấy|404 error/i.test(visibleText),
  };
  const slug = '818641-2';
  const endpoints = ['pages','posts','product'];
  report.legacyRoute.rest = {};
  for (const endpoint of endpoints) {
    try {
      const response = await get(OLD + '/wp-json/wp/v2/' + endpoint + '?slug=' + slug + '&_fields=id,slug,status,title,link,excerpt,content');
      const rows = JSON.parse(response.text);
      report.legacyRoute.rest[endpoint] = Array.isArray(rows)
        ? rows.map(row => ({
            id: row.id, slug: row.slug, status: row.status,
            title: String(row.title?.rendered || ''),
            link: row.link || '',
            excerpt: String(row.excerpt?.rendered || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,500),
            content: String(row.content?.rendered || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1000)
          }))
        : [];
    } catch (error) {
      report.legacyRoute.rest[endpoint] = { error: String(error?.message || error).slice(0,250) };
    }
  }
} catch (error) {
  report.errors.push({ scope: 'legacy-route', message: String(error?.message || error) });
}

await writeFile(OUT + '/report.json', JSON.stringify(report, null, 2) + '\n');
console.log('MARINEAQUA_SEO_CONFIG_PROBE=' + JSON.stringify(report));
if (report.errors.length) process.exitCode = 1;
