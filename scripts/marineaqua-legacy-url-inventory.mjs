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

// The frontend sitemap currently points to an unrelated template host. Build a
// second, source-of-truth inventory from the live WordPress REST type/taxonomy
// registries instead of treating that broken sitemap as an empty storefront.
const currentWpOrigin = 'https://admin.marine-aqua.io.vn';
const currentRestRoutes = new Map();
async function fetchRestCollection(restBase, kind, routeFor) {
  const seen = new Set();
  for (let page = 1; page <= 100; page++) {
    const url = currentWpOrigin + '/wp-json/wp/v2/' + encodeURIComponent(restBase) +
      '?status=publish&per_page=100&page=' + page + '&_fields=slug,link,status,title';
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'MarineAqua-Legacy-URL-Audit/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      if ((response.status === 400 || response.status === 404) && page > 1) break;
      throw new Error(kind + ' REST inventory HTTP ' + response.status + ' ' + url);
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error(kind + ' REST inventory malformed');
    for (const row of rows) {
      const slug = String(row?.slug || '').trim();
      if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) continue;
      const path = routeFor(slug, row);
      if (!path) continue;
      if (seen.has(slug) && currentRestRoutes.has(path)) {
        throw new Error('Duplicate live REST route ' + path);
      }
      seen.add(slug);
      currentRestRoutes.set(path, { kind, slug, title: String(row?.title?.rendered || row?.title || ''), sourceLink: String(row?.link || '') });
    }
    if (rows.length < 100) break;
    if (page === 100) throw new Error(kind + ' REST inventory exceeded 100 pages');
  }
}
try {
  const [typesResponse, taxonomiesResponse] = await Promise.all([
    fetch(currentWpOrigin + '/wp-json/wp/v2/types?context=view', {
      headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000),
    }),
    fetch(currentWpOrigin + '/wp-json/wp/v2/taxonomies?context=view', {
      headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000),
    }),
  ]);
  if (!typesResponse.ok) throw new Error('WP types registry HTTP ' + typesResponse.status);
  if (!taxonomiesResponse.ok) throw new Error('WP taxonomies registry HTTP ' + taxonomiesResponse.status);
  const types = await typesResponse.json();
  const taxonomies = await taxonomiesResponse.json();
  const typeEntries = Object.values(types).filter(item => item?.rest_base && item?.slug);
  const taxonomyEntries = Object.values(taxonomies).filter(item => item?.rest_base && item?.slug);
  const productType = typeEntries.find(item => item.slug === 'product' || item.rest_base === 'products');
  const postType = typeEntries.find(item => item.slug === 'post' || item.rest_base === 'posts');
  const pageType = typeEntries.find(item => item.slug === 'page' || item.rest_base === 'pages');
  const productTaxonomy = taxonomyEntries.find(item => item.slug === 'product_cat' || item.rest_base === 'product_cat');
  const postTaxonomy = taxonomyEntries.find(item => item.slug === 'category' || item.rest_base === 'categories');
  const tagTaxonomy = taxonomyEntries.find(item => item.slug === 'product_tag' || item.rest_base === 'product_tag');
  if (productType) await fetchRestCollection(productType.rest_base, 'product', slug => '/san-pham/' + slug);
  if (postType) await fetchRestCollection(postType.rest_base, 'post', slug => '/' + slug);
  if (pageType) await fetchRestCollection(pageType.rest_base, 'page', (_slug, row) => {
    try { return normalizedPath(row.link); } catch { return null; }
  });
  if (productTaxonomy) await fetchRestCollection(productTaxonomy.rest_base, 'product-category', slug => '/san-pham/' + slug);
  if (postTaxonomy) await fetchRestCollection(postTaxonomy.rest_base, 'post-category', slug => '/cat/' + slug);
  if (tagTaxonomy) await fetchRestCollection(tagTaxonomy.rest_base, 'product-tag', slug => '/tu-khoa/' + slug);
  REPORT.sitemapSources.currentWordPressRest = {
    origin: currentWpOrigin,
    types: typeEntries.map(item => ({ slug: item.slug, rest_base: item.rest_base })),
    taxonomies: taxonomyEntries.map(item => ({ slug: item.slug, rest_base: item.rest_base })),
    routes: currentRestRoutes.size,
  };
} catch (error) {
  REPORT.errors.push({ scope: 'current-wordpress-rest', error: String(error?.message || error).slice(0, 500) });
}

const oldByPath = new Map(oldUrls.map(url => [normalizedPath(url), url]));
const newByPath = new Map(newUrls.map(url => [normalizedPath(url), url]));
for (const [path, metadata] of currentRestRoutes) {
  if (!newByPath.has(path)) newByPath.set(path, NEW_ORIGIN + path);
}
const newPaths = [...newByPath.keys()];

