import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'C:/Users/thoma/Documents/Programming/Projects/orbit-ui-mobile';
const SWEEP = join(ROOT, '.claude/sweeps/107');

// 1. Parse the measured >100L list (tab-separated: lines \t file:line \t name \t literalKind)
const measured = readFileSync(process.argv[2], 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => {
    const [lines, fileLine, name, kind] = l.split('\t');
    return { lines: Number(lines), fileLine: fileLine?.trim(), name: name?.trim(), kind: (kind || '').trim() };
  })
  .filter((r) => r.fileLine);

// 2. Gather register text from every deferral/guidance file (path-tolerant matching: file path, not line).
const registerFiles = [
  'wave3-deferrals.md',
  'round-4-deferrals.md',
  'round-3-guidance.md',
  'round-3/06-quality.md',
];
let registerText = '';
for (const f of registerFiles) {
  try { registerText += '\n' + readFileSync(join(SWEEP, f), 'utf8'); } catch {}
}

// Extract every "file.tsx" / "file.ts" path token mentioned in the registers.
const regPaths = new Set();
const pathRe = /apps\/(?:web|mobile)\/[^\s:`]+?\.(?:tsx?|ts)|packages\/shared\/[^\s:`]+?\.(?:tsx?|ts)/g;
let m;
while ((m = pathRe.exec(registerText)) !== null) regPaths.add(m[0]);

// Also extract file:line tokens explicitly registered (for exact-match confidence)
const fileLineRe = /(apps\/(?:web|mobile)\/[^\s:`]+?\.(?:tsx?|ts)|packages\/shared\/[^\s:`]+?\.(?:tsx?|ts)):(\d+)/g;
const regFileLines = new Set();
while ((m = fileLineRe.exec(registerText)) !== null) regFileLines.add(`${m[1]}:${m[2]}`);

const litKinds = new Set(['call-literal', 'object-literal', 'array-literal']);

// Build per-path set of registered function NAMES (token after the `path:line · ` in register lines).
// Register line shape: `<path>:<line> · <fnName> · ...`  OR  `<path>:<line> · <fnName> <num>L`
const regNamesByPath = new Map();
const regLineRe = /(apps\/(?:web|mobile)\/[^\s:`]+?\.(?:tsx?|ts)|packages\/shared\/[^\s:`]+?\.(?:tsx?|ts)):\d+\s*[·.]\s*`?([A-Za-z_][A-Za-z0-9_]*)`?/g;
while ((m = regLineRe.exec(registerText)) !== null) {
  const p = m[1];
  if (!regNamesByPath.has(p)) regNamesByPath.set(p, new Set());
  regNamesByPath.get(p).add(m[2]);
}
// Also catch round-3 06-quality bullet shape: `· file:line · `fnName` NNN` and `· file:line · fnName NNNL`
const qualRe = /(apps\/(?:web|mobile)\/[^\s:`]+?\.(?:tsx?|ts)|packages\/shared\/[^\s:`]+?\.(?:tsx?|ts)):\d+\s*·\s*rule 7\s*·\s*`?([A-Za-z_][A-Za-z0-9_]*)`?/g;
while ((m = qualRe.exec(registerText)) !== null) {
  const p = m[1];
  if (!regNamesByPath.has(p)) regNamesByPath.set(p, new Set());
  regNamesByPath.get(p).add(m[2]);
}

function nameRegistered(path, name) {
  const s = regNamesByPath.get(path);
  if (s && s.has(name)) return true;
  // fallback: bare name token anywhere in register (handles cross-file mirror mentions)
  const re = new RegExp(`\\b${name}\\b`);
  return false; // disabled global fallback; use path-scoped only for precision
}

const unregistered = [];
const anonNonLiteral = [];
for (const r of measured) {
  if (litKinds.has(r.kind)) continue; // SKIP literal-bodied per calibration
  const path = r.fileLine.replace(/:\d+$/, '');
  const exactHit = regFileLines.has(r.fileLine);
  const pathHit = regPaths.has(path);
  if (r.name === '(anon)') {
    anonNonLiteral.push({ ...r, exactHit, pathHit });
    continue;
  }
  const nameHit = nameRegistered(path, r.name);
  if (!nameHit) {
    unregistered.push({ ...r, pathHit, exactHit });
  }
}

console.log('=== UNREGISTERED non-literal named functions (fn NAME not registered under its path) ===');
if (unregistered.length === 0) console.log('NONE');
for (const r of unregistered) console.log(`${r.lines}\t${r.fileLine}\t${r.name}\tpathMentioned=${r.pathHit} exactLine=${r.exactHit}`);

console.log('\n=== (anon) non-literal nodes >100L (evaluate individually) ===');
for (const r of anonNonLiteral) console.log(`${r.lines}\t${r.fileLine}\t${r.name}\tpathInRegister=${r.pathHit}`);

console.log('\n=== STATS ===');
console.log('measured >100L total:', measured.length);
console.log('literal-bodied (SKIP):', measured.filter((r) => litKinds.has(r.kind)).length);
console.log('register path tokens:', regPaths.size);
console.log('register file:line tokens:', regFileLines.size);
console.log('unregistered named:', unregistered.length);
console.log('anon non-literal:', anonNonLiteral.length);
