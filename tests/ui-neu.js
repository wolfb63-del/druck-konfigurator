'use strict';
/* Prüft css/ui-neu.css, ui-schlicht.css, ui-dunkel.css und ui-gemeinsam.css ohne Browser: (1) jede Regel gilt nur in ihrer Stufe – ohne Attribut
   bleibt die Original-Oberfläche unverändert; (2) Kontraste nach WCAG 2.x mit den echten Farben aus app.css
   und ui-neu.css gegen die Mindestwerte (Text 4,5:1, Bedienelement-Umriss und Fokus 3:1); (3) keine Schrift
   unter 12 px; (4) der Umschalter js/ui-neu.js setzt je Stufe die richtigen Attribute („schlicht“ immer mit
   „neu“). Die Mindestwerte stammen aus WCAG, nicht aus dem Code. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'css', 'app.css'), 'utf8');
const neu = fs.readFileSync(path.join(ROOT, 'css', 'ui-neu.css'), 'utf8');
const sch = fs.readFileSync(path.join(ROOT, 'css', 'ui-schlicht.css'), 'utf8');
const dun = fs.readFileSync(path.join(ROOT, 'css', 'ui-dunkel.css'), 'utf8');
const gem = fs.readFileSync(path.join(ROOT, 'css', 'ui-gemeinsam.css'), 'utf8');
const vm = require('vm');

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else { fail++; console.log('FEHLER ' + name + (detail !== undefined ? ': ' + detail : '')); } }

const token = (css, name) => { const m = new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})').exec(css); return m && m[1]; };
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Rechenkontrolle der Formel mit bekannten Werten: Schwarz/Weiß = 21, gleiche Farbe = 1
check('Formel: Schwarz auf Weiß = 21:1', Math.abs(ratio('#000000', '#ffffff') - 21) < 1e-9);
check('Formel: gleiche Farbe = 1:1', Math.abs(ratio('#777777', '#777777') - 1) < 1e-9);

// (1) Jede Regel ist auf ihre Stufe beschränkt
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
// @keyframes-Stufen (from/to/%) gestalten kein Element und zählen nicht als Regel
const noKeyframes = css => css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
const selectorsOf = css => [...noKeyframes(strip(css)).matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(m => m[1].split(',').map(s => s.trim())).filter(Boolean);
for (const [file, css, scope] of [['ui-neu.css', neu, 'html[data-ui="neu"]'], ['ui-schlicht.css', sch, 'html[data-stil="schlicht"]'], ['ui-dunkel.css', dun, 'html[data-theme="dark"]']]) {
  const sel = selectorsOf(css), loose = sel.filter(x => !x.startsWith(scope));
  check(file + ': alle Regeln nur bei ' + scope, sel.length > 0 && loose.length === 0, loose.join(' | '));
}
// ui-gemeinsam.css gilt überall, darf aber nur die neuen Bausteine gestalten – nichts, was es im Original schon gab
{
  const NEW = /\.(steps|steps-pulse|lang-btn|zoff-row|purge-row|slot-pick|slot-pick-lbl|fdb-row|fdb-sel|step-n|step-t|field-hint|theme-btn|theme-moon|theme-sun|ui-tip|busy|slot-mode)\b/;
  const sel = selectorsOf(gem), loose = sel.filter(x => !NEW.test(x));
  check('ui-gemeinsam.css: nur neue Bausteine', sel.length > 0 && loose.length === 0, loose.join(' | '));
}
// Dunkel nur am Bildschirm – der Ausdruck bleibt hell
check('ui-dunkel.css: alles in @media screen', /^\s*@media screen \{[\s\S]*\}\s*$/.test(strip(dun)));

// (2) Kontraste
const ink = token(app, 'ink'), sheet = token(app, 'sheet'), okSoft = token(app, 'ok-soft');
const fieldBorder = token(neu, 'field-border'), ok = token(neu, 'ok');
const accents = { kobra: token(app, 'accent'), orca: '#3b53a4', u1: '#0a716f' };
check('Orca-/U1-Akzent stehen so in app.css', app.includes('--accent: #3b53a4') && app.includes('--accent: #0a716f'));
const cases = [
  ['Fokus weiß auf Kopfzeile (--ink)', '#ffffff', ink, 3],
  ['Fokus weiß auf Druckerumschalter', '#ffffff', '#2c3138', 3],
  ['Feldrand auf Weiß', fieldBorder, '#ffffff', 3],
  ['Feldrand auf Blatt (--sheet)', fieldBorder, sheet, 3],
  ['Grün auf hellgrün (--ok/--ok-soft)', ok, okSoft, 4.5],
  ['Grün auf Blatt', ok, sheet, 4.5],
  ['Umschalter-Unterzeile, nicht gewählt (#b9b5ab auf #2c3138)', '#b9b5ab', '#2c3138', 4.5],
  ...Object.entries(accents).map(([k, a]) => ['Umschalter-Unterzeile weiß auf Akzent ' + k, '#ffffff', a, 4.5])
];
for (const [name, fg, bg, min] of cases) {
  const r = fg && bg ? ratio(fg, bg) : NaN;
  console.log('  ' + name.padEnd(58) + (r ? r.toFixed(2) : '-') + ':1 (mind. ' + min + ')');
  check(name, r >= min, r);
}
// Logo-Schriftzug in der dunklen Kopfzeile (Lesbarkeit) – 12-px-Zeile braucht 4,5:1
for (const [name, fg] of [['Logo „BW 3D-Druck“ weiß auf Kopfzeile', '#ffffff'], ['Logo-Unterzeile #bdb8ad auf Kopfzeile', '#bdb8ad']]) {
  const r = ratio(fg, ink);
  console.log('  ' + name.padEnd(58) + r.toFixed(2) + ':1 (mind. 4.5)');
  check(name, r >= 4.5, r);
}
check('Logo im Original verborgen (hidden), in ui-neu.css eingeblendet',
  /<span class="brand-bw" hidden>/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) && /html\[data-ui="neu"\] \.brand-bw \{ display: flex/.test(neu));
// Die Ausgangswerte des Reviews: ohne ui-neu.css lagen diese Stellen unter dem Mindestwert
check('Vorher: Akzent als Fokus auf Kopfzeile < 3:1', ratio(accents.kobra, ink) < 3, ratio(accents.kobra, ink));
check('Vorher: --rule-strong als Feldrand < 3:1', ratio(token(app, 'rule-strong'), '#ffffff') < 3);

// Stil „Schlicht“: eigene Farben auf seinen Flächen
{
  const t = n => token(sch, n), paper = t('paper'), paper2 = t('paper-2'), white = '#ffffff';
  const sc = [
    ['Schlicht: Text --ink auf --paper', t('ink'), paper, 4.5],
    ['Schlicht: --ink-2 auf Umschalter (--paper-2)', t('ink-2'), paper2, 4.5],
    ['Schlicht: Unterzeile --ink-3 auf Umschalter (--paper-2)', t('ink-3'), paper2, 4.5],
    ['Schlicht: --ink-3 auf --paper', t('ink-3'), paper, 4.5],
    ['Schlicht: --ink-3 auf Weiß', t('ink-3'), white, 4.5],
    ['Schlicht: Feldrand auf Weiß', t('field-border'), white, 3],
    ['Schlicht: Feldrand auf --paper', t('field-border'), paper, 3],
    ...Object.entries(accents).flatMap(([k, a]) => [
      ['Schlicht: Unterzeile Akzent ' + k + ' auf Weiß (gewählt)', a, white, 4.5],
      ['Schlicht: Fokus Akzent ' + k + ' auf heller Kopfzeile (--paper)', a, paper, 3]])
  ];
  for (const [name, fg, bg, min] of sc) {
    const r = fg && bg ? ratio(fg, bg) : NaN;
    console.log('  ' + name.padEnd(58) + (r ? r.toFixed(2) : '-') + ':1 (mind. ' + min + ')');
    check(name, r >= min, r);
  }
}

// Dunkel: Farben je Block (Grundfarben für Original/Lesbarkeit, eigener Block für Schlicht)
{
  const block = sel => { const i = dun.indexOf(sel + ' {'); return i < 0 ? '' : dun.slice(i, dun.indexOf('}', i)); };
  const base = block('html[data-theme="dark"]'), sd = block('html[data-theme="dark"][data-stil="schlicht"]');
  const t = (b, n) => token(b, n) || token(base, n);
  const acc = { kobra: token(block('html[data-theme="dark"] body'), 'accent'), orca: token(block('html[data-theme="dark"] body[data-printer="orca"]'), 'accent'), u1: token(block('html[data-theme="dark"] body[data-printer="snapmaker_u1"]'), 'accent') };
  const dc = [];
  for (const [label, b] of [['Dunkel', base], ['Schlicht dunkel', sd]]) {
    const paper = t(b, 'paper'), sh = t(b, 'sheet'), p2 = t(b, 'paper-2');
    dc.push([label + ': Text --ink auf --sheet', t(b, 'ink'), sh, 4.5], [label + ': Text --ink auf --paper', t(b, 'ink'), paper, 4.5],
      [label + ': --ink-2 auf --paper-2', t(b, 'ink-2'), p2, 4.5], [label + ': --ink-3 auf --sheet', t(b, 'ink-3'), sh, 4.5],
      [label + ': --ink-3 auf --paper', t(b, 'ink-3'), paper, 4.5], [label + ': --ink-3 auf --paper-2', t(b, 'ink-3'), p2, 4.5],
      [label + ': Feldrand auf --sheet', t(b, 'field-border'), sh, 3], [label + ': Feldrand auf --paper', t(b, 'field-border'), paper, 3]);
    for (const [k, a] of Object.entries(acc)) dc.push([label + ': Akzent ' + k + ' als Text auf --sheet', a, sh, 4.5], [label + ': Akzent ' + k + ' als Fokus auf --paper', a, paper, 3]);
  }
  for (const [k, a] of Object.entries(acc)) dc.push(['Dunkel: Schrift (--accent-ink) auf Akzent ' + k, token(base, 'accent-ink'), a, 4.5], ['Dunkel: Akzent ' + k + ' auf Kopfzeile #0e1013', a, '#0e1013', 3]);
  for (const k of ['ok', 'warn', 'bad', 'info']) dc.push(['Dunkel: --' + k + ' auf --' + k + '-soft', token(base, k), token(base, k + '-soft'), 4.5]);
  dc.push(['Dunkel: Fehlerhinweis #ffd2cd auf --bad-soft', '#ffd2cd', token(base, 'bad-soft'), 4.5],
    ['Schlicht dunkel: --ink auf gewählter Taste #3a3a3c', t(sd, 'ink'), '#3a3a3c', 4.5],
    ...Object.entries(acc).map(([k, a]) => ['Schlicht dunkel: Akzent ' + k + ' auf gewählter Taste #3a3a3c', a, '#3a3a3c', 4.5]));
  check('Schlicht dunkel: gewählte Taste nutzt #3a3a3c', dun.includes('[aria-checked="true"] { background: #3a3a3c'));
  for (const [name, fg, bg, min] of dc) {
    const r = fg && bg ? ratio(fg, bg) : NaN;
    console.log('  ' + name.padEnd(58) + (r ? r.toFixed(2) : '-') + ':1 (mind. ' + min + ')');
    check(name, r >= min, fg + ' / ' + bg + ' = ' + r);
  }
}

// (3) Schriftgrößen
for (const [file, css] of [['ui-neu.css', neu], ['ui-schlicht.css', sch], ['ui-gemeinsam.css', gem]]) {
  const sizes = [...strip(css).matchAll(/font-size:\s*([\d.]+)px/g)].map(m => +m[1]);
  check(file + ': keine Schrift unter 12 px', sizes.length > 0 && sizes.every(x => x >= 12), sizes.join());
}

// (4) Umschalter: Attribute je Stufe, Standard „neu“, unbekannter gespeicherter Wert → „neu“
function runToggle(stored, opts = {}) {
  const ds = {}, mem = { 'druckKonfigurator.ui': stored };
  if (opts.theme) mem['druckKonfigurator.theme'] = opts.theme;
  const ctx = vm.createContext({
    document: { documentElement: { dataset: ds }, querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} },
    window: { matchMedia: q => ({ matches: !!opts.sysDark && /dark/.test(q) }) },
    localStorage: { getItem: k => (k in mem && mem[k] !== undefined ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } }
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'ui-neu.js'), 'utf8'), ctx);
  return { ds, set: m => { vm.runInContext('setUiMode(' + JSON.stringify(m) + ')', ctx); return { ui: ds.ui, stil: ds.stil, saved: mem['druckKonfigurator.ui'] }; } };
}
{
  const a = runToggle(undefined);
  check('Umschalter: ohne Speicher → Lesbarkeit', a.ds.ui === 'neu' && a.ds.stil === undefined, JSON.stringify(a.ds));
  check('Umschalter: Original → keine Attribute', JSON.stringify(a.set('original')) === JSON.stringify({ saved: 'original' }));
  check('Umschalter: Schlicht → data-ui=neu + data-stil=schlicht', JSON.stringify(a.set('schlicht')) === JSON.stringify({ ui: 'neu', stil: 'schlicht', saved: 'schlicht' }));
  check('Umschalter: zurück auf Lesbarkeit → kein data-stil', JSON.stringify(a.set('neu')) === JSON.stringify({ ui: 'neu', saved: 'neu' }));
  const b = runToggle('original');
  check('Umschalter: gespeichert „original“ → Original beim Laden', b.ds.ui === undefined && b.ds.stil === undefined, JSON.stringify(b.ds));
  const c = runToggle('kaputt');
  check('Umschalter: unbekannter Wert → Lesbarkeit', c.ds.ui === 'neu' && c.ds.stil === undefined, JSON.stringify(c.ds));
  // Hell/Dunkel: ohne Wahl wie das System, gespeicherte Wahl gewinnt, unabhängig von der Ansicht
  check('Hell/Dunkel: System hell → hell', runToggle(undefined).ds.theme === undefined);
  check('Hell/Dunkel: System dunkel → dunkel', runToggle(undefined, { sysDark: true }).ds.theme === 'dark');
  check('Hell/Dunkel: gespeichert hell schlägt System dunkel', runToggle(undefined, { sysDark: true, theme: 'light' }).ds.theme === undefined);
  const d = runToggle('schlicht', { theme: 'dark' });
  check('Hell/Dunkel: Schlicht dunkel → ui=neu, stil=schlicht, theme=dark', d.ds.ui === 'neu' && d.ds.stil === 'schlicht' && d.ds.theme === 'dark', JSON.stringify(d.ds));
  const o = runToggle('original', { theme: 'dark' });
  check('Hell/Dunkel: Original dunkel → nur theme=dark', o.ds.ui === undefined && o.ds.theme === 'dark', JSON.stringify(o.ds));
}

// (5) Einsteiger-Hilfen: im Original verborgen; Schritt-Leiste zeigt den richtigen Stand
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const hints = html.match(/<small class="field-hint"[^>]*>/g) || [];
  // Seit 2026-10-03 in allen Ansichten (Wunsch des Nutzers): nicht mehr verborgen
  check('Klartext-Hilfen: 4 Stück, in allen Ansichten sichtbar', hints.length === 4 && hints.every(h => !/hidden/.test(h)), hints.join(' '));
  check('Schritt-Leiste in allen Ansichten sichtbar', /<nav class="steps noprint" id="steps" aria-label="Schritte">/.test(html));
  check('Ansicht-Umschalter im eigenen Menü, nicht mehr unter Profile', /id="menuAnsicht"[\s\S]*data-ui-mode="schlicht"/.test(html) && !/id="menuProfile"(?:(?!<\/div>)[\s\S])*data-ui-mode/.test(html));
  check('Hell/Dunkel-Knopf vorhanden', /<button[^>]*id="themeBtn"[^>]*aria-pressed=/.test(html));
  // Minimal-DOM: drei Schritt-Knöpfe mit .step-n/.step-t
  const mk = i => { const cls = new Set(), n = { textContent: '' }, t = { textContent: '' }, at = {};
    return { dataset: { step: String(i) }, title: '', classList: { toggle: (c, on) => on ? cls.add(c) : cls.delete(c), has: c => cls.has(c) },
      setAttribute: (k, v) => { at[k] = v; }, removeAttribute: k => { delete at[k]; }, at, querySelector: q => q === '.step-n' ? n : t, n, t }; };
  const btns = [mk(1), mk(2), mk(3)];
  const bar = { querySelectorAll: () => btns, addEventListener: () => {} };
  const mem = {};
  const ctx = vm.createContext({ document: { getElementById: id => id === 'steps' ? bar : null, addEventListener: () => {}, querySelector: () => null },
    localStorage: { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } },
    project: null, lastResult: { printer: { label: 'Snapmaker U1' } }, toast: () => {} });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'steps.js'), 'utf8'), ctx);
  const state = () => btns.map(b => (b.classList.has('done') ? 'd' : '-') + (b.classList.has('current') ? 'c' : '') + b.n.textContent).join(' ');
  vm.runInContext('renderSteps()', ctx);
  // Gemeldet 2026-10-03: Schritt 1 war immer abgehakt, obwohl nur der voreingestellte Drucker aktiv war
  check('Erster Besuch: Schritt 1 offen und aktuell, „Drucker wählen“', state() === '-c1 -2 -3' && btns[0].t.textContent === 'Drucker wählen' && btns[0].at['aria-current'] === 'step', state());
  vm.runInContext('project = { name: "x.stl" }; renderSteps()', ctx);
  check('Modell ohne Druckerwahl: Schritt 1 bleibt aktuell, 2 erledigt', state() === '-c1 d✓ -3', state());
  vm.runInContext('project = null; markPrinterChosen()', ctx);
  check('Drucker gewählt: 1 erledigt mit Namen, gemerkt', state() === 'd✓ -c2 -3' && btns[0].t.textContent === 'Drucker: Snapmaker U1' && mem['druckKonfigurator.printerChosen'] === '1', state());
  const ctx2 = vm.createContext({ document: ctx.document, localStorage: ctx.localStorage, project: null, lastResult: ctx.lastResult, toast: () => {} });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'steps.js'), 'utf8') + ';renderSteps()', ctx2);
  check('Wiederkehrender Besuch: Schritt 1 gleich erledigt', state() === 'd✓ -c2 -3', state());
  check('Schritte ohne Modell: 1 erledigt, 2 aktuell', state() === 'd✓ -c2 -3' && btns[1].at['aria-current'] === 'step', state());
  vm.runInContext('project = { name: "a.stl" }; renderSteps()', ctx);
  check('Schritte mit Modell: 3 aktuell, Name angezeigt', state() === 'd✓ d✓ -c3' && btns[1].t.textContent === 'Modell: a.stl', state());
  vm.runInContext('markExported()', ctx);
  check('Nach dem Speichern: alle erledigt, keiner aktuell', state() === 'd✓ d✓ d✓' && btns[2].t.textContent === '3MF gespeichert', state());
  vm.runInContext('project = { name: "b.stl" }; renderSteps()', ctx);
  check('Neues Modell: Schritt 3 wieder offen', state() === 'd✓ d✓ -c3', state());
}

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
