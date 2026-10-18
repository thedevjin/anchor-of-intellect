'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, OUTPUT, PAGES, LANGUAGES, languageTag, route, build, sha256, parseMarkdown, renderPage } = require('../scripts/build.cjs');
const { validatePublication } = require('../scripts/check-publication.cjs');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'publication.json'), 'utf8'));
const built = build();
const htmlFiles = LANGUAGES.flatMap(lang => PAGES.map(page => route(lang, page)));
const readHtml = file => fs.readFileSync(path.join(OUTPUT, file), 'utf8');

test('English is the default; no language detection, query or browser storage is required', () => {
  const html = readHtml('index.html');
  assert.match(html, /<html lang="en">/);
  assert.match(readHtml('ko/index.html'), /<html lang="ko">/);
  assert.doesNotMatch(html, /[?&]lang=|localStorage|navigator\.language/i);
  assert.match(readHtml('fr/index.html'), /<html lang="fr-FR">/);
  assert.equal(htmlFiles.length, 12);
});

test('every language switch preserves the page and returns without a query parameter', () => {
  for (const lang of LANGUAGES) for (const page of PAGES) {
    const file = route(lang, page);
    const html = readHtml(file);
    for (const other of LANGUAGES.filter(code => code !== lang)) {
      const switchMatch = html.match(new RegExp('<a href="([^"]+)" hreflang="' + languageTag(other) + '"'));
      assert.ok(switchMatch, file + ' → ' + other);
      assert.equal(path.resolve(OUTPUT, path.dirname(file), switchMatch[1]), path.join(OUTPUT, route(other, page)), file);
      assert.doesNotMatch(switchMatch[1], /[?#]/);
    }
  }
});

test('all static local links, fragments and styles resolve within the public output', () => {
  for (const file of htmlFiles) {
    const html = readHtml(file);
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const value = match[1];
      if (/^https:\/\//.test(value)) continue;
      assert.doesNotMatch(value, /^\/|\\|%|javascript:|data:|mailto:|file:/i, file);
      const [relative, fragment] = value.split('#');
      const target = relative ? path.resolve(OUTPUT, path.dirname(file), relative) : path.join(OUTPUT, file);
      assert.ok(target.startsWith(OUTPUT + path.sep), file);
      assert.ok(fs.statSync(target).isFile(), file + ' → ' + value);
      if (fragment) assert.ok(fs.readFileSync(target, 'utf8').includes('id="' + fragment + '"'), file + '#' + fragment);
    }
  }
});

test('language, title, main landmark and exactly one H1 exist on every page', () => {
  for (const lang of LANGUAGES) for (const page of PAGES) {
    const html = readHtml(route(lang, page));
    assert.match(html, new RegExp('<html lang="' + languageTag(lang) + '">'));
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.equal((html.match(/<main /g) || []).length, 1);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /href="#main"/);
    assert.match(html, /aria-current="page"/);
  }
});

test('the page table of contents never changes the manuscript order', () => {
  for (const lang of LANGUAGES) for (const page of PAGES.filter(page => page !== 'home')) {
    const source = fs.readFileSync(path.join(ROOT, 'content', lang, page + '.md'), 'utf8');
    const { sections } = parseMarkdown(source);
    const html = readHtml(route(lang, page));
    const rendered = [...html.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)];
    assert.equal(rendered.length, sections.length);
    rendered.forEach((match, i) => assert.equal(match[1], sections[i].id));
  }
});

