# Druck-Konfigurator für OrcaSlicer

Startwerte berechnen und direkt als **OrcaSlicer-Projekt (3MF)** speichern – mit Überhang-Analyse, Lage-Vorschlag, Einstellungen je Teil und Umstellung von Makerworld-Projekten auf den eigenen Drucker. Läuft mit **rund 990 Druckern aus den OrcaSlicer-Profilen**; für den **Anycubic Kobra S1 (Combo)** und den **Snapmaker U1** liegen eigene, getestete Vorlagen bei.

![Übersicht](docs/img/uebersicht.png)

## Was es kann

- **Rund 990 Drucker:** dieselbe Liste wie in OrcaSlicer – Geschwindigkeiten und Beschleunigung werden auf das Profil des gewählten Druckers begrenzt
- **Eigener Drucker:** nicht in der Liste? Leeres Orca-Projekt mit deinem Drucker speichern und einlesen – Schritt-für-Schritt-Anleitung im Tool
- **Modell laden:** STL (auch mit mehreren Körpern), mehrere Dateien, 3MF, Makerworld-ZIP
- **Lage auf dem Bett:** schlägt die Seite vor, die am wenigsten Stützen braucht – Stützen auf dem Teil zählen stärker, weil sie schwer abgehen
- **Datenblatt:** Temperaturen, Schichthöhe, Geschwindigkeiten, Wände, Füllung, Stützen, Brim – je nach Filament, Objektart, Priorität und Belastung
- **Mehrere Teile:** eigenes Filament, eigene Werte und eigener Slot je Teil
- **Bohrlöcher verstärken:** erkannte Löcher per Häkchen mit einem 100-%-Füllung-Ring versehen (Orca-Modifikator)
- **3MF für OrcaSlicer:** Werte, Stützen und Slots landen direkt im Projekt
- **Makerworld-3MF umstellen:** Bambu-Einstellungen raus, eigenes Druckerprofil rein, Platten und Farben bleiben
- **Filament-Belegung** einmal eintragen – oder mit Rinkhals/Moonraker live vom Drucker lesen (braucht Python, nur lesend)
- Läuft komplett lokal im Browser, ohne Installation und ohne Cloud

## Schnellstart

**Online ausprobieren:** https://wolfb63-del.github.io/druck-konfigurator/ – läuft direkt im Browser, auch auf Mac, Linux und Tablet (ohne Live-Abfrage vom Drucker).

**Oder herunterladen:**

1. **Code → Download ZIP**, entpacken.
2. Doppelklick auf **`index.html`** – keine Installation nötig.
3. Drucker wählen, Modell ins Fenster ziehen, **Export → 3MF für OrcaSlicer**.

Ausführlich: **[Handbuch](HANDBUCH.md)** (auch als [PDF](docs/Handbuch.pdf)).

## Voraussetzungen

