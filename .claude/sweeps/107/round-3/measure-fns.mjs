import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const ROOT = process.argv[2];
const SCAN = ['apps/web', 'apps/mobile', 'packages/shared'];
const EXCLUDE_DIRS = new Set(['node_modules', '.next', 'build', 'android', 'ios', 'dist', '.expo', 'coverage', '.turbo']);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      if (/\.test\.|\.spec\./.test(name)) continue;
      if (full.includes(`${sep}__tests__${sep}`)) continue;
      out.push(full);
    }
  }
}

function lineCount(node, sf) {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
  return end - start + 1;
}

function startLine(node, sf) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

// Determine if a function-like node body is essentially a single object/array literal
// (StyleSheet.create arg, data factory returning a literal, store-state factory) => not a rule-7 logic fn.
function bodyIsSingleLiteralReturn(node) {
  const body = node.body;
  if (!body || !ts.isBlock(body)) {
    // arrow with expression body
    if (body && (ts.isObjectLiteralExpression(body) || ts.isArrayLiteralExpression(body) || ts.isCallExpression(body))) {
      return classifyExprAsLiteral(body);
    }
    return null;
  }
  const stmts = body.statements;
  if (stmts.length !== 1) return null;
  const s = stmts[0];
  if (ts.isReturnStatement(s) && s.expression) {
    return classifyExprAsLiteral(s.expression);
  }
  return null;
}

function classifyExprAsLiteral(expr) {
  if (ts.isObjectLiteralExpression(expr)) return 'object-literal';
  if (ts.isArrayLiteralExpression(expr)) return 'array-literal';
  // StyleSheet.create({...}) / create<T>()(...) style calls whose args are object literals
  if (ts.isCallExpression(expr)) {
    const allObj = expr.arguments.length > 0 && expr.arguments.every(a =>
      ts.isObjectLiteralExpression(a) || ts.isArrowFunction(a) || ts.isFunctionExpression(a));
    if (allObj) return 'call-literal';
  }
  return null;
}

function nameOf(node, sf) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  // variable initializer: const X = (...) =>
  let p = node.parent;
  if (p && ts.isVariableDeclaration(p) && p.name && ts.isIdentifier(p.name)) return p.name.text;
  // property assignment: X: () => {}
  if (p && ts.isPropertyAssignment(p) && p.name && ts.isIdentifier(p.name)) return p.name.text;
  // call arg (e.g. StyleSheet.create(() => ...)) — climb to var
  return '(anon)';
}

const results = [];

for (const ws of SCAN) {
  const base = join(ROOT, ws);
  let files = [];
  try { walk(base, files); } catch { continue; }
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rel = relative(ROOT, file).split(sep).join('/');
    const visit = (node) => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)
      ) {
        const lc = lineCount(node, sf);
        if (lc > 100) {
          const literalKind = bodyIsSingleLiteralReturn(node);
          results.push({
            file: rel,
            line: startLine(node, sf),
            name: nameOf(node, sf),
            lines: lc,
            literalKind: literalKind || '',
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

results.sort((a, b) => b.lines - a.lines);
for (const r of results) {
  console.log(`${r.lines}\t${r.file}:${r.line}\t${r.name}\t${r.literalKind}`);
}
console.error(`TOTAL >100L function-like nodes: ${results.length}`);
console.error(`  of which literal-bodied (likely SKIP): ${results.filter(r => r.literalKind).length}`);
