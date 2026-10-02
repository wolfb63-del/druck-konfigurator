'use strict';
/* Prüft css/ui-neu.css und css/ui-schlicht.css ohne Browser: (1) jede Regel gilt nur in ihrer Stufe – ohne Attribut
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
const selectorsOf = css => [...strip(css).matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(m => m[1].split(',').map(s => s.trim())).filter(Boolean);
for (const [file, css, scope] of [['ui-neu.css', neu, 'html[data-ui="neu"]'], ['ui-schlicht.css', sch, 'html[data-stil="schlicht"]']]) {
  const sel = selectorsOf(css), loose = sel.filter(x => !x.startsWith(scope));
  check(file + ': alle Regeln nur bei ' + scope, sel.length > 0 && loose.length === 0, loose.join(' | '));
}

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

// (3) Schriftgrößen
for (const [file, css] of [['ui-neu.css', neu], ['ui-schlicht.css', sch]]) {
  const sizes = [...strip(css).matchAll(/font-size:\s*([\d.]+)px/g)].map(m => +m[1]);
  check(file + ': keine Schrift unter 12 px', sizes.length > 0 && sizes.every(x => x >= 12), sizes.join());
}

// (4) Umschalter: Attribute je Stufe, Standard „neu“, unbekannter gespeicherter Wert → „neu“
function runToggle(stored) {
  const ds = {}, mem = { 'druckKonfigurator.ui': stored };
  const ctx = vm.createContext({
    document: { documentElement: { dataset: ds }, querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} },
    localStorage: { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } }
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
}

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
