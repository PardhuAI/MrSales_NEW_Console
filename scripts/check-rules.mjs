/**
 * The hard rules of CLAUDE.md that a machine can check, run over the source.
 * A screen that breaks one does not ship, so this fails the build on any.
 *
 *     npm run check:rules
 *
 * What it cannot check (one clear hero, hierarchy, the feel) is reviewed by
 * eye and recorded in REVIEW.md.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
walk(join(root, 'src'));
files.push(join(root, 'index.html'));

const problems = [];
const say = (file, line, rule, text) => problems.push(`${relative(root, file)}:${line}  ${rule}: ${text.trim().slice(0, 110)}`);

// Visible text in a TSX file: strings and JSX text, not comments.
const withoutComments = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const isCss = file.endsWith('.css');
  const isUi = /\.(tsx|ts)$/.test(file) && !file.includes('/demo/') && !file.endsWith('.d.ts');
  const code = isCss ? raw.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')) : withoutComments(raw);
  const lines = code.split('\n');
  const rawLines = raw.split('\n');
  lines.forEach((l, i) => {
    const n = i + 1;
    if (/\b(Inter|Geist|Space Grotesk)\b/.test(l) && /font|family|googleapis/i.test(l)) say(file, n, 'banned font', l);
    if (/lucide/i.test(l)) say(file, n, 'banned icons (Lucide)', l);
    if (/\p{Extended_Pictographic}/u.test(l) && !/[₹✓]/.test(l)) say(file, n, 'emoji', l);
    if (isCss) {
      if (/gradient\(/.test(l) && !/hard stop/.test(rawLines[i - 1] ?? '')) say(file, n, 'gradient', l);
      if (!file.endsWith('tokens.css') && /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(l)) say(file, n, 'raw colour outside tokens.css', l);
      if (/box-shadow:/.test(l) && !/var\(--shadow-float\)|inset|0 0 0 3px var\(--accent-soft\)|none/.test(l)) say(file, n, 'a shadow on something that does not float', l);
      if (/backdrop-filter/.test(l)) say(file, n, 'glass effect', l);
    }
    if (isUi) {
      if (/[—–]/.test(l)) say(file, n, 'em or en dash on screen', l);
      if (/['">]\s*(Overview|At a glance|Key metrics|Insights|Welcome back)\b/.test(l)) say(file, n, 'banned heading', l);
    }
  });
}

if (problems.length) {
  console.error(`${problems.length} rule ${problems.length === 1 ? 'break' : 'breaks'}:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`The checkable hard rules hold across ${files.length} files.`);
