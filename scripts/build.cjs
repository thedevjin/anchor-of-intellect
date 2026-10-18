'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'dist');
const PAGES = ['home', 'charter', 'revisions', 'about'];
const LANGUAGES = ['en', 'ko', 'fr'];
const LANGUAGE_LABELS = {en: 'EN', ko: '한국어', fr: 'FR'};
const ICON_FILES = ['aoi-mark.svg', 'favicon.svg', 'favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
const languageTag = lang => lang === 'fr' ? 'fr-FR' : lang;
const WORDS = {
  en: {
    labels: ['Home', 'The Charter', 'Revisions', 'About'],
    project: 'A research project initiated by Jin Sung',
    author: 'Jin Sung',
    read: 'Read the draft charter', skip: 'Skip to content',
    contents: 'On this page', source: 'Read the source',
    license: 'Text license', related: 'Related work',
    footer: 'Greater intelligence, in support of human possibility.',
    draft: 'Draft 0.1 · 18 October 2026',
    download: 'This page in Markdown'
  },
  ko: {
    labels: ['홈', '헌장', '개정 기록', '소개'],
    project: 'Jin Sung (성진)이 시작한 연구 프로젝트',
    author: 'Jin Sung (성진)',
    read: '헌장 초안 읽기', skip: '본문으로 이동',
    contents: '이 페이지의 내용', source: '원문 보기',
    license: '문서 라이선스', related: '관련 작업',
    footer: '더 큰 지능이, 사람의 가능성으로 이어지도록.',
    draft: '초안 0.1 · 2026년 10월 18일',
    download: '이 페이지의 Markdown 원문'
  },
  fr: {
    labels: ['Accueil', 'La charte', 'Révisions', 'À propos'],
    project: 'Un projet de recherche initié par Jin Sung',
    author: 'Jin Sung',
    read: 'Lire le projet de charte', skip: 'Aller au contenu',
    contents: 'Sur cette page', source: 'Lire le texte source',
    license: 'Licence des textes', related: 'Travaux connexes',
    footer: 'Une intelligence plus puissante, au service du potentiel humain.',
    draft: 'Version de travail 0.1 · 18 octobre 2026',
    download: 'Cette page au format Markdown',
    navigation: 'Navigation principale', language: 'Langue',
    original: 'Textes originaux A.O.I. · CC BY 4.0'
  }
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function relativeUrl(fromFile, toFile) {
  const result = path.posix.relative(path.posix.dirname(fromFile), toFile);
  return result || path.posix.basename(toFile);
}

function route(lang, page) {
  if (!LANGUAGES.includes(lang) || !PAGES.includes(page)) throw new Error('Unsupported page or language');
  return (lang === 'en' ? '' : lang + '/') + (page === 'home' ? '' : page + '/') + 'index.html';
}

function publicPath(lang, page) {
  return '/' + route(lang, page).replace(/index\.html$/, '');
}

function parseMarkdown(source) {
  const text = source.replace(/\r\n?/g, '\n').trim();
  const blocks = text.split(/\n\s*\n/);
  if (!/^# [^\n]+$/.test(blocks[0])) throw new Error('Every page needs one opening H1');
  const title = blocks.shift().slice(2);
  const sections = [];
  let sectionCount = 0;
  const html = blocks.map(block => {
    if (/^## [^\n]+$/.test(block)) {
      const title = block.slice(3);
      const id = 'section-' + (++sectionCount);
      sections.push({ title, id });
      return '<h2 id="' + id + '">' + escapeHtml(title) + '</h2>';
    }
    if (/^#/m.test(block)) throw new Error('Unsupported heading structure');
    return '<p>' + escapeHtml(block.replace(/\n/g, ' ')) + '</p>';
  }).join('\n');
  return { title, sections, html, blocks };
}

function renderPage(lang, page, source, config) {
  const words = WORDS[lang];
  const file = route(lang, page);
  const parsed = parseMarkdown(source);
  const url = target => escapeHtml(relativeUrl(file, target));
  const nav = PAGES.map((key, i) =>
    '<a href="' + url(route(lang, key)) + '"' +
    (key === page ? ' aria-current="page"' : '') + '>' + escapeHtml(words.labels[i]) + '</a>'
  ).join('\n');
  const langSwitch = LANGUAGES.map(code => code === lang
    ? '<span aria-current="true" lang="' + languageTag(code) + '">' + LANGUAGE_LABELS[code] + '</span>'
    : '<a href="' + url(route(code, page)) + '" hreflang="' + languageTag(code) + '" lang="' + languageTag(code) + '">' + LANGUAGE_LABELS[code] + '</a>'
  ).join(' / ');
  const isHome = page === 'home';
  let content;
  if (isHome) {
    // Three opening paragraphs form the hero; every remaining source block stays in the body.
    const first = parsed.blocks.slice(0, 3);
    if (first.some(block => block.startsWith('#'))) throw new Error('Home opening must be three paragraphs');
    const rest = parseMarkdown('# Body\n\n' + parsed.blocks.slice(3).join('\n\n'));
    content = '<section class="hero"><div><p class="eyebrow">' + escapeHtml(words.project) + '</p>' +
      '<h1>' + escapeHtml(parsed.title) + '</h1><p class="hero-deck">' + escapeHtml(first[0]) + '</p>' +
      '<a class="primary-link" href="' + url(route(lang, 'charter')) + '">' + escapeHtml(words.read) + ' ↗</a></div>' +
      '<div class="hero-side"><p>' + escapeHtml(first[1]) + '</p><p>' + escapeHtml(first[2]) + '</p>' +
      '<p class="version">' + escapeHtml(words.draft) + '</p></div></section>' +
      '<article class="home-body">' + rest.html + sourceLinks() + '</article>';
  } else {
    const toc = parsed.sections.map(section => '<li><a href="#' + section.id + '">' + escapeHtml(section.title) + '</a></li>').join('\n');
    content = '<header class="document-header"><p class="eyebrow">Anchor of Intellect</p><h1>' +
      escapeHtml(parsed.title) + '</h1><p class="version">' + escapeHtml(words.draft) + '</p></header>' +
      '<div class="document-layout"><aside class="contents" aria-label="' + escapeHtml(words.contents) +
      '"><h2>' + escapeHtml(words.contents) + '</h2><ol>' + toc +
      '</ol></aside><article class="article">' + parsed.html + sourceLinks() + '</article></div>';
  }
  function sourceLinks() {
    return '<div class="source-links"><a href="' + url('sources/' + lang + '/' + page + '.md') +
      '" aria-label="' + escapeHtml(words.download) + '">' + escapeHtml(words.source) +
      ' (.md)</a><a href="' + url('license-documentation.txt') + '">' + escapeHtml(words.license) + ' · CC BY 4.0</a></div>';
  }
  const origin = new URL(config.siteOrigin);
  const canonical = new URL(publicPath(lang, page), origin).href;
  const alternates = LANGUAGES.map(code => '<link rel="alternate" hreflang="' + languageTag(code) +
    '" href="' + escapeHtml(new URL(publicPath(code, page), origin).href) + '">').join('\n');
  const description = isHome ? parsed.blocks[1] : parsed.blocks.find(block => !block.startsWith('#'));
  return '<!doctype html>\n<html lang="' + languageTag(lang) + '">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="color-scheme" content="light">\n' +
    '<meta name="robots" content="noindex,nofollow">\n' +
    '<title>' + escapeHtml(isHome ? parsed.title : parsed.title + ' · Anchor of Intellect') + '</title>\n' +
    '<meta name="description" content="' + escapeHtml(description) + '">\n' +
    '<link rel="canonical" href="' + escapeHtml(canonical) + '">\n' + alternates + '\n' +
    '<link rel="alternate" hreflang="x-default" href="' + escapeHtml(new URL(publicPath('en', page), origin).href) + '">\n' +
    '<link rel="icon" href="' + url('assets/favicon.ico') + '" sizes="16x16 32x32">\n' +
    '<link rel="icon" type="image/png" sizes="16x16" href="' + url('assets/favicon-16.png') + '">\n' +
    '<link rel="icon" type="image/png" sizes="32x32" href="' + url('assets/favicon-32.png') + '">\n' +
    '<link rel="icon" type="image/svg+xml" sizes="any" href="' + url('assets/favicon.svg') + '">\n' +
    '<link rel="apple-touch-icon" sizes="180x180" href="' + url('assets/apple-touch-icon.png') + '">\n' +
    '<link rel="stylesheet" href="' + url('assets/styles.css') + '">\n' +
    '</head>\n<body>\n<a class="skip-link" href="#main">' + escapeHtml(words.skip) + '</a>\n' +
    '<header class="site-header"><div class="shell header-inner"><a class="brand" href="' + url(route(lang, 'home')) +
    '" aria-label="Anchor of Intellect"><img class="brand-mark" src="' + url('assets/aoi-mark.svg') +
    '" width="40" height="40" alt="" aria-hidden="true"><span>A.O.I.</span></a><div class="header-right"><nav class="primary-nav" aria-label="' +
    (words.navigation || (lang === 'en' ? 'Main navigation' : '주 메뉴')) + '">' + nav + '</nav><nav class="language-switch" aria-label="' +
    (words.language || (lang === 'en' ? 'Language' : '언어')) + '">' + langSwitch + '</nav></div></div></header>\n' +
    '<main id="main" tabindex="-1" class="shell">' + content + '</main>\n' +
    '<footer class="site-footer"><div class="shell footer-grid"><div><p class="footer-title">Anchor of Intellect</p>' +
    '<p class="footer-note">' + escapeHtml(words.footer) + '</p><small>' + escapeHtml(words.author) + ' · ' + escapeHtml(words.draft) +
    '</small></div><div><nav class="related-links" aria-label="' + escapeHtml(words.related) +
    '"><a href="https://auxtho.com/">Auxtho</a><a href="https://auxtho.com/products/ardamire/">Ardamire</a>' +
    '<a href="https://auxtho.com/whitecell/">WhiteCell</a></nav><p class="footer-note">' +
    (words.original || (lang === 'en' ? 'Original A.O.I. text · CC BY 4.0' : 'A.O.I. 창작 원문 · CC BY 4.0')) +
    '</p></div></div></footer>\n</body>\n</html>\n';
}

function build() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'publication.json'), 'utf8'));
  if (new URL(config.siteOrigin).origin !== 'https://anchorofintellect.com') throw new Error('Unexpected site origin');
  // Exact allowlist: no directory-copy or user-supplied output path.
  const outputs = new Map();
  const sources = [];
  for (const lang of LANGUAGES) {
    for (const page of PAGES) {
      const sourcePath = 'content/' + lang + '/' + page + '.md';
      const source = fs.readFileSync(path.join(ROOT, sourcePath), 'utf8');
      sources.push({ path: sourcePath, sha256: sha256(source) });
      outputs.set(route(lang, page), Buffer.from(renderPage(lang, page, source, config)));
      outputs.set('sources/' + lang + '/' + page + '.md', Buffer.from(source));
    }
  }
  outputs.set('assets/styles.css', fs.readFileSync(path.join(ROOT, 'site/styles.css')));
  for (const file of ICON_FILES) outputs.set('assets/' + file, fs.readFileSync(path.join(ROOT, 'site', file)));
  outputs.set('license-documentation.txt', fs.readFileSync(path.join(ROOT, 'LICENSE-DOCUMENTATION.md')));
  outputs.set('.nojekyll', Buffer.alloc(0));
  const entries = [...outputs].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([file, data]) => ({
    path: file, bytes: data.length, sha256: sha256(data)
  }));
  const manifest = {
    schema: 1, project: 'Anchor of Intellect', charterVersion: config.charterVersion,
    status: 'draft', sourceFiles: sources, files: entries,
    bundleSha256: sha256(JSON.stringify(entries))
  };
  outputs.set('site-manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));

  if (fs.existsSync(OUTPUT) && fs.lstatSync(OUTPUT).isSymbolicLink()) throw new Error('Output must not be a symlink');
  if (!fs.existsSync(OUTPUT)) fs.mkdirSync(OUTPUT);
  // Never delete an unexpected file or replace a link hidden in the output tree.
  const planned = new Set(outputs.keys());
  function checkExisting(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Output symlink refused: ' + entry.name);
      if (entry.isDirectory()) checkExisting(full);
      else if (!entry.isFile() || !planned.has(path.relative(OUTPUT, full).split(path.sep).join('/'))) {
        throw new Error('Unexpected output entry; inspect it manually: ' + entry.name);
      }
    }
  }
  checkExisting(OUTPUT);
  for (const [file, data] of outputs) {
    const target = path.join(OUTPUT, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  return { ...manifest, output: OUTPUT, outputFileCount: outputs.size };
}

if (require.main === module) {
  const result = build();
  console.log(JSON.stringify({ output: result.output, pages: LANGUAGES.length * PAGES.length, files: result.outputFileCount, bundleSha256: result.bundleSha256 }, null, 2));
}
module.exports = { ROOT, OUTPUT, PAGES, LANGUAGES, WORDS, ICON_FILES, languageTag, route, publicPath, relativeUrl, parseMarkdown, renderPage, sha256, build };
