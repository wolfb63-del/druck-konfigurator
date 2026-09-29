# Offene Vorschläge (Stand 2026-09-26)

Gesammelt beim Bedientest. Nichts davon ist umgesetzt – Entscheidung liegt beim Nutzer.

## Wichtig (betrifft Richtigkeit)
1. ~~Sichttest in OrcaSlicer~~ – erledigt 2026-09-26: Werte gingen zunächst verloren (fehlende Änderungsliste), nach Fix vom Nutzer bestätigt (4 Wände, PETG).
2. ~~Slicer-Namen~~ – umgesetzt 2026-09-26: alle Anleitungen nennen OrcaSlicer.
3. ~~Nicht exportierte Empfehlungen~~ – Lüfter erste Schicht, Rückzug, Z-Hop umgesetzt 2026-09-26 (5.3.0) und Beschleunigung (5.4.0) – alle Datenblatt-Werte sind jetzt in der 3MF.
4. **Brim-Spannen:** Aus „5–8 mm“ wird 5 mm (untere Grenze), aus „0–5 mm bei Haftungsproblemen“ (Reifen) wird „kein Brim“. Ggf. im Export-Dialog wählbar machen.
19. **Loch-Verstärkung bei 3MF-Wiederimport:** Öffnet man eine schon exportierte 3MF erneut (z. B. um Drucker/Slot zu wechseln), fehlt „Bohrlöcher verstärken“ komplett – `build3mfFromProject` (js/export3mf.js) patcht nur die bestehende Datei und kann keine neuen Modifikator-Teile einfügen. Workaround: Original-STL neu laden statt die 3MF. Echter Fix würde `build3mfFromProject` um XML-Einfügung (kollisionssichere IDs, neue Objekte + Komponenten-Referenzen) erweitern – User-Entscheidung 2026-09-28: erstmal zurückgestellt.

## Komfort
5. ~~3MF-Dateien öffnen~~ – umgesetzt 2026-09-26 (STL mit mehreren Körpern, mehrere Dateien, ZIP, 3MF; Makerworld-3MF wird auf S1/U1 umgestellt).
6. ~~Slot-Belegung live vom Drucker~~ – umgesetzt 2026-09-26 (Moonraker, Start über „Konfigurator starten.cmd“).
7. **Weitere Düsen** (0,6 / 0,8 mm): je Drucker eine Orca-Vorlage speichern, `node tools/build-orca-templates.js` – dann ist der 3MF-Export auch dort frei.
8. Lange Slot-Namen im Export-Dialog werden abgeschnitten → vollständigen Namen als Tooltip.
9. Deine alten v4-Profile: Das neue Tool nutzt denselben Speicherschlüssel; sie erscheinen, wenn es wie v4 per Doppelklick (file://) geöffnet wird. Sicherer Weg: in v4 „Exportieren“, im neuen Tool „Profile importieren“.

## Neu aus der Live-Anbindung
12. Der Kobra S1 antwortet sehr unterschiedlich schnell (gemessen 0,2–15 s, einmal gar nicht). Ursache unbestätigt (WLAN? Drucker ausgelastet?). Tool wartet 8 s mit einem zweiten Versuch.
13. ~~Vorlagenwerte statt Exportwerte in Orca~~ – behoben (different_settings_to_system + passende System-Presets).

## Idee 2026-09-27 – umgesetzt, dann wieder verworfen (2026-09-28)
15. **Text auf ein Teil gravieren:** am 27.09. umgesetzt (Fläche anklicken, Text/Größe/Tiefe, Orca-"Negative Part"), inkl. Vorschau in der 3D-Ansicht und Flächenprüfung (Text darf nicht über Kanten/Krümmung hinausragen). Am 28.09. auf Nutzerwunsch wieder komplett entfernt ("das mit der Text funktion war eine blöde idee") – nicht wegen der Technik, sondern weil die Funktion insgesamt nicht gebraucht wurde. War nie committet, also auch nicht über die Git-Historie wiederherstellbar – bei erneutem Wunsch müsste sie neu gebaut werden (Ansatz: opentype.js + earcut für Text-zu-Netz, Orca "negative_part", Flächenprüfung per Breitensuche über koplanare Dreiecke – siehe diese Zeilen als Gedächtnisstütze).

## Geplant 2026-09-26 (nach Import/Ausrichtung/Stützwerte/Werte je Teil/Makerworld-3MF)
14. **Bohrlöcher verstärken:** zylindrische Löcher erkennen, in der 3MF je Loch einen Orca-Modifikator (Zylinder, Loch + 2 × ~3 mm) mit 100 % Füllung und ggf. mehr Wänden. Offen: automatisch oder nur als Vorschlag.

## Bekannte Grenzen (aus den Prüfungen 2026-09-26)
15. Überhang-/Innenflächen-Erkennung setzt richtig orientierte Dreiecke voraus; bei kaputten Netzen (Normalen verdreht) kann ein echter Überhang übersehen werden.
16. Zwei getrennte Flächen desselben Teils auf exakt gleicher Höhe (±0,05 mm) gelten als Innenfläche.
17. Schichthöhe gilt in Orca für die ganze Platte – weichen Teile ab, nennt der Export-Dialog das als Hinweis.
18. Makerworld-3MF: Lage des Designers bleibt, Drehen im Tool ist dort gesperrt.

## Bereits geplant (Plan-Schritte 3 und 4)
10. ~~Ausrichtung im Tool~~ – umgesetzt 2026-09-26 (Vorschlag, Fläche anklicken, 90°-Tasten).
11. Testdruck-Protokoll pro Drucker/Profil – dafür sind die U1-Werte der wichtigste Kandidat (bisher nirgends gegengetestet).
