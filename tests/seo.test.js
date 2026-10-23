import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const origin = 'https://macromuse.vercel.app';
const root = new URL('../public/', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'");
const meta = (html, key) => {
  const tag = [...html.matchAll(/<meta\b[^>]*>/g)].find(([tag]) => tag.includes(`name="${key}"`) || tag.includes(`property="${key}"`));
  return tag ? decode(tag[0].match(/content="([^"]*)"/)[1]) : null;
};
const pages = readdirSync(root, { recursive: true }).filter(file => file.endsWith('.html')).map(file => {
  const html = read(file);
  return { file, html, path: file === 'index.html' ? '/' : '/' + file.slice(0, -5),
    canonical: html.match(/<link rel="canonical" href="([^"]+)"/g) || [],
    robots: meta(html, 'robots'),
  };
});
const privatePaths = ['/dashboard', '/meals', '/progress', '/aichef', '/settings', '/login', '/feedback', '/qr', '/offline'];

test('every page has unique static metadata and canonical links on the current domain', () => {
  const titles = new Set(), descriptions = new Set();
  for (const page of pages) {
    const titleTags = [...page.html.matchAll(/<title>(.*?)<\/title>/g)];
    assert.equal(titleTags.length, 1, page.file);
    const title = decode(titleTags[0][1]);
    assert(!titles.has(title), page.file); titles.add(title);
    const description = meta(page.html, 'description');
    assert(description && !descriptions.has(description), page.file); descriptions.add(description);
    assert.equal(page.canonical.length, 1, page.file);
    assert(page.canonical[0].includes(`href="${origin}${page.path}"`), page.file);
    assert.equal(meta(page.html, 'og:url'), origin + page.path, page.file);
    assert.equal(meta(page.html, 'og:title'), title, page.file);
    assert.equal(meta(page.html, 'twitter:title'), title, page.file);
    assert.equal(meta(page.html, 'og:description'), description, page.file);
    assert.equal(meta(page.html, 'twitter:description'), description, page.file);
    const image = new URL(meta(page.html, 'og:image'));
    assert.equal(image.origin, origin);
    assert(existsSync(new URL('.' + image.pathname, root)), page.file);
    assert(meta(page.html, 'og:image:alt'), page.file);
    assert(!page.html.includes('name="keywords"'), page.file);
  }
});

test('only public canonical pages appear in the sitemap; noindex pages remain crawlable', () => {
  const urls = [...read('sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  const expected = pages.filter(page => !privatePaths.includes(page.path)).map(page => origin + page.path);
  assert.equal(urls.length, new Set(urls).size);
  assert.deepEqual([...urls].sort(), expected.sort());
  for (const page of pages) {
    assert.equal(page.robots.startsWith('noindex'), privatePaths.includes(page.path), page.file);
    if (!privatePaths.includes(page.path)) assert(page.robots.includes('max-image-preview:large'), page.file);
  }
  const robots = read('robots.txt');
  assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
  assert(!/^Disallow:\s*\//m.test(robots), 'noindex responses must remain accessible to crawlers');
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const path of privatePaths) {
    const rule = config.headers.find(rule => rule.source === path);
    assert(rule?.headers.some(header => header.key === 'X-Robots-Tag' && header.value.startsWith('noindex')), path);
  }
  assert(config.redirects.some(rule => rule.source === '/index' && rule.destination === '/' && rule.permanent));
});

test('public structured data has truthful identities, prices, breadcrumbs and article dates', () => {
  for (const page of pages) {
    const blocks = [...page.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
    if (privatePaths.includes(page.path)) { assert.equal(blocks.length, 0); continue; }
    assert.equal(blocks.length, 1, page.file);
    assert.equal(blocks[0]['@context'], 'https://schema.org');
    const graph = blocks[0]['@graph'];
    const webPage = graph.find(node => node['@id'] === origin + page.path + '#webpage');
    assert.equal(webPage.url, origin + page.path, page.file);
    assert(!JSON.stringify(graph).match(/aggregateRating|ratingValue|reviewCount|nutriglance/i), page.file);
    if (page.path !== '/') {
      const trail = graph.find(node => node['@type'] === 'BreadcrumbList').itemListElement;
      assert.equal(trail[0].item, origin + '/');
      assert.equal(trail.at(-1).item, webPage.url);
      assert.deepEqual(trail.map(item => item.position), trail.map((_, index) => index + 1));
    }
    const article = graph.find(node => node['@type'] === 'BlogPosting');
    if (article) {
      assert(page.html.includes(`datetime="${article.datePublished}"`), page.file);
      assert(article.dateModified >= article.datePublished);
      assert.equal(article.author.name, 'MacroMuse');
      assert.equal(article.publisher.name, 'MacroMuse');
      assert.equal(article.mainEntityOfPage['@id'], webPage['@id']);
    }
  }
  const graph = JSON.parse(read('index.html').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const app = graph.find(node => node['@type'] === 'SoftwareApplication');
  assert.deepEqual(app.offers.map(offer => [offer.price, offer.priceCurrency]), [['0', 'USD'], ['5', 'USD'], ['500', 'INR']]);
  const organization = graph.find(node => node['@type'] === 'Organization');
  assert.equal(organization.email, 'macromuseai@gmail.com');
  assert(organization.sameAs.includes('https://instagram.com/macromuseai'));
  assert(organization.sameAs.includes('https://github.com/visheshsingh123/MacroMuse'));
  assert(read('index.html').includes('name="google-site-verification"'));
});
