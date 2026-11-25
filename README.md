# Seatingplan

Ein Sitzplaner für Schulklassen, der vollständig im Browser arbeitet. Gestalte deinen Klassenraum, erfasse Sitzwünsche und lege Regeln fest. Anschließend berechnet die App eine passende Sitzverteilung.

Alle Angaben bleiben zusammen in einer Projektdatei – vom ersten Raumlayout bis zum fertigen Sitzplan.

## Funktionen

- **Raumeditor:** Raumgröße mit Reglern und direkter Vorschau einstellen, Tische, Pult und Tafel frei platzieren sowie Tischgrößen, Blickrichtungen, hintere Plätze und Platznotizen festlegen.
- **Mehrfachauswahl:** Unter „Raum & Tische“ einschalten und mehrere Tische gemeinsam verschieben, drehen oder als hintere Plätze markieren.
- **Schülerverwaltung:** Namen anlegen und bearbeiten. Feste IDs sorgen dafür, dass Wünsche auch beim Umbenennen zugeordnet bleiben.
- **Priorisierte Wünsche:** Pro Person bis zu fünf Ja- und fünf Nein-Wünsche erfassen. Rang 1 hat die höchste Priorität; ein Nein kann als absolute Vorgabe markiert werden.
- **Gruppenregeln:** Beliebige Gruppen von Personen voneinander trennen oder von hinteren Plätzen ausschließen.
- **Bearbeitbare Nachbarschaften:** Verbindungen automatisch erkennen und manuell korrigieren. Direkte Nachbarn, Ecken und Diagonalen werden für Wünsche und Trennregeln gleich behandelt; gegenüberliegende Plätze zählen nicht automatisch dazu.
- **Wunschzettel-Import:** Abgaben über Personen-IDs aus einer TXT-Datei übernehmen. Die importierten Wünsche werden anschließend Teil der Projektdatei.
- **Konfliktanzeige:** Feste Regelverletzungen erscheinen rot, Nein-Konflikte orange.
- **Projektverwaltung:** Pläne speichern, wieder öffnen, als Kopie exportieren, Änderungen rückgängig machen und eine gespeicherte Standardanordnung wiederherstellen.
- **Druckansicht:** Den aktuellen Sitzplan aus dem Browser drucken.

## Einen Sitzplan erstellen

1. **Neuen Sitzplan erstellen** wählen oder eine vorhandene Projektdatei öffnen.
2. Unter **Raum & Tische** den Raum einrichten und Tische, Pult und Tafel platzieren.
3. Unter **Schüler & Wünsche** Namen hinzufügen und Wünsche eintragen oder importieren.
4. Nachbarschaften prüfen und bei Bedarf unter **Regeln** feste Vorgaben ergänzen.
5. **Berechnen** wählen, das Ergebnis prüfen und die Projektdatei speichern.

Personen lassen sich anschließend auch manuell zuweisen oder durch Anklicken zweier Tische tauschen.

## Speichern und weiterarbeiten

Eine JSON-Projektdatei enthält den gesamten Plan:

- Namen und Personen-IDs
- Raum, Tische, Pult und Tafel
- Blickrichtungen, hintere Plätze und Platznotizen
- Nachbarschaften, Wünsche und Regeln
- Sitzverteilung und gespeicherte Standardanordnung

In unterstützten Browsern kann **Projekt speichern** nach einer Schreibfreigabe dieselbe Datei automatisch aktualisieren. Nach dem erneuten Öffnen wird die Schreibfreigabe über diesen Button wieder aktiviert.

In anderen Browsern wird die aktuelle Projektdatei heruntergeladen. Nach weiteren Änderungen muss sie erneut gespeichert werden. **Kopie speichern** erstellt eine zusätzliche Download-Datei.

Ein Browserentwurf wird zusätzlich lokal gespeichert und kann beim nächsten Besuch wiederhergestellt werden. Für das Weiterarbeiten auf einem anderen Gerät oder als Sicherung sollte die Projektdatei aufbewahrt werden.

## Lokal starten

Die Oberfläche lässt sich direkt über `index.html` öffnen. Für den lokalen Entwicklungsserver und den Build wird **Node.js 22.x mit npm** benötigt. Zusätzliche npm-Pakete müssen nicht installiert werden.

Im Projektordner ausführen:

```sh
npm run dev
```

Die App ist anschließend unter **http://127.0.0.1:4173** erreichbar. Änderungen an HTML, CSS und JavaScript werden nach erneutem Laden der Seite sichtbar.

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Lokalen Entwicklungsserver starten |
| `npm run check` | JavaScript-Syntax prüfen |
| `npm run build` | Öffentliche Website-Dateien in `dist/` erzeugen |
| `npm run preview` | Den zuvor erzeugten Build lokal anzeigen |

## Deployment mit Vercel

Die App wird als statische Website bereitgestellt. Das Repository kann in Vercel importiert werden; als Projektverzeichnis dient der Ordner mit `vercel.json` und `package.json`.

Die Konfiguration ist bereits enthalten:

| Einstellung | Wert |
| --- | --- |
| Framework Preset | Other |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | Leer; keine Paketinstallation erforderlich |
| Node.js | 22.x |
| Umgebungsvariablen | Keine erforderlich |

Der Build veröffentlicht ausschließlich `index.html`, `style.css` und `app.js`. Der Ordner `dist/` wird automatisch erzeugt und nicht in Git eingecheckt.

## Datenhaltung

Namen, Wünsche, Regeln und Sitzverteilungen werden lokal im Browser verarbeitet. Die App benötigt kein Konto und keine Datenbank und lädt diese Klassendaten nicht auf einen Server hoch.

Projektdateien sind lesbare JSON-Dateien und nicht verschlüsselt. Klassenprojekte und Wunschzettel gehören außerhalb des öffentlichen Repositorys aufbewahrt. Die beiliegende `.gitignore` schließt neue private JSON- und TXT-Dateien aus; bereits eingecheckte Dateien bleiben davon unberührt.

## Berechnung

Feste Regeln und absolute Nein-Wünsche sind verbindliche Vorgaben. Die übrigen Wünsche werden nach ihrer Priorität gewichtet. Für größere Klassen sucht die App heuristisch nach einer guten zulässigen Lösung; ein globales Optimum ist nicht garantiert.

Die Berechnung läuft in einem Web Worker. Bei widersprüchlichen Vorgaben oder zu wenigen geeigneten Plätzen kann keine zulässige Sitzverteilung entstehen.

## Projektstruktur

```text
├── index.html          Oberfläche
├── style.css           Gestaltung
├── app.js              Raumeditor, Wünsche, Dateiverwaltung und Berechnung
├── package.json        Entwicklungs- und Build-Befehle
├── vercel.json         Hosting-Konfiguration
└── scripts/
    ├── build.mjs       Öffentliche Dateien nach dist/ kopieren
    └── serve.mjs       Lokaler Entwicklungs- und Vorschau-Server
```

Die Anwendung verwendet HTML, CSS und JavaScript ohne externe Laufzeitbibliotheken.
