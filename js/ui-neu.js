'use strict';
/* Darstellung, zwei unabhängige Schalter:
   – Ansicht (Menü „Ansicht“): „original“ (nur app.css), „neu“ (Verbesserte Lesbarkeit, css/ui-neu.css) oder
     „schlicht“ (Stil nach Apple-Prinzipien, css/ui-schlicht.css – baut auf „neu“ auf).
   – Hell/Dunkel (Knopf in der Kopfzeile): data-theme="dark" (css/ui-dunkel.css), wirkt auf jede Ansicht.
     Ohne gespeicherte Wahl folgt es der Einstellung von System/Browser (prefers-color-scheme).
   Wird im <head> geladen, damit die Attribute vor dem ersten Zeichnen stehen (kein Aufblitzen).
   Eigene Speicherschlüssel, unabhängig von den Profilen in store.js. */
const UI_KEY = 'druckKonfigurator.ui';
const THEME_KEY = 'druckKonfigurator.theme';
const TIP_KEY = 'druckKonfigurator.uiTip';
const UI_MODES = ['original', 'neu', 'schlicht'];
function readKey(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function writeKey(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ohne Speicher gilt die Wahl nur bis zum Neuladen */ } }
function uiMode() { const m = readKey(UI_KEY); return UI_MODES.includes(m) ? m : 'neu'; }
function systemDark() { try { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; } }
function uiTheme() { const t = readKey(THEME_KEY); return t === 'dark' || t === 'light' ? t : (systemDark() ? 'dark' : 'light'); }

function applyUiMode(mode) {
  const d = document.documentElement.dataset;
  if (mode === 'original') delete d.ui; else d.ui = 'neu';
  if (mode === 'schlicht') d.stil = 'schlicht'; else delete d.stil;
  setFavicon(mode !== 'original');
}
function applyTheme(theme) {
  const d = document.documentElement.dataset;
  if (theme === 'dark') d.theme = 'dark'; else delete d.theme;
}
// Favicon (3D-Drucker) nur in den neuen Ansichten; das Original hatte keins
function setFavicon(on) {
  const head = document.head, old = head && head.querySelector('link[data-ui-icon]');
  if (!head || on === !!old) return;
  if (!on) { old.remove(); return; }
  const l = document.createElement('link');
  l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = 'img/favicon.svg'; l.dataset.uiIcon = '';
  head.appendChild(l);
}
function setUiMode(mode) { applyUiMode(mode); writeKey(UI_KEY, mode); showUiState(mode); }
function setTheme(theme) { applyTheme(theme); writeKey(THEME_KEY, theme); showThemeState(theme); }

// Menüpunkte und Vorlese-Status dem Zustand anpassen
function showUiState(mode) {
  document.querySelectorAll('[data-ui-mode]').forEach(b => {
    const on = b.dataset.uiMode === mode, mark = b.querySelector('.ui-mark') || b.insertBefore(document.createElement('span'), b.firstChild);
    mark.className = 'ui-mark'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = on ? '✓ ' : '';
    b.setAttribute('aria-checked', String(on));
  });
  // Lade- und Fehlermeldungen vorlesen lassen (nicht im Original)
  const info = document.getElementById('fileinfo');
  if (info) { if (mode !== 'original') info.setAttribute('role', 'status'); else info.removeAttribute('role'); }
}
function showThemeState(theme) {
  const b = document.getElementById('themeBtn');
  if (!b) return;
  const dark = theme === 'dark';
  b.setAttribute('aria-pressed', String(dark));
  b.title = dark ? 'Hell darstellen' : 'Dunkel darstellen';
}

// Einmaliger Tipp, wo Ansicht und Hell/Dunkel sitzen – erst nach dem Haftungsausschluss
function showUiTip() {
  const tip = document.getElementById('uiTip');
  if (!tip || readKey(TIP_KEY)) return;
  const done = () => { tip.hidden = true; writeKey(TIP_KEY, '1'); };
  const show = () => { tip.hidden = false; };
  tip.querySelector('button').addEventListener('click', done);
  document.querySelectorAll('[aria-controls="menuAnsicht"], #themeBtn').forEach(b => b.addEventListener('click', done));
  const dlg = document.getElementById('disclaimerDlg');
  if (dlg && dlg.open) dlg.addEventListener('close', show, { once: true }); else show();
}

applyUiMode(uiMode());
applyTheme(uiTheme());

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-ui-mode]').forEach(b => b.addEventListener('click', () => setUiMode(b.dataset.uiMode)));
  const tb = document.getElementById('themeBtn');
  if (tb) tb.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  showUiState(uiMode());
  showThemeState(uiTheme());
  // Disclaimer öffnet app.js erst nach diesem Handler – deshalb einen Takt später prüfen
  setTimeout(showUiTip, 0);
});