test('all source paragraphs survive in the generated page and sources remain byte-identical', () => {
  for (const lang of LANGUAGES) for (const page of PAGES) {
    const source = fs.readFileSync(path.join(ROOT, 'content', lang, page + '.md'), 'utf8');
    assert.equal(fs.readFileSync(path.join(OUTPUT, 'sources', lang, page + '.md'), 'utf8'), source);
    const html = readHtml(route(lang, page));
    for (const block of source.trim().split(/\n\s*\n/)) {
      const text = block.replace(/^#{1,2} /, '').replace(/\n/g, ' ');
      const escaped = text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
      assert.ok(html.includes(escaped), lang + '/' + page + ': ' + text.slice(0, 45));
    }
  }
});

test('HTML-like source text is escaped, never executed', () => {
  const input = '# Test\n\n<script>alert("x")</script>\n\n## Heading\n\nText & <img src=x>';
  const html = renderPage('en', 'charter', input, config);
  assert.doesNotMatch(html, /<script|<img src=x>/);
  assert.match(html, /&lt;script&gt;/);
});

test('invalid markdown structure fails visibly', () => {
  assert.throws(() => parseMarkdown('No H1\n\nText'), /opening H1/);
  assert.throws(() => parseMarkdown('# Title\n\n### Heading'), /heading structure/);
});

test('published HTML needs no script, form, third-party font, iframe or remote asset', () => {
  for (const file of htmlFiles) {
    const html = readHtml(file);
    const images = html.match(/<img\b[^>]*>/g) || [];
    assert.equal(images.length, 1, file);
    assert.match(images[0], /^<img class="brand-mark" src="(?:\.\.\/)*assets\/aoi-mark\.svg" width="40" height="40" alt="" aria-hidden="true">$/);
    assert.doesNotMatch(html, /<script|<iframe|<form|<video|<object|<embed|\son[a-z]+=/i);
    assert.doesNotMatch(html, /<link[^>]+rel="(?:preconnect|preload)"/i);
    assert.doesNotMatch(html, /https?:\/\/(?:fonts|www\.google-analytics)/i);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(OUTPUT, 'assets/styles.css'), 'utf8'), /@import|url\(/i);
});

test('mobile, reduced-motion and print treatments are present', () => {
  const css = fs.readFileSync(path.join(OUTPUT, 'assets/styles.css'), 'utf8');
  assert.match(css, /max-width:620px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media print/);
  assert.match(css, /focus-visible/);
});

test('the only external HTML links are the intended canonical URLs and related public work', () => {
  for (const file of htmlFiles) {
    const links = [...readHtml(file).matchAll(/href="(https:[^"]+)"/g)].map(match => match[1]);
    for (const url of links) {
      const parsed = new URL(url);
      assert.ok(['https://anchorofintellect.com', 'https://auxtho.com'].includes(parsed.origin), url);
      assert.equal(parsed.search, '');
    }
  }
});

test('the generated public bundle is allowlisted and contains no repository/admin files', () => {
  const files = built.files.map(entry => entry.path);
  assert.equal(files.length, 35);
  assert.equal(built.outputFileCount, 36);
  for (const file of files) assert.match(file, /^(?:index\.html|(?:ko|fr)\/index\.html|(?:(?:ko|fr)\/)?(?:charter|revisions|about)\/index\.html|sources\/(?:en|ko|fr)\/(?:home|charter|revisions|about)\.md|assets\/(?:styles\.css|aoi-mark\.svg|favicon\.(?:svg|ico)|favicon-(?:16|32)\.png|apple-touch-icon\.png|icon-(?:192|512)\.png)|license-documentation\.txt|\.nojekyll)$/);
  assert.ok(!files.some(file => /publication\.json|README|\.github|PRIVATE|\.git\//i.test(file)));
});

test('no contact email or local machine path is included in public content', () => {
  for (const file of built.files) {
    if (/\.(?:png|ico)$/.test(file.path)) continue;
    const text = fs.readFileSync(path.join(OUTPUT, file.path), 'utf8');
    assert.doesNotMatch(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, file.path);
    assert.doesNotMatch(text, /[A-Z]:[\\/](?:Users|Projects)|file:\/\//i, file.path);
  }
});

test('the manuscript is explicitly a draft; company and defense texts remain separate', () => {
  for (const lang of LANGUAGES) {
    const revisions = fs.readFileSync(path.join(ROOT, 'content', lang, 'revisions.md'), 'utf8');
    assert.match(revisions, /Auxtho/);
    assert.match(revisions, /Ardamire × WhiteCell/);
    assert.match(revisions, {en:/not an adopted public release/,ko:/채택된 공개판이 아닌 초안/,fr:/non d’une version publique adoptée/}[lang]);
    const charter = fs.readFileSync(path.join(ROOT, 'content', lang, 'charter.md'), 'utf8');
    assert.equal((charter.match(/^## [1-8]\./gm) || []).length, 8);
  }
});

test('the initial local preparation is marked noindex in every HTML page', () => {
  for (const file of htmlFiles) assert.match(readHtml(file), /name="robots" content="noindex,nofollow"/);
});

test('every file hash and byte length matches the manifest, and builds are reproducible', () => {
  for (const entry of built.files) {
    const data = fs.readFileSync(path.join(OUTPUT, entry.path));
    assert.equal(sha256(data), entry.sha256, entry.path);
    assert.equal(data.length, entry.bytes, entry.path);
  }
  const repeat = build();
  assert.equal(repeat.bundleSha256, built.bundleSha256);
  assert.equal(sha256(JSON.stringify(repeat.files)), built.bundleSha256);
});

const reviewed = {
  ...config,
  repository: { owner: 'example-person', name: 'anchor-of-intellect', defaultBranch: 'main' },
  publisher: 'example-person', status: 'PUBLICATION_CANDIDATE', codeLicense: 'MIT'
};
const context = {
  event: 'workflow_dispatch', ref: 'refs/heads/main',
  repository: 'example-person/anchor-of-intellect', actor: 'example-person',
  sha: 'a'.repeat(40), approvedSha: 'a'.repeat(40),
  workflowRef: 'example-person/anchor-of-intellect/.github/workflows/publish.yml@refs/heads/main',
  expectedBundle: built.bundleSha256
};

test('the chosen personal owner and licenses do not remove final-publication HOLD', () => {
  const errors = validatePublication(config, context, built.bundleSha256);
  assert.equal(config.repository.owner, 'thedevjin');
  assert.equal(config.publisher, 'thedevjin');
  assert.equal(config.documentationLicense, 'CC-BY-4.0');
  assert.equal(config.codeLicense, 'MIT');
  assert.ok(!errors.some(error => /licensing/.test(error)));
  assert.ok(errors.some(error => /local preparation/.test(error)));
});

test('selected prose and code licenses retain their separate scopes and required MIT terms', () => {
  const prose = fs.readFileSync(path.join(ROOT, 'LICENSE-DOCUMENTATION.md'), 'utf8');
  const code = fs.readFileSync(path.join(ROOT, 'LICENSE-CODE.md'), 'utf8');
  assert.match(prose, /content\/en\/.*content\/ko\/.*content\/fr\//);
  assert.match(prose, /Creative Commons Attribution 4\.0/);
  assert.match(prose, /LICENSE-CODE\.md under the MIT License/);
  assert.match(code, /Copyright \(c\) 2026 Jin Sung/);
  assert.match(code, /Permission is hereby granted, free of charge/);
  assert.match(code, /copyright notice and this permission notice shall be included/);
  assert.match(code, /THE SOFTWARE IS PROVIDED "AS IS"/);
  assert.match(code, /Auxtho product source code/);
  assert.match(code, /embedded original A\.O\.I\. prose remains under LICENSE-DOCUMENTATION\.md/);
  assert.equal(fs.readFileSync(path.join(OUTPUT, 'license-documentation.txt'), 'utf8'), prose);
});

test('a consistent synthetic publication context passes only the local guard', () => {
  assert.deepEqual(validatePublication(reviewed, context, built.bundleSha256), []);
});

for (const [label, changes] of [
  ['automatic push', { event: 'push' }],
  ['pull request', { event: 'pull_request' }],
  ['wrong branch', { ref: 'refs/heads/other' }],
  ['wrong repository', { repository: 'different/anchor-of-intellect' }],
  ['another publisher', { actor: 'different' }],
  ['different commit', { approvedSha: 'b'.repeat(40) }],
  ['invalid commit', { approvedSha: 'main; echo x' }],
  ['different bundle', { expectedBundle: 'f'.repeat(64) }],
  ['wrong workflow source', { workflowRef: 'different/repo/publish.yml@refs/heads/main' }]
]) {
  test('publication guard rejects ' + label, () => {
    assert.ok(validatePublication(reviewed, { ...context, ...changes }, built.bundleSha256).length > 0);
  });
}

test('publication cannot be triggered by push; checks have no Pages write permission', () => {
  const publish = fs.readFileSync(path.join(ROOT, '.github/workflows/publish.yml'), 'utf8');
  const check = fs.readFileSync(path.join(ROOT, '.github/workflows/check.yml'), 'utf8');
  assert.match(publish, /workflow_dispatch:/);
  assert.doesNotMatch(publish, /^\s+(?:push|pull_request|workflow_run):/m);
  assert.match(publish, /needs: prepare/);
  assert.match(publish, /name: github-pages/);
  assert.match(publish, /cancel-in-progress: false/);
  assert.doesNotMatch(check, /pages: write|id-token: write|deploy-pages/);
  assert.match(check, /persist-credentials: false/);
});

test('Korean shows the chosen Korean name and English keeps its existing form', () => {
  for (const page of PAGES) {
    assert.match(readHtml(route('ko', page)), /Jin Sung \(성진\)/);
    assert.doesNotMatch(readHtml(route('en', page)), /성진/);
  }
});

test('the chosen closing appears once at the end of both home and charter sources', () => {
  const closings = {
  "en": "With greater intelligence, what kind of future do we want to build together?\n\nCan that future protect what we cherish while expanding our freedom to choose a different path?",
  "ko": "더 큰 지능과 함께, 우리는 어떤 미래를 만들어 가고 싶을까요?\n\n그 미래는 우리가 소중히 여기는 것들을 지키면서, 다른 길을 선택할 자유까지 넓혀 줄 수 있을까요?",
  "fr": "Avec une intelligence plus puissante, quel avenir voulons-nous construire ensemble ?\n\nCet avenir pourra-t-il préserver ce qui nous est cher tout en élargissant notre liberté de choisir une autre voie ?"
};
  for (const lang of LANGUAGES) for (const page of ['home', 'charter']) {
    const source = fs.readFileSync(path.join(ROOT, 'content', lang, page + '.md'), 'utf8');
    assert.ok(source.trim().endsWith(closings[lang]));
    assert.equal(source.split(closings[lang]).length - 1, 1);
    assert.ok(!closings[lang].includes('대신 선택'));
  }
});

test('all external workflow actions are pinned to full commit IDs', () => {
  for (const name of ['check.yml', 'publish.yml']) {
    const yaml = fs.readFileSync(path.join(ROOT, '.github/workflows', name), 'utf8');
    for (const match of yaml.matchAll(/uses:\s+([^\s#]+)/g)) assert.match(match[1], /^[\w-]+\/[\w-]+@[a-f\d]{40}$/);
    assert.doesNotMatch(yaml, /npm (?:ci|install)|curl|wget|pull_request_target/);
  }
});

test('French reading edition preserves source structure, author and essential authority distinctions', () => {
  for (const page of ['home', 'charter', 'about']) {
    const source = lang => fs.readFileSync(path.join(ROOT,'content',lang,page+'.md'),'utf8');
    assert.equal(parseMarkdown(source('fr')).blocks.length,parseMarkdown(source('en')).blocks.length,page);
    assert.doesNotMatch(source('fr'),/Paris|étudié|amis|parisien/i,'Private background was not authorized as public biography');
    assert.match(readHtml(route('fr',page)),/Jin Sung/);
  }
  const fr=fs.readFileSync(path.join(ROOT,'content/fr/charter.md'),'utf8');
  for(const phrase of ['de nouveaux pouvoirs','les droits de tous les autres','pas indépendante','règles autorisées à l’avance','ni l’intrusion, ni les représailles','ne suffisent pas à établir la véracité du contenu','qui concernent l’IA elle-même','des exigences vérifiables'])assert.ok(fr.includes(phrase),phrase);
  for(const file of htmlFiles){
    const html=readHtml(file);
    for(const lang of LANGUAGES)assert.ok(html.includes('rel="alternate" hreflang="'+languageTag(lang)+'"'));
    assert.equal((html.match(/aria-current="true"/g)||[]).length,1);
  }
});

test('reviewed core manuscripts, including the seven approved sentence edits, and visual styling remain byte-for-byte fixed',()=>{
  const fixed={
    'content/en/home.md':'6623cc3a4e42a9db7d950be08da8fcfab459f5ef0828d3a25e1b065dda050d0d',
    'content/en/charter.md':'b967d989c17372bf12965b4ca16344107b1c8dd7e69d49873e36c96c533732aa',
    'content/en/about.md':'a11653ead0eddf8c89cf4fe6cea9020841707fc1e80026dee7d72bc72b43dd1c',
    'content/ko/home.md':'f543907a4b7c4ea7e06722766c9c4e4ce1c3264feba081afe31bb871bbb9a299',
    'content/ko/charter.md':'2a2c38f828b6a95bd9b27d3f11301516935442ddbadd99e8d3c76b0a31bd492f',
    'content/ko/about.md':'86059e29b20f941c87c5b07aa954a94321f520f87ac39fe550d88224853def97',
    'content/fr/charter.md':'cb6a90a46d2364768652fe464b539bb03285ebe9c14c3f7a6aeb585d2e345bcc'
  };
  for(const [file,digest]of Object.entries(fixed))assert.equal(sha256(fs.readFileSync(path.join(ROOT,file))),digest,file);
  // Only the explicitly approved logo alignment/image rules may change the reviewed stylesheet.
  const originalStyling = fs.readFileSync(path.join(ROOT,'site/styles.css'),'utf8')
    .replace('.brand{display:inline-flex;align-items:center;gap:10px;', '.brand{')
    .replace('.brand-mark{display:block;flex:none;width:40px;height:40px}\n', '');
  assert.equal(sha256(originalStyling),'1d896b0c06221ddbaeebe5bcf1a6ceafff6b4b2842a4b593f79a55031a6aa2ff');
  assert.throws(()=>route('de','home'),/Unsupported/);
  assert.throws(()=>route('fr','missing'),/Unsupported/);
});

test('chosen identity geometry, local icon links and fixed PNG/ICO sizes are preserved',()=>{
  const geometry = ['M44 72 116 140V208L44 140Z','m140 140 72-68v68l-72 68Z','m128 32 25 25-25 25-25-25Z'];
  for(const name of ['aoi-mark.svg','favicon.svg']){
    const svg=fs.readFileSync(path.join(OUTPUT,'assets',name),'utf8');
    assert.deepEqual([...svg.matchAll(/<path d="([^"]+)"/g)].map(match=>match[1]),geometry);
    assert.doesNotMatch(svg,/<script|<foreignObject|<image|\son[a-z]+=|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i);
  }
  for(const file of htmlFiles){
    const html=readHtml(file);
    assert.equal((html.match(/rel="icon"/g)||[]).length,4);
    assert.match(html,/rel="apple-touch-icon" sizes="180x180"/);
    assert.match(html,/aria-label="Anchor of Intellect"><img[^>]+alt="" aria-hidden="true"><span>A\.O\.I\.<\/span>/);
    assert.doesNotMatch(html,/rel="manifest"|serviceWorker|identity-concept|Open Bearing/);
  }
  for(const [name,size]of [['favicon-16.png',16],['favicon-32.png',32],['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]){
    const data=fs.readFileSync(path.join(OUTPUT,'assets',name));
    assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(data.readUInt32BE(16),size,name); assert.equal(data.readUInt32BE(20),size,name);
  }
  const ico=fs.readFileSync(path.join(OUTPUT,'assets/favicon.ico'));
  assert.equal(ico.readUInt16LE(0),0); assert.equal(ico.readUInt16LE(2),1); assert.equal(ico.readUInt16LE(4),2);
  for(let i=0;i<2;i++){
    const entry=6+i*16, size=[16,32][i];
    assert.equal(ico[entry],size); assert.equal(ico[entry+1],size);
    const start=ico.readUInt32LE(entry+12),length=ico.readUInt32LE(entry+8);
    assert.deepEqual(ico.subarray(start,start+length),fs.readFileSync(path.join(OUTPUT,'assets',`favicon-${size}.png`)));
  }
});
