import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Brace-counting C# method-body line measurer. Heuristic (no Roslyn): finds method/local-function
// signatures, then counts lines until the matching closing brace by brace depth. Skips comments
// and string/char literals for brace counting. Excludes test projects + generated migrations + .Designer.
const ROOT = process.argv[2] || 'C:/Users/thoma/Documents/Programming/Projects/orbit-api';
const EXCLUDE_DIRS = new Set(['bin', 'obj', '.git', 'node_modules', 'TestResults', '.vs']);

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) continue;
      walk(full, out);
    } else if (name.endsWith('.cs')) {
      if (name.endsWith('.Designer.cs') || name.endsWith('.g.cs') || name.endsWith('.g.i.cs')) continue;
      const lower = full.toLowerCase();
      if (lower.includes(`${sep}migrations${sep}`)) continue; // EF generated migrations
      if (/(^|[\\/])[^\\/]*tests?[\\/]/i.test(full)) continue; // test projects
      if (/\.tests?\b/i.test(name)) continue;
      out.push(full);
    }
  }
}

// Strip string/char/comment content from a line for brace counting (keeps braces only when code).
function netBraces(line, state) {
  let depthDelta = 0;
  let i = 0;
  const n = line.length;
  while (i < n) {
    const c = line[i];
    const c2 = i + 1 < n ? line[i + 1] : '';
    if (state.inBlockComment) {
      if (c === '*' && c2 === '/') { state.inBlockComment = false; i += 2; continue; }
      i++; continue;
    }
    if (state.inString) {
      if (state.verbatim) {
        if (c === '"' && c2 === '"') { i += 2; continue; }
        if (c === '"') { state.inString = false; state.verbatim = false; i++; continue; }
        i++; continue;
      } else {
        if (c === '\\') { i += 2; continue; }
        if (c === '"') { state.inString = false; i++; continue; }
        i++; continue;
      }
    }
    if (state.inChar) {
      if (c === '\\') { i += 2; continue; }
      if (c === "'") { state.inChar = false; i++; continue; }
      i++; continue;
    }
    // not in any literal/comment
    if (c === '/' && c2 === '/') break; // rest is line comment
    if (c === '/' && c2 === '*') { state.inBlockComment = true; i += 2; continue; }
    if (c === '@' && c2 === '"') { state.inString = true; state.verbatim = true; i += 2; continue; }
    if (c === '$' && c2 === '"') { state.inString = true; state.verbatim = false; i += 2; continue; }
    if (c === '"') { state.inString = true; state.verbatim = false; i++; continue; }
    if (c === "'") { state.inChar = true; i++; continue; }
    if (c === '{') depthDelta++;
    if (c === '}') depthDelta--;
    i++;
  }
  return depthDelta;
}

// Signature heuristic: a line that looks like a method/ctor/local-function declaration and either
// ends with '{' or the next non-empty line is '{'. We detect by: contains '(' ... ')' and is not a
// call statement (no trailing ';' before brace), and has a return-type/modifier-ish token.
const sigRe = /\b(public|private|protected|internal|static|async|override|virtual|sealed|partial|Task|ValueTask|void|IActionResult|IEnumerable|List|Dictionary|bool|int|long|string|double|decimal|var|[A-Z][A-Za-z0-9_<>,\.\[\]\? ]*)\s+[A-Za-z_][A-Za-z0-9_]*\s*(<[^>]*>)?\s*\(/;
const ctrlRe = /\b(if|for|foreach|while|switch|using|lock|fixed|catch|do|else)\b\s*\(?/;

const results = [];

const files = [];
walk(ROOT, files);

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);
  const rel = relative(ROOT, file).split(sep).join('/');
  const litState = { inString: false, inChar: false, verbatim: false, inBlockComment: false };
  let depth = 0;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();
    // Detect a method signature start at current position (before consuming this line's braces).
    const looksSig = sigRe.test(line) && line.includes('(') && !ctrlRe.test(trimmed) &&
      !/=>\s*$/.test(trimmed) && !/;\s*$/.test(trimmed) &&
      !/\b(class|interface|struct|enum|record|namespace)\b/.test(line) &&
      !/^\s*\[/.test(line) && !/\)\s*=>/.test(line);
    // Find the opening brace line for this signature: this line ends with { or a following line is {
    if (looksSig && depth >= 0) {
      // locate opening brace
      let openIdx = -1;
      if (/\{\s*$/.test(line) || /\)\s*\{/.test(line)) openIdx = idx;
      else {
        for (let j = idx + 1; j < Math.min(idx + 4, lines.length); j++) {
          const lt = lines[j].trim();
          if (lt === '') continue;
          if (lt.startsWith('{')) { openIdx = j; break; }
          if (lt.startsWith('=>') || /;\s*$/.test(lt)) break; // expression-bodied or abstract
          break;
        }
      }
      if (openIdx >= 0) {
        // count body span via brace depth starting at openIdx
        const s2 = { inString: false, inChar: false, verbatim: false, inBlockComment: false };
        let d = 0; let started = false; let endIdx = -1;
        for (let j = openIdx; j < lines.length; j++) {
          d += netBraces(lines[j], s2);
          if (!started && d > 0) started = true;
          if (started && d <= 0) { endIdx = j; break; }
        }
        if (endIdx >= 0) {
          const span = endIdx - idx + 1;
          if (span > 100) {
            const nameMatch = line.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(<[^>]*>)?\s*\(/);
            results.push({ file: rel, line: idx + 1, name: nameMatch ? nameMatch[1] : '(?)', span });
          }
        }
      }
    }
    depth += netBraces(line, litState);
  }
}

// dedupe overlapping (nested local fns can double-count); keep all, sort desc
results.sort((a, b) => b.span - a.span);
for (const r of results) console.log(`${r.span}\t${r.file}:${r.line}\t${r.name}`);
console.error(`\nC# methods >100 lines (heuristic): ${results.length}`);
