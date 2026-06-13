// READ-ONLY round-7 convergence: independently recompute WCAG contrast for the
// DEF-R7-A11Y-STATUS-TINT family + the text-on-solid sites that MUST pass AA.
function srgbToLin(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function relLum([r,g,b]){return 0.2126*srgbToLin(r)+0.7152*srgbToLin(g)+0.0722*srgbToLin(b);}
function hexToRgb(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function contrast(fg,bg){const l1=relLum(hexToRgb(fg)),l2=relLum(hexToRgb(bg));const[hi,lo]=l1>l2?[l1,l2]:[l2,l1];return (hi+0.05)/(lo+0.05);}
function blendHex(fg,a,bg){const f=hexToRgb(fg),b=hexToRgb(bg);return '#'+f.map((c,i)=>Math.round(c*a+b[i]*(1-a)).toString(16).padStart(2,'0')).join('');}

// Tokens straight from globals.css / neutral-ramp.ts (verified identical).
const T={
  light:{bg:'#f8fafc',card:'#ffffff',overdue:'#e17100',overdueText:'#b45b00',bad:'#e7000b',badText:'#e7000b'},
  dark :{bg:'#020618',card:null,    overdue:'#fe9a00',overdueText:'#fe9a00',bad:'#fb2c36',badText:'#fb2c36'},
};
// dark card = white @ ~0.055 over canvas (translucent dark card)
T.dark.card = blendHex('#ffffff',0.055,T.dark.bg);

const AA_SMALL=4.5, AA_LARGE=3.0, NONTEXT=3.0;
const out=[];
const fmt=(v,floor)=>`${v.toFixed(2)} ${v>=floor?'PASS':'FAIL'}`;

out.push('### A. TEXT-ON-SOLID (the migrated -text sites — MUST pass AA small 4.5) ###');
for(const mode of ['light','dark']){
  const t=T[mode];
  // bad-text on canvas + on card (action-chips error line, denial fallbacks on solid, etc.)
  out.push(`[${mode}] badText  on canvas : ${fmt(contrast(t.badText,t.bg),AA_SMALL)}   on card : ${fmt(contrast(t.badText,t.card),AA_SMALL)}`);
  out.push(`[${mode}] overdueText on canvas: ${fmt(contrast(t.overdueText,t.bg),AA_SMALL)}   on card : ${fmt(contrast(t.overdueText,t.card),AA_SMALL)}`);
}

out.push('');
out.push('### B. TEXT-ON-SAME-TONE-TINT (DEF-R7 family — ceiling, light FAIL expected, dark PASS) ###');
const tints=[
  {name:'denialCard bad@8%',   tone:'bad',    alpha:0.08},
  {name:'conflict/Failed bad@10%',tone:'bad', alpha:0.10},
  {name:'pastDue bad@18%',     tone:'bad',    alpha:0.18},
  {name:'trial/expiry/upgrade overdue@10%',tone:'overdue',alpha:0.10},
  {name:'amber Badge overdue@18%',tone:'overdue',alpha:0.18},
];
for(const s of tints){
  const row=[];
  for(const mode of ['light','dark']){
    const t=T[mode];
    const baseHex=t[s.tone];
    const textTok=s.tone==='bad'?t.badText:t.overdueText;
    const tintBg=blendHex(baseHex,s.alpha,t.bg);
    row.push(`${mode}=${contrast(textTok,tintBg).toFixed(2)}${contrast(textTok,tintBg)>=AA_SMALL?'P':'F'}`);
  }
  out.push(`${s.name.padEnd(40)} ${row.join('  ')}`);
}

out.push('');
out.push('### C. NON-TEXT on same-tone tint (dots/icons/borders — 3:1 floor) ###');
for(const s of [{tone:'bad',alpha:0.10},{tone:'overdue',alpha:0.10},{tone:'bad',alpha:0.18},{tone:'overdue',alpha:0.18}]){
  for(const mode of ['light']){
    const t=T[mode];
    const baseHex=t[s.tone];
    const tintBg=blendHex(baseHex,s.alpha,t.bg);
    out.push(`[${mode}] ${s.tone}@${(s.alpha*100)}% : base-icon vs its tint = ${fmt(contrast(baseHex,tintBg),NONTEXT)} (3:1 floor)`);
  }
}

out.push('');
out.push('### D. fgOnBad on bad fill (confirm/destructive pill — both modes) ###');
out.push(`[light] white #ffffff on bad #e7000b : ${fmt(contrast('#ffffff','#e7000b'),AA_SMALL)}`);
out.push(`[dark ] ink #020618 on bad #fb2c36   : ${fmt(contrast('#020618','#fb2c36'),AA_SMALL)}`);

console.log(out.join('\n'));
