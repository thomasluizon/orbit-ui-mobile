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
const allKeys = Object.keys(flat(en));

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', '.expo', 'dist', 'build', 'coverage'].includes(e.name)) continue;
      walk(p, files);
    } else if (/\.(tsx?|jsx?)$/.test(e.name)) {
      files.push(p);
    }
  }
  return files;
}
const roots = ['apps/web', 'apps/mobile', 'packages/shared/src'];
const haystack = roots
  .flatMap((r) => (fs.existsSync(r) ? walk(r) : []))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

// An orphan = a full leaf key whose LAST segment never appears as a string token
// anywhere, AND whose full path never appears. We check the last 1, 2, and 3
// segments as quoted/backtick fragments to be conservative about dynamic builders.
function segTail(key, n) {
  return key.split('.').slice(-n).join('.');
}
const orphans = [];
for (const key of allKeys) {
  if (haystack.includes(key)) continue;
  const t1 = segTail(key, 1);
  const t2 = segTail(key, 2);
  const t3 = segTail(key, 3);
  // appears as suffix in a quote/backtick/dot context anywhere?
  if (haystack.includes('.' + t2) || haystack.includes(t3)) continue;
  // last segment present as a standalone token (dynamic builder tail)?
  const tokRe = new RegExp('[\'"`.]' + t1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"`]');
  if (tokRe.test(haystack)) continue;
  orphans.push(key);
}
if (orphans.length === 0) console.log('NO candidate orphans (conservative).');
else {
  console.log('CANDIDATE orphans (' + orphans.length + ') — manual dynamic-builder review needed:');
  for (const k of orphans) console.log('  ' + k);
}