- Windows, macOS oder Linux mit aktuellem Browser (Chrome, Edge, Firefox, Safari) – getestet ist Windows mit Chrome; auf Mac und Linux sollte es genauso laufen, Rückmeldungen willkommen
- OrcaSlicer (Vorlagen erstellt mit 2.4.2)
- Nur für die Live-Belegung: Python 3.8+ und ein Drucker mit Klipper/Moonraker – bei Werksfirmware nicht der Fall, siehe [Haftungsausschluss](#haftungsausschluss) und Handbuch. Start dann unter Windows über `Konfigurator starten.cmd`, unter Mac/Linux im Terminal mit `python3 tools/serve.py` und im Browser `http://127.0.0.1:8765` öffnen. In der Online-Version geht die Live-Abfrage nicht (der Browser blockiert Anfragen von einer https-Seite an den Drucker im Heimnetz).

## Hinweise

- Alle Werte sind **Startwerte ohne Gewähr**. Getestet am Kobra S1 mit PLA High Speed und TPU; die U1-Werte sind noch nicht am U1 gegengetestet.
- Der 3MF-Export nutzt die Orca-Vorlagen in `templates/` (0,4-mm-Düse). Eigene Vorlagen: in Orca ein leeres Projekt mit deinem Drucker speichern, nach `templates/<drucker>_0.4.3mf` legen und `node tools/build-orca-templates.js` ausführen.

## Für Entwickler

Reines HTML/CSS/JavaScript ohne Build-Schritt (`<script src>`, funktioniert auch über `file://`). Tests mit Node:

```
node tests/compare-v4.js      # gleiche Ergebnisse wie v4
node tests/import.js          # Import (STL/ZIP/3MF)
node tests/orient.js          # Lage-Bewertung
node tests/export-project.js  # Makerworld-Umstellung, Lochverstärkung in 3MF-Projekten
node tests/holes.js           # Bohrloch-Erkennung
node tests/filament-db.js    # Filament-Liste: Zuordnung Material → Typ, Datenbank gegen Quelle (Stichproben)
node tests/purge.js           # Reinigungslinie: Seite, Platzbedarf, G-Code (Sollwerte aus der Konstruktion)
node tests/fragility.js       # Fragilität (Wandstärke, Z-Schwäche); FRAG3MF=<3mf> optional
node tests/ui-neu.js          # Ansichten, Hell/Dunkel: Bereichsprüfung, Kontraste hell und dunkel, Schriftgrößen, Schritt-Leiste
node tests/i18n.js            # Sprachwahl: Wörterbuch vollständig, Orca-Begriffe wörtlich, Übersetzer hin und zurück
node tests/i18n-ui.js         # Sprachwahl: Satzvorlagen der Oberfläche, keine doppelten globalen Namen
node tests/i18n-muster.js     # Sprachwahl: alle Texte des Rechenkerns übersetzt (≈ 15 s)
node tests/verify-3mf.js      # Export gegen die OrcaSlicer-CLI (dauert einige Minuten)
node tests/verify-orca-printers.js  # 3MF für beliebige Drucker gegen die OrcaSlicer-CLI (dauert lang)
node tests/verify-custom-printer.js # eigenes, hochgeladenes Orca-Profil gegen die OrcaSlicer-CLI
```

Der Bedientest `tests/ui-smoke.js` läuft im Browser (Anleitung im Kopf der Datei). Handbuch-PDF neu erzeugen: `node tools/build-handbuch.js`. Druckerliste neu erzeugen, wenn eine neue OrcaSlicer-Version installiert ist: `node tools/build-orca-printers.js`.

## Haftungsausschluss

Die Nutzung erfolgt auf eigene Verantwortung. Der Druck-Konfigurator ist ein privates, nicht kommerzielles Projekt und wird ohne jede Gewährleistung bereitgestellt.

1. **Keine Gewähr für die Werte.** Alle berechneten Einstellungen sind Startwerte. Filamente unterscheiden sich je nach Hersteller und Charge; die Angaben auf der Rolle, die Vorschau im Slicer und ein Testdruck haben immer Vorrang.
2. **Keine Haftung für Schäden an Drucker und Zubehör.** Für Schäden an Düse, Druckplatte (z. B. PETG auf glatter PEI-Platte ohne Trennmittel), Hotend oder anderen Teilen, für Verstopfungen, Fehldrucke oder verbrauchtes Material wird keine Haftung übernommen.
3. **Keine zugesicherte Eignung der gedruckten Teile.** Ob ein Teil für eine sicherheitskritische oder tragende Anwendung, für den Kontakt mit Lebensmitteln oder als Kinderspielzeug geeignet ist, beurteilt allein der Nutzer. Auch die Bohrloch-Verstärkung ersetzt keine Festigkeitsprüfung.
4. **Gesundheit und Sicherheit.** Beim Drucken – besonders mit ABS und ASA – entstehen Dämpfe und ultrafeine Partikel: Raum gut lüften, nicht in Wohn- oder Schlafräumen drucken. 3D-Drucker nicht unbeaufsichtigt betreiben.
5. **Drucker-Verbindung.** Die optionale Live-Abfrage liest über Moonraker nur die Filament-Belegung und sendet keine Steuerbefehle. Moonraker läuft nicht mit der Werksfirmware, sondern erfordert eine Fremd-Firmware (z. B. Rinkhals oder die Extended Firmware von paxx12) – deren Installation und Nutzung liegt vollständig in der Verantwortung des Nutzers.
6. **Marken.** Dieses Projekt steht in keiner Verbindung zu Anycubic, Snapmaker, Bambu Lab, Makerworld oder OrcaSlicer. Produkt- und Markennamen werden nur zur Beschreibung verwendet und gehören ihren Inhabern.
7. **Fremde Modelle.** Wer Projekte anderer (z. B. von Makerworld) mit dem Tool umstellt, ist selbst für die Einhaltung ihrer Lizenz verantwortlich – etwa „nicht kommerziell“ oder „keine Weitergabe“.

## Änderungen und Lizenz

- Versionen und Änderungen: [CHANGELOG.md](CHANGELOG.md)
- Lizenz: [CC BY-NC 4.0](LICENSE) – nutzen, ändern und weitergeben erlaubt, **nicht kommerziell**, mit Namensnennung.
- Mitgelieferte Bibliotheken (three.js, fflate) stehen unter MIT-Lizenz, siehe [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
