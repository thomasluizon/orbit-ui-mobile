// Rebuilds _ds_bundle.js and _ds_manifest.json for the Orbit Design System canvas project.
// The claude.ai/design app owns these two artifacts and did not regenerate them after the
// wave 0 and wave 1 writes, so the new components never reached window.OrbitDesignSystem_918bd5.
// The emitted shape is copied from the app's own output, read out of the project export.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, posix } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('file:///C:/Users/thoma/Documents/Programming/Projects/orbit-ui-mobile/package.json');
const { transformSync } = require('@babel/core');

const root = process.argv[2];
const outDir = process.argv[3];
const NS = 'OrbitDesignSystem_918bd5';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(join(root, 'components'))
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => relative(root, f).split('\\').join(posix.sep))
  .sort();

// The app emits group order actions, brand, canvas, display, forms, lists, navigation, overlay, shell.
const GROUP_ORDER = ['actions', 'brand', 'canvas', 'display', 'forms', 'lists', 'navigation', 'overlay', 'shell'];
files.sort((a, b) => {
  const ga = GROUP_ORDER.indexOf(a.split('/')[1]);
  const gb = GROUP_ORDER.indexOf(b.split('/')[1]);
  return ga === gb ? a.localeCompare(b) : ga - gb;
});

const components = files.map((sourcePath) => ({
  name: sourcePath.split('/').pop().replace(/\.jsx$/, ''),
  sourcePath,
}));
const names = new Set(components.map((c) => c.name));

function compile(sourcePath) {
  const raw = readFileSync(join(root, sourcePath), 'utf8');
  // Strip every import. React is a global in the card runtime, and sibling components resolve
  // through __ds_scope rather than through a module graph.
  const imported = new Set();
  const body = raw
    .split('\n')
    .filter((line) => {
      const match = line.match(/^import\s+(?:React,\s*)?(?:\{([^}]*)\})?[^;]*;\s*$/);
      if (!match) return !/^import\s/.test(line);
      if (match[1]) for (const part of match[1].split(',')) imported.add(part.trim());
      return false;
    })
    .join('\n');

  const { code } = transformSync(body, {
    babelrc: false,
    configFile: false,
    filename: sourcePath,
    plugins: [['@babel/plugin-transform-react-jsx', { pragma: 'React.createElement', pragmaFrag: 'React.Fragment' }]],
    compact: false,
  });

  // Rewrite every sibling component reference to __ds_scope.X, exactly as the app does.
  // The block runs inside an IIFE, not a module, so the export keyword has to go.
  let rewritten = code.replace(/^export\s+(?=function|const|let|class)/gm, '');
  for (const dep of imported) {
    if (!names.has(dep)) continue;
    rewritten = rewritten.replace(new RegExp(`\\bReact\\.createElement\\(${dep}\\b`, 'g'), `React.createElement(__ds_scope.${dep}`);
  }
  const name = sourcePath.split('/').pop().replace(/\.jsx$/, '');
  return `// ${sourcePath}\ntry { (() => {\n${rewritten}\nObject.assign(__ds_scope, { ${name} });\n})(); } catch (e) { __ds_ns.__errors.push({ path: ${JSON.stringify(sourcePath)}, error: String((e && e.message) || e) }); }\n`;
}

// ---- cards: read the @dsCard marker off every preview html that still exists ----
const htmlFiles = walk(root)
  .filter((f) => f.endsWith('.html'))
  .map((f) => relative(root, f).split('\\').join(posix.sep))
  .sort();
const cards = [];
for (const path of htmlFiles) {
  const first = readFileSync(join(root, path), 'utf8').slice(0, 400);
  const marker = first.match(/<!--\s*@dsCard\s+([^>]*?)-->/);
  if (!marker) continue;
  const attrs = {};
  for (const [, key, value] of marker[1].matchAll(/(\w+)="([^"]*)"/g)) attrs[key] = value;
  cards.push({ path, group: attrs.group, viewport: attrs.viewport, subtitle: attrs.subtitle, name: attrs.name });
}
const CARD_GROUP_ORDER = ['App', 'Brand', 'Colors', 'Components', 'Guidelines', 'Motion', 'Spacing', 'Type'];
cards.sort((a, b) => {
  const ga = CARD_GROUP_ORDER.indexOf(a.group);
  const gb = CARD_GROUP_ORDER.indexOf(b.group);
  return ga === gb ? a.path.localeCompare(b.path) : ga - gb;
});

// ---- emit the bundle ----
const header = { format: 4, namespace: NS, components };
const parts = [
  `/* @ds-bundle: ${JSON.stringify(header)} */`,
  '',
  '(() => {',
  '',
  `const __ds_ns = (window.${NS} = window.${NS} || {});`,
  '',
  'const __ds_scope = {};',
  '',
  '(__ds_ns.__errors = __ds_ns.__errors || []);',
  '',
];
for (const c of components) parts.push(compile(c.sourcePath), '');
for (const c of components) parts.push(`__ds_ns.${c.name} = __ds_scope.${c.name};`, '');
parts.push('})();');
writeFileSync(join(outDir, '_ds_bundle.js'), parts.join('\n'));

// ---- emit the manifest, carrying every field the old one had that is not derived here ----
// The carried fields go stale too. `tokens` is the one that bites: a token deleted from the css
// keeps its swatch in the pane forever. So drop any token whose file no longer defines it.
const old = JSON.parse(readFileSync(join(root, '_ds_manifest.json'), 'utf8'));
const cssByPath = {};
const tokens = (old.tokens || []).filter((token) => {
  cssByPath[token.definedIn] ??= readFileSync(join(root, token.definedIn), 'utf8');
  return cssByPath[token.definedIn].includes(`${token.name}:`);
});
const manifest = { ...old, components, cards, tokens };
writeFileSync(join(outDir, '_ds_manifest.json'), JSON.stringify(manifest));

console.log('components', components.length);
console.log('cards', cards.length);
console.log('new components:', components.filter((c) => ['Composer', 'Proposed', 'BlockFrame'].includes(c.name)).map((c) => c.name).join(', ') || 'NONE');
console.log('cards:', cards.map((c) => c.name).join(' | '));
