import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import ts from 'typescript';

const ROOT = 'C:/Users/thoma/Documents/Programming/Projects/orbit-ui-mobile';
const EXCLUDE = new Set(['node_modules', '.next', 'build', 'android', 'ios', 'dist', '.expo', 'coverage', '.turbo', '.git', '__tests__']);

function walk(dir, out) {
  for (const n of readdirSync(dir)) {
    const full = join(dir, n);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) { if (!EXCLUDE.has(n)) walk(full, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.|\.spec\./.test(n)) out.push(full);
  }
}

const webFiles = [], mobileFiles = [];
walk(join(ROOT, 'apps/web'), webFiles);
walk(join(ROOT, 'apps/mobile'), mobileFiles);

function extractBodies(file) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const bodies = [];
  const visit = (node) => {
    if (ts.isArrowFunction(node) || ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) {
      const body = node.body;
      if (body && ts.isBlock(body)) {
        const raw = body.getText(sf);
        const norm = raw.replace(/\s+/g, ' ').replace(/['"`]/g, '"').trim();
        if (norm.length >= 300) {
          let name = '(anon)';
          if (node.name && ts.isIdentifier(node.name)) name = node.name.text;
          else if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) name = node.parent.name.text;
          else if (node.parent && ts.isPropertyAssignment(node.parent) && node.parent.name && ts.isIdentifier(node.parent.name)) name = node.parent.name.text;
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          bodies.push({ file: file.replace(ROOT.split('/').join(sep) + sep, '').split(sep).join('/'), line, name, norm, len: norm.length });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return bodies;
}

const webBodies = webFiles.flatMap(extractBodies);
const mobileBodies = mobileFiles.flatMap(extractBodies);

const mobileByNorm = new Map();
for (const b of mobileBodies) {
  if (!mobileByNorm.has(b.norm)) mobileByNorm.set(b.norm, []);
  mobileByNorm.get(b.norm).push(b);
}

const matches = [];
const seen = new Set();
for (const w of webBodies) {
  const m = mobileByNorm.get(w.norm);
  if (m && m.length) {
    const key = w.norm;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ web: w, mobile: m[0], len: w.len });
  }
}
matches.sort((a, b) => b.len - a.len);
console.log(`Byte-identical (normalized) web<->mobile fn bodies >=300 chars: ${matches.length}\n`);
for (const m of matches) {
  console.log(`${m.len}\t${m.web.file}:${m.web.line} [${m.web.name}]  ==  ${m.mobile.file}:${m.mobile.line} [${m.mobile.name}]`);
}
