#!/usr/bin/env node
/**
 * Programmatic SEO generator for Double Check scam pages.
 * Reads _data/scams.json + _templates/*.html, writes /scams/*.html + sitemap.xml
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, '_data', 'scams.json');
const GUIDES_DATA = path.join(ROOT, '_data', 'guides.json');
const TPL_PAGE = path.join(ROOT, '_templates', 'scam.html');
const TPL_INDEX = path.join(ROOT, '_templates', 'index.html');
const TPL_GUIDE = path.join(ROOT, '_templates', 'guide.html');
const OUT_DIR = path.join(ROOT, 'scams');
const GUIDES_OUT_DIR = path.join(ROOT, 'guides');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildRedFlagsHtml(flags) {
  return flags.map((f, i) =>
    `<li class="flag"><div class="flag-icon">${i + 1}</div><div class="flag-text">${esc(f)}</div></li>`
  ).join('\n      ');
}

function buildExamplesHtml(examples) {
  return examples.map(ex => {
    const verdictLabel = ex.verdict === 'scam' ? 'Likely Scam'
      : ex.verdict === 'safe' ? 'Safe'
      : 'Action Required';
    return `<div class="example-card">
      <div class="example-type">${esc(ex.type)}</div>
      <div class="example-msg">${esc(ex.message)}</div>
      <span class="verdict-badge ${ex.verdict}"><span class="verdict-dot"></span>${verdictLabel}</span>
      <div class="example-reason">${esc(ex.reason)}</div>
    </div>`;
  }).join('\n    ');
}

function buildActionsHtml(actions) {
  return actions.map(a => `<li>${esc(a)}</li>`).join('\n      ');
}

function buildFaqHtml(faq) {
  return faq.map(f =>
    `<div class="faq-item"><div class="faq-q">${esc(f.q)}</div><div class="faq-a">${esc(f.a)}</div></div>`
  ).join('\n    ');
}

function buildRelatedSection(relatedSlugs, allScamsBySlug) {
  if (!relatedSlugs || !relatedSlugs.length) return '';
  const cards = relatedSlugs
    .map(slug => allScamsBySlug[slug])
    .filter(Boolean)
    .map(s => `<a href="/scams/${s.slug}" class="related-card">
      <div class="related-title">${esc(s.h1)}</div>
      <div class="related-sub">${esc(s.category)}</div>
    </a>`).join('\n      ');
  if (!cards) return '';
  return `<section class="sec">
    <h2>Related scams</h2>
    <div class="related-grid">
      ${cards}
    </div>
  </section>`;
}

function buildSchemaJson(scam) {
  const url = `https://mydoublecheck.app/scams/${scam.slug}`;
  const schemas = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://mydoublecheck.app/" },
        { "@type": "ListItem", "position": 2, "name": "Scam guide", "item": "https://mydoublecheck.app/scams" },
        { "@type": "ListItem", "position": 3, "name": scam.h1, "item": url }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": scam.title,
      "description": scam.meta_description,
      "url": url,
      "author": { "@type": "Organization", "name": "Double Check" },
      "publisher": {
        "@type": "Organization",
        "name": "Double Check",
        "logo": { "@type": "ImageObject", "url": "https://mydoublecheck.app/favicon.svg" }
      },
      "datePublished": "2026-05-21",
      "dateModified": "2026-05-21"
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      "name": `What to do if you receive a ${scam.h1.replace(/^Is the |^What is a |^How do |\?$/g, '').trim()}`,
      "description": `Step-by-step response if you've received this scam.`,
      "step": scam.what_to_do.map((s, i) => ({
        "@type": "HowToStep",
        "position": i + 1,
        "name": `Step ${i + 1}`,
        "text": s
      }))
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": scam.faq.map(f => ({
        "@type": "Question",
        "name": f.q,
        "acceptedAnswer": { "@type": "Answer", "text": f.a }
      }))
    }
  ];
  return JSON.stringify(schemas, null, 2);
}

function renderPage(scam, tpl, allScamsBySlug) {
  return tpl
    .replace(/\{\{TITLE\}\}/g, esc(scam.title))
    .replace(/\{\{META_DESCRIPTION\}\}/g, esc(scam.meta_description))
    .replace(/\{\{SLUG\}\}/g, scam.slug)
    .replace(/\{\{H1\}\}/g, esc(scam.h1))
    .replace(/\{\{CRUMB_TITLE\}\}/g, esc(scam.h1))
    .replace(/\{\{CATEGORY\}\}/g, esc(scam.category))
    .replace(/\{\{SHORT_ANSWER\}\}/g, esc(scam.short_answer))
    .replace(/\{\{RED_FLAGS_HTML\}\}/g, buildRedFlagsHtml(scam.red_flags))
    .replace(/\{\{EXAMPLES_HTML\}\}/g, buildExamplesHtml(scam.examples))
    .replace(/\{\{ACTIONS_HTML\}\}/g, buildActionsHtml(scam.what_to_do))
    .replace(/\{\{WHY_SCAMMERS\}\}/g, esc(scam.why_scammers_use))
    .replace(/\{\{FAQ_HTML\}\}/g, buildFaqHtml(scam.faq))
    .replace(/\{\{RELATED_SECTION\}\}/g, buildRelatedSection(scam.related, allScamsBySlug))
    .replace(/\{\{SCHEMA_JSON\}\}/g, buildSchemaJson(scam));
}

function renderIndex(scams, tpl) {
  // Group by category
  const byCat = {};
  scams.forEach(s => {
    if (!byCat[s.category]) byCat[s.category] = [];
    byCat[s.category].push(s);
  });

  const categoryOrder = [
    'Delivery & shipping',
    'E-commerce',
    'Government impersonation',
    'Banking',
    'Tech support',
    'Impersonation',
    'Romance & investment',
    'Job scams',
    'Marketplace & rental',
    'Lottery & prize',
    'Phone scams',
    'Utility'
  ];

  const cats = Object.keys(byCat).sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const html = cats.map(cat => {
    const cards = byCat[cat].map(s => `<a href="/scams/${s.slug}" class="scam-card">
      <div class="scam-title">${esc(s.h1)}</div>
      <div class="scam-desc">${esc(s.meta_description)}</div>
      <div class="scam-cta">Read the guide &rarr;</div>
    </a>`).join('\n      ');
    return `<div class="category-section">
    <h2 class="category-title">${esc(cat)}</h2>
    <div class="scam-grid">
      ${cards}
    </div>
  </div>`;
  }).join('\n  ');

  return tpl.replace(/\{\{CATEGORIES_HTML\}\}/g, html);
}

function buildSitemap(scams, guides) {
  const today = new Date().toISOString().slice(0, 10);
  const staticPages = [
    { loc: 'https://mydoublecheck.app/', priority: '1.0', changefreq: 'weekly' },
    { loc: 'https://mydoublecheck.app/scams', priority: '0.9', changefreq: 'weekly' },
    { loc: 'https://mydoublecheck.app/advisors', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://mydoublecheck.app/support', priority: '0.5', changefreq: 'monthly' },
    { loc: 'https://mydoublecheck.app/privacy', priority: '0.3', changefreq: 'yearly' },
    { loc: 'https://mydoublecheck.app/terms', priority: '0.3', changefreq: 'yearly' }
  ];
  const scamPages = scams.map(s => ({
    loc: `https://mydoublecheck.app/scams/${s.slug}`,
    priority: '0.8',
    changefreq: 'monthly'
  }));
  const guidePages = (guides || []).map(g => ({
    loc: `https://mydoublecheck.app/guides/${g.slug}`,
    priority: '0.85',
    changefreq: 'monthly'
  }));
  const urls = [...staticPages, ...scamPages, ...guidePages].map(u =>
    `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function buildGuideSchemaJson(guide) {
  const url = `https://mydoublecheck.app/guides/${guide.slug}`;
  const schemas = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://mydoublecheck.app/" },
        { "@type": "ListItem", "position": 2, "name": "Scam guide", "item": "https://mydoublecheck.app/scams" },
        { "@type": "ListItem", "position": 3, "name": guide.h1, "item": url }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": guide.title,
      "description": guide.meta_description,
      "url": url,
      "image": "https://mydoublecheck.app/og-image.png",
      "author": { "@type": "Organization", "name": "Double Check" },
      "publisher": {
        "@type": "Organization",
        "name": "Double Check",
        "logo": { "@type": "ImageObject", "url": "https://mydoublecheck.app/favicon.svg" }
      },
      "datePublished": "2026-05-21",
      "dateModified": "2026-05-21"
    }
  ];
  return JSON.stringify(schemas, null, 2);
}

function buildGuideSectionsHtml(sections) {
  return sections.map(s => {
    const paras = s.p.map(p => `    <p>${p}</p>`).join('\n');
    return `<section class="sec">
    <h2>${esc(s.h)}</h2>
${paras}
  </section>`;
  }).join('\n\n  ');
}

function buildGuideRelatedSection(slugs, scamsBySlug) {
  if (!slugs || !slugs.length) return '';
  const cards = slugs.map(slug => scamsBySlug[slug]).filter(Boolean).map(s =>
    `<a href="/scams/${s.slug}" class="related-card">
      <div class="related-title">${esc(s.h1)}</div>
      <div class="related-sub">${esc(s.category)}</div>
    </a>`
  ).join('\n      ');
  if (!cards) return '';
  return `<section class="sec">
    <h2>Specific scam guides</h2>
    <div class="related-grid">
      ${cards}
    </div>
  </section>`;
}

function renderGuide(guide, tpl, scamsBySlug) {
  return tpl
    .replace(/\{\{TITLE\}\}/g, esc(guide.title))
    .replace(/\{\{META_DESCRIPTION\}\}/g, esc(guide.meta_description))
    .replace(/\{\{SLUG\}\}/g, guide.slug)
    .replace(/\{\{H1\}\}/g, esc(guide.h1))
    .replace(/\{\{LEDE\}\}/g, guide.lede)
    .replace(/\{\{SECTIONS_HTML\}\}/g, buildGuideSectionsHtml(guide.sections))
    .replace(/\{\{RELATED_SECTION\}\}/g, buildGuideRelatedSection(guide.related_scams, scamsBySlug))
    .replace(/\{\{SCHEMA_JSON\}\}/g, buildGuideSchemaJson(guide));
}

function buildRobots() {
  return `User-agent: *
Allow: /

Sitemap: https://mydoublecheck.app/sitemap.xml
`;
}

// MAIN
const scams = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const tplPage = fs.readFileSync(TPL_PAGE, 'utf8');
const tplIndex = fs.readFileSync(TPL_INDEX, 'utf8');

const bySlug = {};
scams.forEach(s => { bySlug[s.slug] = s; });

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Generate individual pages
let count = 0;
scams.forEach(scam => {
  const html = renderPage(scam, tplPage, bySlug);
  const outPath = path.join(OUT_DIR, `${scam.slug}.html`);
  fs.writeFileSync(outPath, html, 'utf8');
  count++;
  console.log(`  wrote /scams/${scam.slug}.html`);
});

// Generate index
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderIndex(scams, tplIndex), 'utf8');
console.log(`  wrote /scams/index.html`);

// Generate guides
let guides = [];
if (fs.existsSync(GUIDES_DATA)) {
  guides = JSON.parse(fs.readFileSync(GUIDES_DATA, 'utf8'));
  const tplGuide = fs.readFileSync(TPL_GUIDE, 'utf8');
  if (!fs.existsSync(GUIDES_OUT_DIR)) fs.mkdirSync(GUIDES_OUT_DIR, { recursive: true });
  guides.forEach(g => {
    const html = renderGuide(g, tplGuide, bySlug);
    fs.writeFileSync(path.join(GUIDES_OUT_DIR, `${g.slug}.html`), html, 'utf8');
    console.log(`  wrote /guides/${g.slug}.html`);
  });
}

// Generate sitemap + robots
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap(scams, guides), 'utf8');
console.log(`  wrote /sitemap.xml`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), buildRobots(), 'utf8');
console.log(`  wrote /robots.txt`);

console.log(`\n✓ Generated ${count} scam pages + ${guides.length} guides + index + sitemap + robots`);