function normalizeTitle(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
const currentByTitle = new Map();
for (const [path, metadata] of currentRestRoutes) {
  const title = normalizeTitle(metadata.title);
  if (!title) continue;
  if (!currentByTitle.has(title)) currentByTitle.set(title, []);
  currentByTitle.get(title).push({ path, ...metadata });
}
const oldWpProducts = new Map();
const oldWpPages = new Map();
const oldWpPosts = new Map();
const oldProductTags = new Map();
const oldProductCategories = new Map();
try {
  const oldTypesResponse = await fetch(OLD_ORIGIN + '/wp-json/wp/v2/types?context=view', {
    headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000),
  });
  if (oldTypesResponse.ok) {
    const oldTypes = await oldTypesResponse.json();
    const oldProductType = Object.values(oldTypes).find(item => item?.slug === 'product' || item?.rest_base === 'product');
    const oldPageType = Object.values(oldTypes).find(item => item?.slug === 'page' || item?.rest_base === 'pages');
    const oldPostType = Object.values(oldTypes).find(item => item?.slug === 'post' || item?.rest_base === 'posts');
    const oldTaxonomiesResponse = await fetch(OLD_ORIGIN + '/wp-json/wp/v2/taxonomies?context=view', {
      headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000),
    });
    const oldTaxonomies = oldTaxonomiesResponse.ok ? await oldTaxonomiesResponse.json() : {};
    const oldProductCatTax = Object.values(oldTaxonomies).find(item => item?.slug === 'product_cat');
    const oldProductTagTax = Object.values(oldTaxonomies).find(item => item?.slug === 'product_tag');
    async function collectOld(restBase, target, kind) {
      for (let page = 1; page <= 100; page++) {
        const url = OLD_ORIGIN + '/wp-json/wp/v2/' + encodeURIComponent(restBase) +
          '?status=publish&per_page=100&page=' + page + '&_fields=slug,title,product_cat,product_tag,product_categories';
        const response = await fetch(url, {
          headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
          if ((response.status === 400 || response.status === 404) && page > 1) break;
          throw new Error('Old ' + restBase + ' REST inventory HTTP ' + response.status);
        }
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('Old ' + restBase + ' REST inventory malformed');
        for (const row of rows) {
          const slug = String(row?.slug || '');
          const title = normalizeTitle(row?.title?.rendered || row?.title || '');
          if (slug && title) {
            if (kind === 'product') {
              const categories = [];
              for (const item of Array.isArray(row?.product_categories) ? row.product_categories : []) {
                const value = String(item?.slug || '').trim();
                if (value) categories.push(value);
              }
              target.set(slug, {
                title,
                productCatIds: Array.isArray(row?.product_cat) ? row.product_cat.map(Number) : [],
                productTagIds: Array.isArray(row?.product_tag) ? row.product_tag.map(Number) : [],
                categorySlugs: [...new Set(categories)],
              });
            } else target.set(slug, title);
          }
        }
        if (rows.length < 100) break;
        if (page === 100) throw new Error('Old ' + restBase + ' inventory exceeded 100 pages');
      }
    }
    if (oldProductType?.rest_base) await collectOld(oldProductType.rest_base, oldWpProducts, 'product');
    if (oldPageType?.rest_base) await collectOld(oldPageType.rest_base, oldWpPages, 'page');
    if (oldPostType?.rest_base) await collectOld(oldPostType.rest_base, oldWpPosts, 'post');
    async function collectOldTerms(restBase, target) {
      if (!restBase) return;
      for (let page = 1; page <= 100; page++) {
        const url = OLD_ORIGIN + '/wp-json/wp/v2/' + encodeURIComponent(restBase) +
          '?per_page=100&page=' + page + '&_fields=id,slug,name';
        const response = await fetch(url, {
          headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
          if ((response.status === 400 || response.status === 404) && page > 1) break;
          throw new Error('Old taxonomy ' + restBase + ' HTTP ' + response.status);
        }
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('Old taxonomy ' + restBase + ' malformed');
        for (const row of rows) {
          if (Number(row?.id) > 0 && row?.slug) target.set(Number(row.id), String(row.slug));
        }
        if (rows.length < 100) break;
        if (page === 100) throw new Error('Old taxonomy ' + restBase + ' exceeded 100 pages');
      }
    }
    await collectOldTerms(oldProductCatTax?.rest_base, oldProductCategories);
    await collectOldTerms(oldProductTagTax?.rest_base, oldProductTags);
    for (const product of oldWpProducts.values()) {
      product.categorySlugs = [...new Set([
        ...product.categorySlugs,
        ...product.productCatIds.map(id => oldProductCategories.get(id)).filter(Boolean),
      ])];
      product.tagSlugs = product.productTagIds.map(id => oldProductTags.get(id)).filter(Boolean);
    }
    REPORT.sitemapSources.oldWordPressRest = {
      origin: OLD_ORIGIN,
      products: oldWpProducts.size,
      pages: oldWpPages.size,
      posts: oldWpPosts.size,
      productTags: oldProductTags.size,
      productCategories: oldProductCategories.size,
    };
  } else {
    throw new Error('Old WP types registry HTTP ' + oldTypesResponse.status);
  }
} catch (error) {
  REPORT.errors.push({ scope: 'old-wordpress-rest', error: String(error?.message || error).slice(0, 500) });
}
for (const [oldPath, oldUrl] of oldByPath) {
  if (newByPath.has(oldPath)) continue;
  let candidates = candidatePaths(oldPath, newPaths);
  let titleMatch = null;
  if (candidates.length === 0 && oldPath.startsWith('/san-pham/')) {
    const oldSlug = oldPath.split('/').filter(Boolean).at(-1);
    const oldProduct = oldWpProducts.get(oldSlug);
    const matches = oldProduct?.title ? (currentByTitle.get(oldProduct.title) || []).filter(item => item.kind === 'product') : [];
    if (matches.length === 1) {
      candidates = [matches[0].path];
      titleMatch = 'exact-product-title';
    } else if (oldProduct?.categorySlugs?.length) {
      const validCategories = [...new Set(oldProduct.categorySlugs)]
        .filter(slug => currentRestRoutes.has('/san-pham/' + slug));
      if (validCategories.length === 1) {
        candidates = ['/san-pham/' + validCategories[0]];
        titleMatch = 'product-category-fallback';
      }
    }
  }
  if (candidates.length === 0 && oldPath.startsWith('/tu-khoa/')) {
    const tagSlug = oldPath.split('/').filter(Boolean).at(-1);
    const categoryCounts = new Map();
    for (const product of oldWpProducts.values()) {
      if (!product.tagSlugs?.includes(tagSlug)) continue;
      for (const categorySlug of product.categorySlugs || []) {
        if (currentRestRoutes.has('/san-pham/' + categorySlug)) {
          categoryCounts.set(categorySlug, (categoryCounts.get(categorySlug) || 0) + 1);
        }
      }
    }
    const ranked = [...categoryCounts.entries()].filter(([slug]) => slug !== 'thuong-hieu').sort((a,b) => b[1]-a[1]);
    if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
      candidates = ['/san-pham/' + ranked[0][0]];
      titleMatch = 'product-tag-dominant-category';
    }
  }
  if (candidates.length === 0 && oldWpPages.has(oldPath.split('/').filter(Boolean).at(-1))) {
    const title = oldWpPages.get(oldPath.split('/').filter(Boolean).at(-1));
    const matches = title ? (currentByTitle.get(title) || []).filter(item => item.kind === 'page') : [];
    if (matches.length === 1) {
      candidates = [matches[0].path];
      titleMatch = 'exact-page-title';
    }
  }
  if (candidates.length === 0 && oldWpPosts.has(oldPath.split('/').filter(Boolean).at(-1))) {
    const title = oldWpPosts.get(oldPath.split('/').filter(Boolean).at(-1));
    const matches = title ? (currentByTitle.get(title) || []).filter(item => item.kind === 'post') : [];
    if (matches.length === 1) {
      candidates = [matches[0].path];
      titleMatch = 'exact-post-title';
    }
  }
  if (candidates.length === 0 && oldPath === '/bai-viet' && currentRestRoutes.has('/cat/tin-kien-thuc')) {
    candidates = ['/cat/tin-kien-thuc'];
    titleMatch = 'knowledge-archive-alias';
  }
  if (candidates.length === 0 && oldPath.startsWith('/tu-khoa/') && currentRestRoutes.has('/san-pham')) {
    const tagSlug = oldPath.split('/').filter(Boolean).at(-1);
    candidates = ['/san-pham?q=' + encodeURIComponent(String(tagSlug || '').replace(/-/g, ' '))];
    titleMatch = 'legacy-tag-product-search';
  }
  if (candidates.length === 1) {
    REPORT.mappings.push({
      from: oldPath,
      to: candidates[0],
      type: 301,
      confidence: titleMatch || (/^\/danh-muc\//i.test(oldPath) ? 'category-slug-live-match' : 'unique-final-slug'),
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
