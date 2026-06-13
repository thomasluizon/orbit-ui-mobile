// Read-only WCAG contrast calculator for round-2 a11y audit.
// Supports hex and oklch() inputs. No deps.

function srgbToLin(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function relLumRGB([r, g, b]) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
// oklch -> sRGB (D65). l in [0,1], c chroma, h degrees.
function oklchToRgb(l, c, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  let r = +4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  let g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  let bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;
  const lin2srgb = (x) => {
    x = Math.max(0, Math.min(1, x));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  };
  return [lin2srgb(r), lin2srgb(g), lin2srgb(bl)].map((v) => Math.round(v * 255));
}
function lum(spec) {
  if (typeof spec === 'string' && spec.startsWith('#')) return relLumRGB(hexToRgb(spec));
  if (Array.isArray(spec)) return relLumRGB(oklchToRgb(spec[0], spec[1], spec[2]));
  throw new Error('bad spec ' + spec);
}
function contrast(fg, bg) {
  const l1 = lum(fg), l2 = lum(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
// Alpha blend fg(rgb,a) over solid bg(rgb) -> rgb
function blend(fgRgb, a, bgRgb) {
  return fgRgb.map((c, i) => Math.round(c * a + bgRgb[i] * (1 - a)));
}

// ---- token values from globals.css / neutral-ramp.ts (purple scheme defaults) ----
// chroma-scale-fg = 1 for purple; hue 265.1322
const HUE = 265.1322;
// fg ramp (oklch L, C, H) — purple
const DARK = {
  bg: '#020618',           // canvas ink
  // card: translucent white over bg; approximate as elevated — use measured alpha
  fg1: [0.9491, 0.0153, HUE - 8.1393],
  fg2: [0.8003, 0.0288, HUE - 8.1393],
  fg3: [0.7038, 0.0402 * 1, HUE - 8.1393],
  fg4: [0.5542, 0.046 * 1, HUE - 7.6061],
};
const LIGHT = {
  bg: '#f8fafc',
  fg1: [0.2178, 0.0153, HUE - 8.1393],
  fg2: [0.3729, 0.0288, HUE - 8.1393],
  fg3: [0.5542, 0.046 * 1, HUE - 7.6061],
  fg4: [0.7038, 0.0402 * 1, HUE - 8.1393],
};
// dark card surface: white @ ~0.04-0.06 over bg. neutral-ramp bgCard alpha:
const darkCardRgb = blend([255, 255, 255], 0.055, hexToRgb('#020618'));
const lightCardRgb = [255, 255, 255]; // white cards on light

function row(label, fg, bgSpec) {
  const bg = Array.isArray(bgSpec) || (typeof bgSpec === 'string' && bgSpec.startsWith('#')) ? bgSpec : bgSpec;
  const c = contrast(fg, bg);
  return `${label}: ${c.toFixed(2)}`;
}

const out = [];
out.push('=== fg-4 as TEXT ===');
out.push(row('dark fg-4 on bg', DARK.fg4, DARK.bg));
out.push(row('dark fg-4 on card', DARK.fg4, darkCardRgb));
out.push(row('light fg-4 on bg', LIGHT.fg4, LIGHT.bg));
out.push(row('light fg-4 on white card', LIGHT.fg4, lightCardRgb));
out.push('=== fg-3 as TEXT (migration target) ===');
out.push(row('dark fg-3 on bg', DARK.fg3, DARK.bg));
out.push(row('dark fg-3 on card', DARK.fg3, darkCardRgb));
out.push(row('light fg-3 on bg', LIGHT.fg3, LIGHT.bg));
out.push(row('light fg-3 on white card', LIGHT.fg3, lightCardRgb));

out.push('=== status-overdue base as TEXT (light) ===');
out.push(row('light overdue #e17100 on bg', '#e17100', LIGHT.bg));
out.push(row('light overdue #e17100 on white', '#e17100', lightCardRgb));
out.push('=== status-overdue-TEXT token (light) ===');
out.push(row('light overdue-text #b45b00 on bg', '#b45b00', LIGHT.bg));
out.push(row('light overdue-text #b45b00 on white', '#b45b00', lightCardRgb));
out.push('=== status-bad base/text (light) ===');
out.push(row('light bad #e7000b on bg', '#e7000b', LIGHT.bg));
out.push(row('light bad #e7000b on white', '#e7000b', lightCardRgb));
out.push('=== status-overdue/bad dark text ===');
out.push(row('dark overdue-text #fe9a00 on bg', '#fe9a00', DARK.bg));
out.push(row('dark bad-text #fb2c36 on bg', '#fb2c36', DARK.bg));

out.push('=== white / ink on status-bad fill (confirm danger pill) ===');
out.push(row('white on dark bad #fb2c36', '#ffffff', '#fb2c36'));
out.push(row('ink #020618 on dark bad #fb2c36', '#020618', '#fb2c36'));
out.push(row('white on light bad #e7000b', '#ffffff', '#e7000b'));

out.push('=== fg-on-primary on accent (per scheme x mode) ===');
const accents = {
  'purple dark #7f46f7': '#7f46f7', 'purple light #631df2': '#631df2',
  'blue dark #2b7fff': '#2b7fff', 'blue light #155dfc': '#155dfc',
  'green dark #00c950': '#00c950', 'green light #00a63e': '#00a63e',
  'rose dark #ff2056': '#ff2056', 'rose light #ec003f': '#ec003f',
  'orange dark #ff6900': '#ff6900', 'orange light #f54900': '#f54900',
  'cyan dark #00b8db': '#00b8db', 'cyan light #0092b8': '#0092b8',
};
const resolved = {
  'purple dark #7f46f7': '#ffffff', 'purple light #631df2': '#ffffff',
  'blue dark #2b7fff': '#020618', 'blue light #155dfc': '#ffffff',
  'green dark #00c950': '#020618', 'green light #00a63e': '#020618',
  'rose dark #ff2056': '#020618', 'rose light #ec003f': '#ffffff',
  'orange dark #ff6900': '#020618', 'orange light #f54900': '#020618',
  'cyan dark #00b8db': '#020618', 'cyan light #0092b8': '#020618',
};
for (const [k, accent] of Object.entries(accents)) {
  const ink = resolved[k];
  out.push(`${k}: resolved-ink(${ink})=${contrast(ink, accent).toFixed(2)}  [white=${contrast('#ffffff', accent).toFixed(2)} ink020618=${contrast('#020618', accent).toFixed(2)}]`);
}

out.push('=== primary as TEXT (links/text-buttons) on bg ===');
out.push(row('purple dark #7f46f7 on bg', '#7f46f7', DARK.bg));
out.push(row('purple light #631df2 on white', '#631df2', lightCardRgb));
out.push(row('green light #00a63e on white', '#00a63e', lightCardRgb));
out.push(row('orange light #f54900 on white', '#f54900', lightCardRgb));
out.push(row('cyan light #0092b8 on white', '#0092b8', lightCardRgb));
out.push(row('rose light #ec003f on white', '#ec003f', lightCardRgb));

console.log(out.join('\n'));
