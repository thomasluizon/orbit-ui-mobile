import fs from 'fs';
const path = process.argv[2];
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
for (const l of lines) {
  let o;
  try { o = JSON.parse(l); } catch { continue; }
  if (o.type === 'user') {
    let c = o.message?.content;
    if (typeof c === 'string') {
      if (!c.startsWith('<')) console.log('=== USER ===\n' + c.slice(0, 1800) + '\n');
    } else if (Array.isArray(c)) {
      for (const p of c) {
        if (p.type === 'text' && !p.text.startsWith('<')) console.log('=== USER ===\n' + p.text.slice(0, 1800) + '\n');
      }
    }
  } else if (o.type === 'assistant') {
    let c = o.message?.content;
    if (Array.isArray(c)) {
      for (const p of c) {
        if (p.type === 'text' && p.text.trim()) console.log('--- ASSISTANT ---\n' + p.text.slice(0, 1200) + '\n');
      }
    }
  }
}
