import fs from 'fs';
import path from 'path';

const en = JSON.parse(fs.readFileSync('packages/shared/src/i18n/en.json', 'utf8'));
function flat(obj, prefix = '', acc = {}) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, acc);
    else acc[key] = v;
  }
  return acc;
}
const keySet = new Set(Object.keys(flat(en)));

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', '.expo', 'dist', 'build', 'coverage', '__tests__'].includes(e.name)) continue;
      walk(p, files);
    } else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\.(tsx?|jsx?)$/.test(e.name)) {
      files.push(p);
    }
  }
  return files;
}

const roots = ['apps/web', 'apps/mobile', 'packages/shared/src'];
const files = roots.flatMap((r) => (fs.existsSync(r) ? walk(r) : []));

const callRe = /\b(?:t|i18n\.t)\(\s*(['"])([a-zA-Z0-9_.]+)\1/g;
const missing = {};
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = callRe.exec(src)) !== null) {
    const key = m[2];
    if (!key.includes('.')) continue;
    if (!keySet.has(key)) {
      const line = src.slice(0, m.index).split('\n').length;
      const rel = f.split(path.sep).join('/');
      (missing[key] ||= []).push(rel + ':' + line);
    }
  }
}
const entries = Object.entries(missing);
if (entries.length === 0) console.log('NO missing static t() keys.');
else {
  console.log('MISSING static keys (' + entries.length + '):');
  for (const [k, locs] of entries) console.log('  ' + k + '  <- ' + locs.join(', '));
}
