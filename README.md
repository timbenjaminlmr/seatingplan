# Sitzplaner

Sitzpläne im Browser erstellen: Tische, Pult und Tafel verschieben, Personen mit festen IDs anlegen, Wünsche priorisieren und Gruppenregeln berücksichtigen. Raum, Personen, Wünsche, Regeln und Sitzverteilung werden zusammen in **einer Projektdatei** gespeichert.

Die Website ist statisch. Sie benötigt keine Datenbank, API-Schlüssel oder zusätzlichen npm-Pakete. Die Berechnung läuft im Browser in einem Web Worker.

## Auf GitHub ablegen

1. Erstelle ein Repository, zum Beispiel `sitzplaner`.
2. Übernimm den **Inhalt dieses Ordners** in das Repository, einschließlich der Dateien mit Punkt am Anfang. Lade die ZIP-Datei nicht als einzelne Datei hoch.
3. `index.html`, `package.json`, `vercel.json` und der Ordner `scripts` müssen gemeinsam auf der obersten Ebene liegen.

Du kannst dafür GitHub Desktop oder Git verwenden. Wenn du Git im Terminal verwendest, öffne diesen Ordner und führe zunächst aus:

```sh
git init -b main
git add .
git commit -m "Sitzplaner für Vercel vorbereiten"
```

Verbinde den Ordner danach mit deinem GitHub-Repository. Die Repository-Adresse hängt von deinem GitHub-Namen und Repository ab; sie ist daher nicht im Code hinterlegt.

## Mit Vercel veröffentlichen

1. In Vercel ein neues Projekt anlegen und das GitHub-Repository importieren.
2. Als **Root Directory** den Repository-Hauptordner verwenden. Falls du die App in einen Unterordner gelegt hast, diesen auswählen.
3. **Deploy** wählen. Die Datei `vercel.json` setzt die folgenden Werte:

| Einstellung | Wert |
| --- | --- |
| Framework Preset | Other |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | leer; es werden keine Pakete benötigt |
| Node.js | 22.x, über `package.json` festgelegt |
| Environment Variables | keine erforderlich |

Der Build veröffentlicht ausschließlich `index.html`, `style.css` und `app.js`. Die übrigen Repository-Dateien werden nicht als Website ausgeliefert. `dist` wird automatisch erzeugt und muss nicht eingecheckt werden.

Die Konfiguration verwendet die [offiziellen Vercel-Einstellungen](https://vercel.com/docs/project-configuration/vercel-json). Bei einer bestehenden Vercel-Verbindung werden spätere Git-Pushes entsprechend deiner gewählten Deployment-Einstellungen veröffentlicht.

## Lokal bearbeiten und prüfen

Zum direkten Öffnen genügt `index.html` im Browser. Für eine lokale Website und die Build-Prüfung brauchst du Node.js 22.x mit npm. Eine Paketinstallation ist nicht erforderlich.

```sh
npm run dev
```

Danach `http://127.0.0.1:4173` öffnen. Der lokale Server liefert nur die drei App-Dateien aus. Änderungen an diesen Dateien werden nach erneutem Laden sichtbar.

Den gleichen Build wie auf Vercel ausführen:

```sh
npm run build
npm run preview
```

`npm run check` prüft die JavaScript-Syntax. Der Build kopiert die drei App-Dateien in `dist/`. Falls du später neue öffentliche Assets hinzufügst, ergänze sie in `scripts/build.mjs` und für die lokale Vorschau in `scripts/serve.mjs`.

## Projektdateien und Wünsche

- Beim Start **Neuen Sitzplan erstellen** oder **Projekt öffnen** wählen.
- Namen und IDs, Raum, Blickrichtungen, Nachbarschaften, Platznotizen, Wünsche und Regeln bleiben gemeinsam in einer JSON-Projektdatei.
- Unter **Schüler & Wünsche** können Wunschzettel einmalig aus einer TXT-Datei importiert werden. Danach ist keine zweite Datei mehr nötig.
- Ein direkter Nachbar, eine Ecke und eine diagonale Verbindung werden für Wünsche und Trennregeln gleich behandelt. Die Verbindungen lassen sich im Plan prüfen und manuell ändern.
- **Projekt speichern** schreibt nach Schreibfreigabe in unterstützten Browsern direkt in die ausgewählte Datei. Nach dem erneuten Öffnen lässt sich die Schreibfreigabe über denselben Button wieder aktivieren.
- Ohne diese Browserfunktion wird die aktuelle Projektdatei heruntergeladen. Nach weiteren Änderungen erneut speichern und die aktuelle Datei behalten.
- **Kopie speichern** lädt eine zusätzliche Kopie herunter. Der lokale Browserentwurf ersetzt keine aufbewahrte Projektdatei.

Die App überträgt importierte Klassendaten nicht an einen Server. JSON-Dateien sind lesbar und kein Passwortschutz. Der in der App angebotene Schülerprompt kann kopiert werden; wenn du Namen selbst in einen externen KI-Dienst einfügst, gibst du sie diesem Dienst weiter.

## Private Daten aufbewahren

Private Klassenprojekte und Wunschzettel außerhalb des Repositorys oder unter `private/` ablegen. `.gitignore` ignoriert JSON- und TXT-Dateien sowie `private/`, `data/` und `exports/`; die notwendigen JSON-Konfigurationen sind ausdrücklich ausgenommen. Das Paket enthält keine Schülerliste und keine Wunschabgaben.

Die Ignore-Regeln gelten für neue Dateien. Dateien, die du bereits in Git eingecheckt hast, bleiben in Git, bis du sie daraus entfernst. Beim Upload über die GitHub-Website die Dateien bewusst auswählen; die Website wendet deine lokale `.gitignore` nicht als Upload-Filter an.

## Dateien

```text
index.html          Oberfläche
style.css           Gestaltung
app.js              Editor, Import, Dateiverwaltung und Berechnung
vercel.json         Hosting-Konfiguration
package.json        Lokale Befehle und Node-Version
.gitignore          Lokale/private Dateien aus Git ausschließen
.vercelignore       Lokale/private Dateien aus CLI-Uploads ausschließen
.gitattributes      Einheitliche Textdateien und Zeilenenden
scripts/build.mjs   Prüfen und öffentliche Dateien nach dist kopieren
scripts/serve.mjs   Lokaler Server für Entwicklung und Vorschau
```

Es ist keine Datenbank eingerichtet und keine Website automatisch veröffentlicht. Du bestimmst das GitHub-Repository und verbindest es mit deinem Vercel-Projekt.
