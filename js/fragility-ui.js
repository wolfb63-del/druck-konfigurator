'use strict';
/* Stabilitäts-Ansicht in der 3D-Ansicht: Umschalter Überhang | Stabilität, Farbkarte aus fragility.js,
   Legende und eine Kennzeile. Nur Hinweis – an den Druckparametern ändert sich nichts.
   Gerechnet wird erst, wenn die Ansicht eingeschaltet ist; das Ergebnis bleibt je Teil-Geometrie und
   Linienbreite gespeichert (nach dem Drehen eines Teils entsteht eine neue Geometrie → neu rechnen). */
const Stability = (() => {
  const cache = new WeakMap();   // geom → { lw, result }
  let mode = 'overhang', pending = 0;

  // Linienbreite der Außenwand der gewählten Düse (Wände bestehen aus diesen Linien)
  const lineWidth = () => (NOZ[nkey($('nozD').value)] || NOZ['0.4']).lwo;

  function cached(g) {
    const e = g && cache.get(g), lw = lineWidth();
    return e && e.lw === lw ? e.result : null;
  }
  function resultFor(g) {
    let r = cached(g);
    if (!r && g) { r = analyzeFragility(g, { lineWidth: lineWidth() }); cache.set(g, { lw: lineWidth(), result: r }); }
    return r;
  }

  function summary(r) {
    if (!r) return '';
    const t = r.thresholds, parts = [];
    if (r.reasons.includes('thin')) parts.push('dünne Wände (unter ' + de(t.warn, 1) + ' mm' + (r.minThick !== null ? ', dünnste ≈ ' + de(r.minThick, 1) + ' mm' : '') + ')');
    if (r.reasons.includes('z')) parts.push('schwach in Z bei ' + de(r.zWorst.z, 1) + ' mm Höhe (schmaler Querschnitt, ' + de(r.zWorst.above, 0) + ' mm Material darüber)');
    const head = { ok: 'Stabil', warn: 'Schwache Stellen', critical: 'Kritisch' }[r.level];
    return head + (parts.length ? ': ' + parts.join('; ') + '.' : ' – keine dünnen Wände unter ' + de(t.warn, 1) + ' mm, keine schlanken Stellen in Z.') +
      ' Nur Hinweis, die Druckeinstellungen bleiben unverändert.';
  }

  function render() {
    const on = mode === 'stability';
    document.querySelectorAll('#viewMode [data-view]').forEach(b => {
      const act = b.dataset.view === mode;
      b.classList.toggle('active', act); b.setAttribute('aria-pressed', String(act));
    });
    $('ohOverhang').classList.toggle('hidden', on);
    $('ohStability').classList.toggle('hidden', !on);
  }

  // Färbt die 3D-Ansicht im gewählten Modus. Große Teile brauchen einige Sekunden → erst Hinweis zeigen.
  function paint(g) {
    render();
    if (mode !== 'stability' || !g) { Viewer.colorize(+$('thresh').value); return; }
    const r = cached(g);
    if (r) { Viewer.colorizeClasses(r.cls); $('stabInfo').textContent = summary(r); return; }
    $('stabInfo').textContent = 'Stabilität wird berechnet …';
    const ticket = ++pending;
    setTimeout(() => {
      if (ticket !== pending || g !== geom || mode !== 'stability') return;   // inzwischen anderes Teil/Modus
      try {
        const res = resultFor(g);
        Viewer.colorizeClasses(res.cls);
        $('stabInfo').textContent = summary(res);
      } catch (e) {
        $('stabInfo').textContent = 'Stabilität konnte nicht berechnet werden: ' + e.message;
        Viewer.colorize(+$('thresh').value);
      }
    }, 30);
  }

  function setMode(m) { mode = m; paint(geom); }

  $('viewMode').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setMode(b.dataset.view); });
  $('nozD').addEventListener('change', () => { if (mode === 'stability') paint(geom); });

  return { paint, setMode, mode: () => mode, resultFor, cached, summary };
})();
