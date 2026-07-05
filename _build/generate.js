#!/usr/bin/env node
/**
 * Programmatic SEO generator for Double Check scam pages.
 * Reads _data/scams.json + _templates/*.html, writes /scams/*.html + sitemap.xml
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const LASTMOD_MANIFEST = path.join(__dirname, '..', '_data', 'lastmod.json');
const DATA = path.join(ROOT, '_data', 'scams.json');
const GUIDES_DATA = path.join(ROOT, '_data', 'guides.json');
const ADVISOR_DATA = path.join(ROOT, '_data', 'advisor-pages.json');
const TPL_PAGE = path.join(ROOT, '_templates', 'scam.html');
const TPL_INDEX = path.join(ROOT, '_templates', 'index.html');
const TPL_GUIDE = path.join(ROOT, '_templates', 'guide.html');
const TPL_ADVISOR = path.join(ROOT, '_templates', 'advisor-page.html');
const OUT_DIR = path.join(ROOT, 'scams');
const GUIDES_OUT_DIR = path.join(ROOT, 'guides');
const ADVISOR_OUT_DIR = path.join(ROOT, 'advisor');

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

// Read a source file relative to ROOT; '' if missing (keeps the signature
// stable rather than throwing).
function srcSig(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
  catch { return ''; }
}

function buildSitemap(scams, guides, advisorPages) {
  const today = new Date().toISOString().slice(0, 10);
  const slugSig = arr => (arr || []).map(x => x.slug).sort().join(',');

  // Each URL carries a `sig` — a string that changes only when the page's
  // real content changes. We hash it and keep <lastmod> frozen across rebuilds
  // unless the hash moves. Previously every build stamped <lastmod>=today on
  // every URL, which trains Google to distrust the signal and deprioritize
  // recrawling (observed: scam pages last crawled 2026-05-21 despite daily churn).
  const staticPages = [
    { loc: 'https://mydoublecheck.app/', priority: '1.0', changefreq: 'weekly', sig: srcSig('index.html') },
    { loc: 'https://mydoublecheck.app/scams', priority: '0.9', changefreq: 'weekly', sig: slugSig(scams) },
    { loc: 'https://mydoublecheck.app/guides', priority: '0.9', changefreq: 'weekly', sig: slugSig(guides) },
    { loc: 'https://mydoublecheck.app/advisor', priority: '0.9', changefreq: 'weekly', sig: slugSig(advisorPages) },
    { loc: 'https://mydoublecheck.app/advisor/pricing', priority: '0.9', changefreq: 'monthly', sig: srcSig('advisor/pricing.html') },
    { loc: 'https://mydoublecheck.app/advisors', priority: '0.85', changefreq: 'monthly', sig: srcSig('advisors.html') },
    { loc: 'https://mydoublecheck.app/quiz', priority: '0.8', changefreq: 'daily', sig: srcSig('quiz.html') },
    { loc: 'https://mydoublecheck.app/risk-check', priority: '0.8', changefreq: 'monthly', sig: srcSig('risk-check.html') },
    { loc: 'https://mydoublecheck.app/save-contact', priority: '0.8', changefreq: 'monthly', sig: srcSig('save-contact.html') },
    { loc: 'https://calculator.mydoublecheck.app/', priority: '0.8', changefreq: 'monthly', sig: 'calculator' },
    { loc: 'https://mydoublecheck.app/support', priority: '0.5', changefreq: 'monthly', sig: srcSig('support.html') },
    { loc: 'https://mydoublecheck.app/privacy', priority: '0.3', changefreq: 'yearly', sig: srcSig('privacy.html') },
    { loc: 'https://mydoublecheck.app/terms', priority: '0.3', changefreq: 'yearly', sig: srcSig('terms.html') }
  ];
  const scamPages = scams.map(s => ({
    loc: `https://mydoublecheck.app/scams/${s.slug}`,
    priority: '0.8',
    changefreq: 'monthly',
    sig: JSON.stringify(s)
  }));
  const guidePages = (guides || []).map(g => ({
    loc: `https://mydoublecheck.app/guides/${g.slug}`,
    priority: '0.85',
    changefreq: 'monthly',
    sig: JSON.stringify(g)
  }));
  const advisorURLs = (advisorPages || []).map(p => ({
    loc: `https://mydoublecheck.app/advisor/${p.slug}`,
    priority: '0.9',
    changefreq: 'monthly',
    sig: JSON.stringify(p)
  }));

  const all = [...staticPages, ...scamPages, ...guidePages, ...advisorURLs];

  // Stable-date assignment via a committed manifest (url -> {hash, date}).
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(LASTMOD_MANIFEST, 'utf8')); } catch (_) {}
  const nextManifest = {};
  for (const u of all) {
    const hash = crypto.createHash('sha1').update(u.sig || '').digest('hex');
    const prev = manifest[u.loc];
    u.lastmod = (prev && prev.hash === hash) ? prev.date : today;
    nextManifest[u.loc] = { hash, date: u.lastmod };
  }
  fs.writeFileSync(LASTMOD_MANIFEST, JSON.stringify(nextManifest, null, 2) + '\n', 'utf8');

  const urls = all.map(u =>
    `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
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

function buildAdvisorSchemaJson(page) {
  const url = `https://mydoublecheck.app/advisor/${page.slug}`;
  return JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://mydoublecheck.app/" },
        { "@type": "ListItem", "position": 2, "name": "Advisor library", "item": "https://mydoublecheck.app/advisor" },
        { "@type": "ListItem", "position": 3, "name": page.h1, "item": url }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": page.title,
      "description": page.meta_description,
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
  ], null, 2);
}

function buildAdvisorRelatedSection(slugs, advisorBySlug) {
  if (!slugs || !slugs.length) return '';
  const cards = slugs.map(s => advisorBySlug[s]).filter(Boolean).map(p =>
    `<a href="/advisor/${p.slug}" class="related-card">
      <div class="related-sub">${esc(p.category)}</div>
      <div class="related-title">${esc(p.h1)}</div>
    </a>`
  ).join('\n      ');
  if (!cards) return '';
  return `<section class="sec">
    <h2>Related for advisors</h2>
    <div class="related-grid">
      ${cards}
    </div>
  </section>`;
}

function renderAdvisorPage(page, tpl, advisorBySlug) {
  return tpl
    .replace(/\{\{TITLE\}\}/g, esc(page.title))
    .replace(/\{\{META_DESCRIPTION\}\}/g, esc(page.meta_description))
    .replace(/\{\{SLUG\}\}/g, page.slug)
    .replace(/\{\{H1\}\}/g, esc(page.h1))
    .replace(/\{\{CATEGORY\}\}/g, esc(page.category))
    .replace(/\{\{LEDE\}\}/g, page.lede)
    .replace(/\{\{SECTIONS_HTML\}\}/g, buildGuideSectionsHtml(page.sections))
    .replace(/\{\{RELATED_SECTION\}\}/g, buildAdvisorRelatedSection(page.related, advisorBySlug))
    .replace(/\{\{SCHEMA_JSON\}\}/g, buildAdvisorSchemaJson(page));
}

function renderAdvisorIndex(pages) {
  const byCat = {};
  pages.forEach(p => {
    if (!byCat[p.category]) byCat[p.category] = [];
    byCat[p.category].push(p);
  });
  const order = ['Compliance', 'Pain points', 'Comparisons'];
  const cats = Object.keys(byCat).sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const categoryHTML = cats.map(cat => {
    const cards = byCat[cat].map(p => `<a href="/advisor/${p.slug}" class="scam-card">
      <div class="scam-title">${esc(p.h1)}</div>
      <div class="scam-desc">${esc(p.meta_description)}</div>
      <div class="scam-cta">Read &rarr;</div>
    </a>`).join('\n      ');
    return `<div class="category-section">
    <h2 class="category-title">${esc(cat)}</h2>
    <div class="scam-grid">
      ${cards}
    </div>
  </div>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Advisor Library — Compliance, Client Protection, Tools | Double Check</title>
  <meta name="description" content="Practical guides for financial advisors on protecting elderly clients: Senior Safe Act, FINRA Rule 2165, red flags, diminished capacity, and tool comparisons." />
  <link rel="canonical" href="https://mydoublecheck.app/advisor" />
  <meta property="og:title" content="Advisor Library — Double Check" />
  <meta property="og:description" content="Practical guides for advisors protecting elderly clients." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://mydoublecheck.app/advisor" />
  <meta property="og:image" content="https://mydoublecheck.app/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="https://mydoublecheck.app/og-image.png" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --navy:#0f172a;--blue:#2563eb;--blue-dark:#1d4ed8;--blue-light:#eff6ff;--blue-mid:#dbeafe;--text:#0f172a;--muted:#475569;--subtle:#94a3b8;--border:#e2e8f0;--bg:#fafaf9;--bg-subtle:#f4f4f0; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    nav { position: sticky; top: 0; z-index: 100; background: rgba(250,250,249,0.97); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
    .nav-inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; height: 64px; padding: 0 24px; }
    .logo { font-size: 20px; font-weight: 800; color: var(--text); text-decoration: none; }
    .logo span { color: var(--blue); }
    .nav-link { font-size: 15px; font-weight: 500; color: var(--muted); text-decoration: none; padding: 8px 12px; border-radius: 8px; }
    .btn-primary { background: var(--blue); color: #fff; padding: 10px 20px; border-radius: 8px; font-size: 15px; font-weight: 600; text-decoration: none; }
    .hero { padding: 64px 24px 40px; }
    .hero-inner { max-width: 800px; margin: 0 auto; text-align: center; }
    .eyebrow { display: inline-flex; font-size: 13px; font-weight: 700; color: var(--blue); background: var(--blue-light); border: 1px solid var(--blue-mid); border-radius: 20px; padding: 5px 14px; margin-bottom: 22px; text-transform: uppercase; letter-spacing: 0.6px; }
    h1 { font-size: clamp(34px, 5vw, 52px); font-weight: 800; line-height: 1.12; letter-spacing: -0.6px; margin-bottom: 18px; }
    h1 em { font-style: normal; color: var(--blue); }
    .hero-sub { font-size: clamp(17px, 2vw, 20px); color: var(--muted); max-width: 620px; margin: 0 auto; line-height: 1.65; }
    .content { max-width: 1100px; margin: 0 auto; padding: 28px 24px 60px; }
    .category-section { margin-bottom: 40px; }
    .category-title { font-size: 18px; font-weight: 800; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--blue); }
    .scam-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
    .scam-card { background: #fff; border: 1.5px solid var(--border); border-radius: 14px; padding: 22px; text-decoration: none; display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: all 0.15s; }
    .scam-card:hover { border-color: var(--blue); transform: translateY(-2px); box-shadow: 0 6px 18px rgba(37,99,235,0.1); }
    .scam-title { font-size: 17px; font-weight: 700; color: var(--text); line-height: 1.35; margin-bottom: 10px; }
    .scam-desc { font-size: 14px; color: var(--muted); line-height: 1.55; flex: 1; }
    .scam-cta { font-size: 14px; color: var(--blue); font-weight: 600; margin-top: 14px; }
    footer { background: var(--navy); color: rgba(255,255,255,0.6); padding: 52px 24px 36px; margin-top: 60px; }
    .footer-inner { max-width: 1000px; margin: 0 auto; }
    .footer-logo { font-size: 18px; font-weight: 800; color: #fff; margin-bottom: 10px; }
    .footer-logo span { color: #60a5fa; }
  </style>
  <script defer src="/_vercel/insights/script.js"></script>
  <script defer src="/_vercel/speed-insights/script.js"></script>
</head>
<body>

<nav>
  <div class="nav-inner">
    <a href="/" class="logo">Double<span>Check</span></a>
    <div style="display:flex;align-items:center;gap:8px;">
      <a href="/advisors" class="nav-link">For advisors</a>
      <a href="/advisor/pricing" class="nav-link">Pricing</a>
      <a href="/scams" class="nav-link">Scam guide</a>
      <a href="https://advisor.mydoublecheck.app?utm_source=landing&utm_medium=advisor-content&utm_campaign=advisor-library" class="btn-primary" target="_blank" rel="noopener">Advisor Login</a>
    </div>
  </div>
</nav>

<section class="hero">
  <div class="hero-inner">
    <div class="eyebrow">For financial advisors &middot; Updated for 2026</div>
    <h1>Advisor library: protecting clients <em>before</em> the loss.</h1>
    <p class="hero-sub">Practical guides on the compliance, conversations, and tools that protect elderly clients. Senior Safe Act, FINRA Rule 2165, red flags, diminished capacity, and tool comparisons.</p>
  </div>
</section>

<main class="content">
  <a href="/advisor/pricing" class="scam-card" style="background:var(--blue-light);border-color:var(--blue-mid);margin-bottom:36px;">
    <div class="scam-title" style="color:var(--blue-dark);">Bulk seats for your whole book &rarr; $2/client/month</div>
    <div class="scam-desc">Protect every client at once. Volume pricing from 25 seats, one invoice, and a quarterly compliance report that documents your Senior Safe Act / FINRA 2165 supervision.</div>
    <div class="scam-cta">See advisor pricing &rarr;</div>
  </a>
${categoryHTML}
</main>

<footer>
  <div class="footer-inner" style="text-align:center;color:rgba(255,255,255,0.5);font-size:13px;">
    <div class="footer-logo">Double<span>Check</span></div>
    <p>&copy; 2026 Double Check. For guidance only &mdash; not legal advice.</p>
  </div>
</footer>

</body>
</html>
`;
}


function buildGuidesIndex(guides) {
  const groups = [
    { title: 'Scam protection guides', items: guides.filter(g => !g.slug.startsWith('double-check-vs-') && !g.slug.includes('statistics')) },
    { title: 'Double Check vs other tools', items: guides.filter(g => g.slug.startsWith('double-check-vs-')) },
    { title: 'Data & statistics', items: guides.filter(g => g.slug.includes('statistics')) }
  ];
  const categoryHTML = groups.filter(g => g.items.length).map(cat => {
    const cards = cat.items.map(g => `<a class="scam-card" href="/guides/${g.slug}">
      <div class="scam-title">${esc(g.h1 || g.title)}</div>
      <div class="scam-desc">${esc(g.meta_description)}</div>
      <div class="scam-cta">Read &rarr;</div>
    </a>`).join('\n      ');
    return `<div class="category-section">
    <h2 class="category-title">${esc(cat.title)}</h2>
    <div class="scam-grid">
      ${cards}
    </div>
  </div>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Scam Protection Guides — Texts, Calls, Investments, Seniors | Double Check</title>
  <meta name="description" content="Free 2026 guides to recognizing text, phone, investment, and banking scams, protecting elderly family members, and comparing scam-detection tools." />
  <link rel="canonical" href="https://mydoublecheck.app/guides" />
  <meta property="og:title" content="Scam Protection Guides — Double Check" />
  <meta property="og:description" content="Free 2026 guides to recognizing scams and protecting your family." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://mydoublecheck.app/guides" />
  <meta property="og:image" content="https://mydoublecheck.app/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="https://mydoublecheck.app/og-image.png" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --navy:#0f172a;--blue:#2563eb;--blue-dark:#1d4ed8;--blue-light:#eff6ff;--blue-mid:#dbeafe;--text:#0f172a;--muted:#475569;--subtle:#94a3b8;--border:#e2e8f0;--bg:#fafaf9;--bg-subtle:#f4f4f0; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    nav { position: sticky; top: 0; z-index: 100; background: rgba(250,250,249,0.97); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
    .nav-inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; height: 64px; padding: 0 24px; }
    .logo { font-size: 20px; font-weight: 800; color: var(--text); text-decoration: none; }
    .logo span { color: var(--blue); }
    .nav-link { font-size: 15px; font-weight: 500; color: var(--muted); text-decoration: none; padding: 8px 12px; border-radius: 8px; }
    .btn-primary { background: var(--blue); color: #fff; padding: 10px 20px; border-radius: 8px; font-size: 15px; font-weight: 600; text-decoration: none; }
    .hero { padding: 64px 24px 40px; }
    .hero-inner { max-width: 800px; margin: 0 auto; text-align: center; }
    .eyebrow { display: inline-flex; font-size: 13px; font-weight: 700; color: var(--blue); background: var(--blue-light); border: 1px solid var(--blue-mid); border-radius: 20px; padding: 5px 14px; margin-bottom: 22px; text-transform: uppercase; letter-spacing: 0.6px; }
    h1 { font-size: clamp(34px, 5vw, 52px); font-weight: 800; line-height: 1.12; letter-spacing: -0.6px; margin-bottom: 18px; }
    h1 em { font-style: normal; color: var(--blue); }
    .hero-sub { font-size: clamp(17px, 2vw, 20px); color: var(--muted); max-width: 620px; margin: 0 auto; line-height: 1.65; }
    .content { max-width: 1100px; margin: 0 auto; padding: 28px 24px 60px; }
    .category-section { margin-bottom: 40px; }
    .category-title { font-size: 18px; font-weight: 800; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--blue); }
    .scam-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
    .scam-card { background: #fff; border: 1.5px solid var(--border); border-radius: 14px; padding: 22px; text-decoration: none; display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: all 0.15s; }
    .scam-card:hover { border-color: var(--blue); transform: translateY(-2px); box-shadow: 0 6px 18px rgba(37,99,235,0.1); }
    .scam-title { font-size: 17px; font-weight: 700; color: var(--text); line-height: 1.35; margin-bottom: 10px; }
    .scam-desc { font-size: 14px; color: var(--muted); line-height: 1.55; flex: 1; }
    .scam-cta { font-size: 14px; color: var(--blue); font-weight: 600; margin-top: 14px; }
    footer { background: var(--navy); color: rgba(255,255,255,0.6); padding: 52px 24px 36px; margin-top: 60px; }
    .footer-inner { max-width: 1000px; margin: 0 auto; }
    .footer-logo { font-size: 18px; font-weight: 800; color: #fff; margin-bottom: 10px; }
    .footer-logo span { color: #60a5fa; }
  </style>
  <script defer src="/_vercel/insights/script.js"></script>
  <script defer src="/_vercel/speed-insights/script.js"></script>
</head>
<body>

<nav>
  <div class="nav-inner">
    <a href="/" class="logo">Double<span>Check</span></a>
    <div style="display:flex;align-items:center;gap:8px;">
      <a href="/scams" class="nav-link">Scam guide</a>
      <a href="/advisor" class="nav-link">For advisors</a>
      <a href="https://apps.apple.com/app/apple-store/id6761861061?pt=128759565&ct=guides-index&mt=8" class="btn-primary" target="_blank" rel="noopener">Download the App</a>
    </div>
  </div>
</nav>

<section class="hero">
  <div class="hero-inner">
    <div class="eyebrow">Free guides &middot; Updated for 2026</div>
    <h1>Learn to spot <em>any</em> scam.</h1>
    <p class="hero-sub">Plain-English guides to recognizing text, phone, investment, and banking scams, protecting elderly family members, and choosing the right protection tools.</p>
  </div>
</section>

<main class="content">
${categoryHTML}
</main>

<footer>
  <div class="footer-inner" style="text-align:center;color:rgba(255,255,255,0.5);font-size:13px;">
    <div class="footer-logo">Double<span>Check</span></div>
    <p>&copy; 2026 Double Check. For guidance only &mdash; always verify before acting.</p>
  </div>
</footer>

</body>
</html>
`;
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
  fs.writeFileSync(path.join(GUIDES_OUT_DIR, 'index.html'), buildGuidesIndex(guides), 'utf8');
  console.log('  wrote /guides/index.html');
  guides.forEach(g => {
    const html = renderGuide(g, tplGuide, bySlug);
    fs.writeFileSync(path.join(GUIDES_OUT_DIR, `${g.slug}.html`), html, 'utf8');
    console.log(`  wrote /guides/${g.slug}.html`);
  });
}

// Generate advisor pages
let advisorPages = [];
if (fs.existsSync(ADVISOR_DATA)) {
  advisorPages = JSON.parse(fs.readFileSync(ADVISOR_DATA, 'utf8'));
  const tplAdvisor = fs.readFileSync(TPL_ADVISOR, 'utf8');
  if (!fs.existsSync(ADVISOR_OUT_DIR)) fs.mkdirSync(ADVISOR_OUT_DIR, { recursive: true });
  const advisorBySlug = {};
  advisorPages.forEach(p => { advisorBySlug[p.slug] = p; });
  advisorPages.forEach(p => {
    const html = renderAdvisorPage(p, tplAdvisor, advisorBySlug);
    fs.writeFileSync(path.join(ADVISOR_OUT_DIR, `${p.slug}.html`), html, 'utf8');
    console.log(`  wrote /advisor/${p.slug}.html`);
  });
  fs.writeFileSync(path.join(ADVISOR_OUT_DIR, 'index.html'), renderAdvisorIndex(advisorPages), 'utf8');
  console.log(`  wrote /advisor/index.html`);
}

// Generate sitemap + robots
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap(scams, guides, advisorPages), 'utf8');
console.log(`  wrote /sitemap.xml`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), buildRobots(), 'utf8');
console.log(`  wrote /robots.txt`);

console.log(`\n✓ Generated ${count} scam pages + ${guides.length} guides + ${advisorPages.length} advisor pages + sitemap + robots`);
