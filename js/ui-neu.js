'use strict';
/* Umschalter der Oberfläche: „original“ (nur app.css), „neu“ (Verbesserte Lesbarkeit, css/ui-neu.css) und
   „schlicht“ (Stil nach Apple-Prinzipien, css/ui-schlicht.css – baut auf „neu“ auf). Wird im <head> geladen,
   damit die Attribute vor dem ersten Zeichnen stehen und die Seite nicht kurz im Original aufblitzt.
   Eigener Speicherschlüssel, unabhängig von den Profilen in store.js. */
const UI_KEY = 'druckKonfigurator.ui';
const UI_MODES = ['original', 'neu', 'schlicht'];
function uiMode() {
  try { const m = localStorage.getItem(UI_KEY); return UI_MODES.includes(m) ? m : 'neu'; } catch (e) { return 'neu'; }
}
function applyUiMode(mode) {
  const d = document.documentElement.dataset;
  if (mode === 'original') delete d.ui; else d.ui = 'neu';
  if (mode === 'schlicht') d.stil = 'schlicht'; else delete d.stil;
  setFavicon(mode !== 'original');
}
// Favicon (3D-Drucker) nur in den neuen Stufen; das Original hatte keins
function setFavicon(on) {
  const head = document.head, old = head && head.querySelector('link[data-ui-icon]');
  if (!head || on === !!old) return;
  if (!on) { old.remove(); return; }
  const l = document.createElement('link');
  l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = 'img/favicon.svg'; l.dataset.uiIcon = '';
  head.appendChild(l);
}
function setUiMode(mode) {
  applyUiMode(mode);
  try { localStorage.setItem(UI_KEY, mode); } catch (e) { /* ohne Speicher gilt die Wahl nur bis zum Neuladen */ }
  showUiState(mode);
}
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
applyUiMode(uiMode());

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-ui-mode]').forEach(b => b.addEventListener('click', () => setUiMode(b.dataset.uiMode)));
  showUiState(uiMode());
});
