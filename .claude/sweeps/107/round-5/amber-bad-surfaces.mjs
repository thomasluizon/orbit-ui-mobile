// Round-5 read-only: amber/bad status text on light surfaces (canvas vs white card).
function srgbToLin(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function relLum([r,g,b]){return 0.2126*srgbToLin(r)+0.7152*srgbToLin(g)+0.0722*srgbToLin(b);}
function hexToRgb(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function contrast(fg,bg){const l1=relLum(hexToRgb(fg)),l2=relLum(hexToRgb(bg));const[hi,lo]=l1>l2?[l1,l2]:[l2,l1];return (hi+0.05)/(lo+0.05);}
function blend(fg,a,bg){const f=hexToRgb(fg),b=hexToRgb(bg);return '#'+f.map((c,i)=>Math.round(c*a+b[i]*(1-a)).toString(16).padStart(2,'0')).join('');}

const canvasL='#f8fafc';        // --bg light
const cardL='#ffffff';          // --bg-card / --bg-elev light (pure white)
const canvasD='#020618';        // --bg dark
const overdueL='#e17100', overdueTextL='#b45b00';
const overdueD='#fe9a00', overdueTextD='#fe9a00';
const badL='#e7000b', badTextL='#e7000b';   // bad-text light == base
const badD='#fb2c36', badTextD='#fb2c36';

const out=[];
out.push('=== AMBER (overdue) as TEXT, LIGHT ===');
out.push(`base   on canvas #f8fafc : ${contrast(overdueL,canvasL).toFixed(2)}   (-text ${contrast(overdueTextL,canvasL).toFixed(2)})`);
out.push(`base   on white card    : ${contrast(overdueL,cardL).toFixed(2)}   (-text ${contrast(overdueTextL,cardL).toFixed(2)})`);
out.push('  amber@10% tint over canvas (trial-banner/expiry surface):');
const tint10=blend(overdueL,0.10,canvasL);
out.push(`    base on amber10%tint  : ${contrast(overdueL,tint10).toFixed(2)}   (-text ${contrast(overdueTextL,tint10).toFixed(2)})  [DEF-R4-A11Y-3 class]`);
out.push('=== AMBER as TEXT, DARK (all pass) ===');
out.push(`base on canvas #020618  : ${contrast(overdueD,canvasD).toFixed(2)}`);

out.push('=== BAD (status-bad) as TEXT, LIGHT ===');
out.push(`base on canvas #f8fafc  : ${contrast(badL,canvasL).toFixed(2)}   (PASS >=4.5 on canvas)`);
out.push(`base on white card      : ${contrast(badL,cardL).toFixed(2)}   (FAIL <4.5 on white card)`);
out.push('=== BAD as TEXT, DARK ===');
out.push(`base on canvas #020618  : ${contrast(badD,canvasD).toFixed(2)}`);
console.log(out.join('\n'));
