'use strict';

// Der Rechenkern ist absichtlich ohne Bibliotheken und ohne Netzwerkzugriff.
function createEngine() {
  function validate(p, allowIncomplete = false) {
    const fail = text => { throw new Error(text); };
    if (!p || ![2, 3].includes(p.version) || !Array.isArray(p.students) || !Array.isArray(p.seats) || !Array.isArray(p.neighbours) || !Array.isArray(p.rules)) fail('Ungültige Sitzplan-Datei.');
    if (p.students.length > 60 || p.seats.length > 60 || (!allowIncomplete && (!p.students.length || p.seats.length < p.students.length))) fail('Es werden 1–60 Personen und mindestens genauso viele Tische benötigt.');
    const students = new Set(p.students.map(s => s.id)), seats = new Set(p.seats.map(s => s.id));
    if (students.size !== p.students.length || seats.size !== p.seats.length) fail('IDs müssen eindeutig sein.');
    for (const s of p.students) {
      if (!s || typeof s.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(s.id) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80) fail('Ungültiger Name oder Personen-ID.');
      if (!Array.isArray(s.yes) || !Array.isArray(s.no) || s.yes.length > 5 || s.no.length > 5) fail('Höchstens fünf Jas und fünf Neins pro Person.');
      const wishes = [...s.yes, ...s.no.map(w => w.id)];
      if (new Set(wishes).size !== wishes.length || wishes.some(id => !students.has(id) || id === s.id)) fail(s.name + ': doppelte, eigene oder unbekannte Wünsche.');
      if (s.no.some(w => !w || typeof w !== 'object' || typeof w.absolute !== 'boolean')) fail('Ein Nein benötigt Person und Kennzeichnung „absolut“.');
    }
    for (const s of p.seats) {
      if (!s || typeof s.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(s.id) || typeof s.label !== 'string' || !Number.isFinite(s.x) || !Number.isFinite(s.y) || s.x < 0 || s.x + (s.width || 100) > (p.room?.width || 1000) + .01 || s.y < 0 || s.y + (s.height || 64) > (p.room?.height || 780) + .01 || typeof s.back !== 'boolean' || !['down', 'left', 'right', 'up'].includes(s.direction)) fail('Ungültiger Tisch.');
    }
    const pairs = new Set();
    for (const pair of p.neighbours) {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(id => seats.has(id)) || pair[0] === pair[1]) fail('Ungültige Nachbarschaft.');
      const key = JSON.stringify([...pair].sort());
      if (pairs.has(key)) fail('Doppelte Nachbarschaft.');
      pairs.add(key);
    }
    if (p.neighbours.length > 1770 || p.rules.length > 500) fail('Zu viele Verbindungen oder Regeln.');
    const ruleIds = new Set();
    for (const r of p.rules) {
      if (typeof r.id !== 'string' || !r.id || ruleIds.has(r.id) || !['separate', 'not_back'].includes(r.kind) || !Array.isArray(r.students) || !r.students.length || new Set(r.students).size !== r.students.length || r.students.some(id => !students.has(id))) fail('Ungültige Gruppenregel.');
      if (r.kind === 'separate' && r.students.length < 2) fail('Zum Trennen mindestens zwei Personen auswählen.');
      ruleIds.add(r.id);
    }
    if (!p.assignment || typeof p.assignment !== 'object' || Array.isArray(p.assignment)) fail('Sitzverteilung fehlt.');
    const entries = Object.entries(p.assignment);
    if (entries.some(([a, b]) => !students.has(a) || !seats.has(b)) || new Set(entries.map(e => e[1])).size !== entries.length) fail('Ungültige oder doppelte Sitzverteilung.');
    return p;
  }
  function prepare(p, allowIncomplete = false) {
    validate(p, allowIncomplete);
    const n = p.students.length, m = p.seats.length;
    const si = new Map(p.students.map((s, i) => [s.id, i])), ti = new Map(p.seats.map((s, i) => [s.id, i]));
    const near = Array.from({ length: m }, () => new Uint8Array(m));
    for (const [a, b] of p.neighbours) near[ti.get(a)][ti.get(b)] = near[ti.get(b)][ti.get(a)] = 1;
    const forbidden = Array.from({ length: n }, () => new Uint8Array(n));
    const notBack = new Uint8Array(n);
    for (const r of p.rules) {
      const group = r.students.map(id => si.get(id));
      if (r.kind === 'not_back') group.forEach(i => notBack[i] = 1);
      else for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) forbidden[group[a]][group[b]] = forbidden[group[b]][group[a]] = 1;
    }
    const yes = p.students.map(s => s.yes.map((id, i) => [si.get(id), 5 - i]));
    const no = p.students.map((s, a) => s.no.map((w, i) => {
      const b = si.get(w.id);
      if (w.absolute) forbidden[a][b] = forbidden[b][a] = 1;
      return [b, 5 - i, w.absolute];
    }));
    const hard = forbidden.map(row => Array.from(row.keys()).filter(i => row[i]));
    const allowed = p.students.map((_, i) => p.seats.map((s, j) => j).filter(j => !notBack[i] || !p.seats[j].back));
    const maxYes = yes.flat().reduce((sum, w) => sum + w[1], 0);
    return { p, n, m, near, notBack, hard, allowed, yes, no, maxYes, noWeight: maxYes * (n + 1) + n + 1 };
  }
  function positions(c, assignment) { return c.p.students.map(s => c.p.seats.findIndex(t => t.id === assignment[s.id])); }
  function assignment(c, pos) { return Object.fromEntries(c.p.students.map((s, i) => [s.id, c.p.seats[pos[i]].id])); }
  function valid(c, pos, changed) {
    for (const a of changed || Array.from({ length: c.n }, (_, i) => i)) {
      if (pos[a] < 0 || pos[a] >= c.m || (c.notBack[a] && c.p.seats[pos[a]].back)) return false;
      for (const b of c.hard[a]) if (pos[b] >= 0 && c.near[pos[a]][pos[b]]) return false;
    }
    return true;
  }
  function score(c, pos) {
    let yes = 0, no = 0, coverage = 0, yesCount = 0, noCount = 0;
    for (let a = 0; a < c.n; a++) {
      let fulfilled = false;
      if (pos[a] < 0) continue;
      for (const [b, w] of c.yes[a]) if (pos[b] >= 0 && c.near[pos[a]][pos[b]]) { yes += w; yesCount++; fulfilled = true; }
      for (const [b, w, absolute] of c.no[a]) if (!absolute && pos[b] >= 0 && c.near[pos[a]][pos[b]]) { no += w; noCount++; }
      if (fulfilled) coverage++;
    }
    return { value: -no * c.noWeight + yes * (c.n + 1) + coverage, yes, no, coverage, yesCount, noCount };
  }
  function evaluate(p, map) {
    const c = prepare(p, true), pos = positions(c, map), warnings = [], hardStudents = new Set(), softStudents = new Set();
    const hardWarning = (text, ids) => { warnings.push(text); ids.forEach(id => hardStudents.add(id)); };
    if (!p.students.length) warnings.push('Füge zuerst Personen hinzu.');
    if (p.seats.length < p.students.length) warnings.push('Es fehlen Tische.');
    if (pos.some(i => i < 0)) warnings.push('Nicht jede Person hat einen Platz.');
    if (new Set(pos.filter(i => i >= 0)).size !== pos.filter(i => i >= 0).length) warnings.push('Ein Tisch ist doppelt belegt.');
    for (const r of p.rules) {
      const group = r.students.map(id => p.students.findIndex(s => s.id === id));
      if (r.kind === 'not_back') {
        for (const a of group) if (pos[a] >= 0 && p.seats[pos[a]].back) hardWarning(p.students[a].name + ': sitzt hinten.', [p.students[a].id]);
      } else {
        for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) if (pos[group[a]] >= 0 && pos[group[b]] >= 0 && c.near[pos[group[a]]][pos[group[b]]]) hardWarning(p.students[group[a]].name + ' und ' + p.students[group[b]].name + ': Gruppenregel verletzt.', [p.students[group[a]].id, p.students[group[b]].id]);
      }
    }
    const people = p.students.map((s, a) => {
      const yes = [], no = [];
      if (pos[a] >= 0) {
        c.yes[a].forEach(([b, w], i) => { if (pos[b] >= 0 && c.near[pos[a]][pos[b]]) yes.push({ name: p.students[b].name, rank: i + 1 }); });
        c.no[a].forEach(([b, w, absolute], i) => {
          if (pos[b] >= 0 && c.near[pos[a]][pos[b]]) {
            no.push({ name: p.students[b].name, rank: i + 1, absolute });
            if (absolute) hardWarning(s.name + ': absolutes Nein zu ' + p.students[b].name + ' verletzt.', [s.id, p.students[b].id]);
            else { softStudents.add(s.id); softStudents.add(p.students[b].id); }
          }
        });
      }
      return { id: s.id, name: s.name, yes, no };
    });
    hardStudents.forEach(id => softStudents.delete(id));
    return { ...score(c, pos), noCount: people.reduce((sum, p) => sum + p.no.length, 0), maxYes: c.maxYes, valid: !warnings.length, warnings, people, hardStudents: [...hardStudents], softStudents: [...softStudents] };
  }
  function solve(p, milliseconds = 8000, emit = () => { }, seed = Date.now()) {
    const c = prepare(p), start = performance.now(), end = start + milliseconds;
    let randomState = seed >>> 0;
    const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
    const shuffle = list => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1));[list[i], list[j]] = [list[j], list[i]]; } return list; };
    let best = null, bestScore = -Infinity, steps = 0, nodes = 0, expired = false;
    const remember = pos => { const s = score(c, pos); if (s.value > bestScore) { best = pos.slice(); bestScore = s.value; return true; } return false; };
    const current = positions(c, p.assignment);
    if (current.every(i => i >= 0) && new Set(current).size === c.n && valid(c, current)) remember(current);
    const finish = (status, message) => ({ status, message, assignment: best ? assignment(c, best) : null, report: best ? evaluate(p, assignment(c, best)) : null, steps, nodes });
    if (c.allowed.some(list => !list.length)) return finish('INFEASIBLE', 'Für eine Person ist kein erlaubter Platz vorhanden.');
    const notBackCount = Array.from(c.notBack).reduce((sum, v) => sum + v, 0), notBackSeats = p.seats.filter(t => !t.back).length;
    if (notBackCount > notBackSeats) return finish('INFEASIBLE', notBackCount + ' Schüler dürfen nicht hinten sitzen, aber es gibt nur ' + notBackSeats + ' passende Plätze.');
    // Eine Aufteilung der Tische in benachbarte Paare gibt eine sichere obere
    // Grenze für die Zahl untereinander getrennter Plätze (je Paar höchstens einer).
    for (const rule of p.rules.filter(r => r.kind === 'separate')) {
      const available = new Set(rule.students.flatMap(id => c.allowed[p.students.findIndex(s => s.id === id)]));
      let upperBound = 0;
      while (available.size) { const a = available.values().next().value; available.delete(a); const b = [...available].find(b => c.near[a][b]); if (b !== undefined) available.delete(b); upperBound++; }
      if (rule.students.length > upperBound) return finish('INFEASIBLE', 'Die Gruppe mit ' + rule.students.length + ' Schülern benötigt mehr getrennte Plätze, als der Raumplan zulässt (höchstens ' + upperBound + ').');
    }
    // Erst einen gültigen Plan finden: Variablen mit wenigen Möglichkeiten zuerst.
    // Bei kleinen Klassen werden alle Möglichkeiten geprüft, sonst zeitlich begrenzt.
    const exact = c.n <= 8;
    const searchEnd = exact ? end : Math.min(end, start + Math.max(500, milliseconds * .30));
    if (!best || exact) {
      const pos = Array(c.n).fill(-1), used = new Uint8Array(c.m);
      function visit(depth) {
        if ((++nodes & 127) === 0 && performance.now() > searchEnd) { expired = true; return false; }
        if (depth === c.n) { remember(pos); return !exact; }
        let variable = -1, candidates = null;
        for (let a = 0; a < c.n; a++) if (pos[a] < 0) {
          const available = c.allowed[a].filter(t => !used[t] && !c.hard[a].some(b => pos[b] >= 0 && c.near[t][pos[b]]));
          if (!available.length) return false;
          if (candidates === null || available.length < candidates.length || (available.length === candidates.length && c.hard[a].length > c.hard[variable].length)) { variable = a; candidates = available; }
        }
        shuffle(candidates);
        if (current[variable] >= 0 && candidates.includes(current[variable])) candidates = [current[variable], ...candidates.filter(t => t !== current[variable])];
        for (const t of candidates) { pos[variable] = t; used[t] = 1; if (visit(depth + 1)) { used[t] = 0; pos[variable] = -1; return true; } used[t] = 0; pos[variable] = -1; if (expired) return false; }
        return false;
      }
      visit(0);
      if (exact && !expired) return best ? finish('OPTIMAL', 'Optimal für die eingetragenen Prioritäten.') : finish('INFEASIBLE', 'Diese Regeln und absoluten Neins sind nicht gleichzeitig erfüllbar.');
      if (!best) return expired ? finish('UNKNOWN', 'Noch kein gültiger Plan gefunden. Länger suchen oder die Regeln prüfen.') : finish('INFEASIBLE', 'Diese Regeln und absoluten Neins sind nicht gleichzeitig erfüllbar.');
    }
    emit(finish('FEASIBLE', 'Gültiger Plan gefunden.'));
    if (!c.yes.some(a => a.length) && !c.no.some(a => a.some(w => !w[2]))) return finish('FEASIBLE', 'Gültiger Plan; keine gewichteten Wünsche eingetragen.');
    // Verbessernde und gelegentlich verschlechternde Tausche verhindern frühes Festlaufen.
    // Es werden ausschließlich Pläne akzeptiert, die alle festen Regeln erfüllen.
    let pos = best.slice(), value = bestScore, lastEmit = performance.now();
    const occupied = new Set(pos), empty = Array.from({ length: c.m }, (_, i) => i).filter(i => !occupied.has(i));
    while (performance.now() < end) {
      const a = Math.floor(random() * c.n), b = Math.floor(random() * c.n);
      if (a === b) continue;
      const oldA = pos[a], oldB = pos[b];
      let changed = [a, b], third = -1, oldThird = -1, emptyIndex = -1;
      if (empty.length && random() < .12) { emptyIndex = Math.floor(random() * empty.length); pos[a] = empty[emptyIndex]; changed = [a]; }
      else if (c.n > 2 && random() < .22) { third = Math.floor(random() * c.n); if (third === a || third === b) continue; oldThird = pos[third]; pos[a] = oldB; pos[b] = oldThird; pos[third] = oldA; changed.push(third); }
      else { pos[a] = oldB; pos[b] = oldA; }
      steps++;
      let accept = false;
      if (valid(c, pos, changed)) {
        const next = score(c, pos).value, delta = next - value;
        const progress = (performance.now() - start) / Math.max(1, milliseconds), cycle = (progress * 7) % 1;
        const temperature = Math.max(.12, Math.pow(1 - cycle, 3) * Math.max(c.n + 1, c.noWeight * .18));
        accept = delta >= 0 || random() < Math.exp(delta / temperature);
        if (accept) { value = next; remember(pos); }
      }
      if (accept) { if (emptyIndex >= 0) empty[emptyIndex] = oldA; }
      else { pos[a] = oldA; pos[b] = oldB; if (third >= 0) pos[third] = oldThird; }
      const now = performance.now();
      if (now - lastEmit > 350) { emit(finish('FEASIBLE', 'Suche läuft …')); lastEmit = now; }
      if (steps % 6000 === 0) { pos = best.slice(); value = bestScore; const taken = new Set(pos); empty.splice(0, empty.length, ...Array.from({ length: c.m }, (_, i) => i).filter(i => !taken.has(i))); }
    }
    const answer = finish('FEASIBLE', 'Bester gefundener gültiger Plan; kein Optimalitätsbeweis.');
    if (answer.assignment && !answer.report.valid) throw new Error('Die unabhängige Prüfung hat einen ungültigen Plan entdeckt.');
    return answer;
  }
  return { validate, prepare, evaluate, solve };
}
const Engine = createEngine();

// Zeilenweiser Wunschzettel-Import. Validiert vollständig, bevor Daten geändert werden.

const Ballots = (() => {
  class ImportError extends Error {
    constructor(details) { super('Import abgebrochen. Es wurden keine Wünsche geändert.'); this.details = details; }
  }
  function decodeBase64(code) {
    if (!code || !/^[A-Za-z0-9+/]*={0,2}$/.test(code) || code.length % 4 !== 0) throw new Error('Ungültiges Base64.');
    const binary = atob(code);
    if (btoa(binary) !== code) throw new Error('Ungültiges Base64.');
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
  }
  function strictJSON(text) {
    let data;
    try { data = JSON.parse(text); } catch (_) { throw new Error('Ungültiges JSON. Pro Zeile muss ein vollständiger Zettel stehen.'); }
    // JSON.parse allein erkennt doppelte Feldnamen nicht; auch diese werden abgewiesen.
    const keys = new Set(); let depth = 0;
    for (let i = 0; i < text.length;) {
      const ch = text[i];
      if (ch === '"') {
        const start = i++;
        while (i < text.length) { if (text[i] === '\\') { i += 2; continue; } if (text[i++] === '"') break; }
        if (depth === 1 && /^\s*:/.test(text.slice(i))) { const key = JSON.parse(text.slice(start, i)); if (keys.has(key)) throw new Error('Doppeltes JSON-Feld „' + key + '“.'); keys.add(key); }
      } else { if (ch === '{' || ch === '[') depth++; if (ch === '}' || ch === ']') depth--; i++; }
    }
    return data;
  }
  function validate(data, ids, round) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Ein JSON-Objekt wird erwartet.');
    const fields = ['v', 'round', 'student', 'yes', 'no'], keys = Object.keys(data);
    if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) throw new Error('Erlaubte Felder: v, round, student, yes, no.');
    if (data.v !== 1) throw new Error('Unbekannte Zettelversion; erwartet wird v: 1.');
    if (data.round !== round) throw new Error('Falsche Abfragerunde; erwartet wird ' + round + '.');
    if (typeof data.student !== 'string' || !ids.has(data.student)) throw new Error('Unbekannte Schüler-ID „' + String(data.student) + '“.');
    const seen = new Set(), wishes = { student: data.student, yes: [], no: [] };
    for (const kind of ['yes', 'no']) {
      const entries = data[kind];
      if (!Array.isArray(entries) || entries.length !== 5) throw new Error(data.student + ': ' + kind + ' muss genau fünf Ränge enthalten (leer = "-").');
      let empty = false;
      for (let i = 0; i < entries.length; i++) {
        const value = entries[i];
        if (typeof value !== 'string') throw new Error(data.student + ': ' + kind + ' Rang ' + (i + 1) + ' muss eine ID oder "-" enthalten.');
        if (value === '-') { empty = true; continue; }
        if (empty) throw new Error(data.student + ': leere Ränge dürfen nur am Ende stehen.');
        const absolute = kind === 'no' && value.endsWith('!'), id = absolute ? value.slice(0, -1) : value;
        if (!ids.has(id)) throw new Error(data.student + ': unbekannte oder ungültige Wunsch-ID „' + value + '“.');
        if (id === data.student) throw new Error(data.student + ': ein eigener Sitzwunsch ist nicht erlaubt.');
        if (seen.has(id)) throw new Error(data.student + ': ' + id + ' kommt mehrfach oder bei Ja und Nein vor.');
        seen.add(id);
        if (kind === 'yes') wishes.yes.push(id); else wishes.no.push({ id, absolute });
      }
    }
    return wishes;
  }
  function parse(text, students, round = 'KLASSE29-R1') {
    if (typeof text !== 'string' || text.length > 1000000) throw new ImportError(['Die Datei darf höchstens 1 MB Text enthalten.']);
    text = text.trim();
    if (text.startsWith('SITZLISTE1:')) { try { text = decodeBase64(text.slice(11)); } catch (error) { throw new ImportError(['Sammelblock: ' + error.message]); } }
    const ids = new Set(students.map(s => s.id)), lines = text.split(/\r\n|\n|\r/), records = [], errors = [], firstLine = new Map();
    lines.forEach((raw, index) => {
      const line = raw.trim(), number = index + 1; if (!line) return;
      try {
        if (line.length > 8192) throw new Error('Zettel ist zu lang.');
        const json = line.startsWith('SITZ1:') ? decodeBase64(line.slice(6)) : line;
        const record = validate(strictJSON(json), ids, round);
        if (firstLine.has(record.student)) throw new Error(record.student + ' wurde bereits in Zeile ' + firstLine.get(record.student) + ' abgegeben.');
        firstLine.set(record.student, number); records.push({ ...record, line: number });
      } catch (error) { errors.push('Zeile ' + number + ': ' + error.message); }
    });
    if (!records.length && !errors.length) errors.push('Die Datei enthält keine Wunschzettel.');
    if (errors.length) throw new ImportError(errors);
    return records;
  }
  function merge(project, records) {
    const next = JSON.parse(JSON.stringify(project)), byId = new Map(records.map(r => [r.student, r]));
    for (const student of next.students) { const r = byId.get(student.id); if (r) { student.yes = [...r.yes]; student.no = r.no.map(w => ({ ...w })); } }
    return next;
  }
  return { parse, merge };
})();


// Eine Projektdatei enthält den gesamten bearbeitbaren Zustand; kein Server ist nötig.
const ProjectFile = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const unique = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  function room(value) {
    const r = clone(value || { width: 1000, height: 780 });
    if (!number(r.width, 600, 2400) || !number(r.height, 400, 2000)) fail('Der Raum muss 600–2400 breit und 400–2000 hoch sein.');
    for (const [kind, label, width, height] of [['desk', 'Pult', 240, 64], ['board', 'Tafel', 320, 28]]) {
      const old = r[kind];
      r[kind] = { label, x: (r.width - width) / 2, y: r.height - height - (kind === 'desk' ? 100 : 16), width, height, enabled: false, ...old };
      const item = r[kind];
      if (old && old.enabled === undefined) item.enabled = true;
      if (kind === 'board' && old?.bottom !== undefined && old.y === undefined) item.y = r.height - old.bottom - item.height;
      delete item.bottom;
      if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 40 || typeof item.enabled !== 'boolean' || !number(item.width, 20, r.width) || !number(item.height, 16, r.height) || !number(item.x, 0, r.width - item.width + .01) || !number(item.y, 0, r.height - item.height + .01)) fail('Pult oder Tafel liegt außerhalb des Raums oder hat ungültige Maße.');
    }
    return r;
  }
  function snapshot(p) {
    return clone({ seats: p.seats, neighbours: p.neighbours, assignment: p.assignment, room: p.room, neighbourMode: p.neighbourMode });
  }
  function normalize(value, legacyDefault) {
    if (!value || ![2, 3].includes(value.version)) fail('Das ist keine Projektdatei. Öffne eine Sitzplan-Projektdatei (.json). Wunschzettel werden in einem geöffneten Projekt importiert.');
    const p = clone(value);
    p.version = 3;
    p.id = typeof p.id === 'string' ? p.id.slice(0, 100) : unique();
    p.name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 80) : 'Mein Sitzplan';
    p.ballotRound = p.ballotRound || 'KLASSE29-R1';
    if (typeof p.ballotRound !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(p.ballotRound)) fail('Die Wunschzettel-Runde darf nur Buchstaben, Ziffern, Bindestriche und Unterstriche enthalten.');
    p.room = room(p.room || { width: 1000, height: 780, desk: { label: 'Pult', x: 350, y: 670.8, width: 300, height: 54.6 }, board: { label: 'Tafel', x: 320, bottom: 7.8, width: 360 } });
    p.neighbourMode = p.neighbourMode === 'auto' ? 'auto' : 'manual';
    if (!Array.isArray(p.seats)) fail('Die Tische fehlen in der Projektdatei.');
    for (const seat of p.seats) {
      if (!seat || !number(seat.width ?? 100, 40, 300) || !number(seat.height ?? 64, 32, 240) || typeof (seat.note ?? '') !== 'string' || (seat.note || '').length > 500) fail('Ungültige Tischgröße oder Platznotiz.');
      seat.width ??= 100; seat.height ??= 64; seat.note ??= '';
    }
    Engine.validate(p, true);
    const ids = (list, prefix) => Math.max(0, ...list.map(item => new RegExp('^' + prefix + '(\\d+)$').exec(item.id)).filter(Boolean).map(match => Number(match[1])));
    p.counters = { student: Math.max(ids(p.students, 's'), Number.isSafeInteger(p.counters?.student) ? p.counters.student : 0), seat: Math.max(ids(p.seats, 't'), Number.isSafeInteger(p.counters?.seat) ? p.counters.seat : 0) };
    const d = clone(p.defaultLayout || legacyDefault || snapshot(p));
    d.room = room(d.room || p.room);
    if (!Array.isArray(d.seats) || d.seats.length !== p.seats.length || !d.seats.every(s => p.seats.some(t => t.id === s.id))) fail('Der Standardplan passt nicht zu den Tischen.');
    Engine.validate({ ...p, seats: d.seats, neighbours: d.neighbours, assignment: d.assignment, room: d.room }, true);
    p.defaultLayout = { seats: d.seats, neighbours: d.neighbours, assignment: d.assignment, room: d.room, neighbourMode: d.neighbourMode || p.neighbourMode };
    return p;
  }
  function create(name, width = 1000, height = 780) {
    const id = unique();
    return normalize({ version: 3, id, name, ballotRound: 'PLAN-' + id.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) + '-R1', room: { width, height }, students: [], seats: [], neighbours: [], rules: [], assignment: {}, neighbourMode: 'auto' });
  }
  function restore(p) { return normalize({ ...p, ...clone(p.defaultLayout) }); }
  function serialize(p) { return JSON.stringify(normalize(p), null, 2); }
  return { clone, room, normalize, create, restore, serialize, snapshot };
})();

const Model = (() => {
  const clone = ProjectFile.clone;
  function remember(p) { p.defaultLayout = ProjectFile.snapshot(p); }
  function detectNeighbours(p) {
    const pairs = [];
    for (let i = 0; i < p.seats.length; i++) for (let j = i + 1; j < p.seats.length; j++) {
      const a = p.seats[i], b = p.seats[j], aw = a.width || 100, ah = a.height || 64, bw = b.width || 100, bh = b.height || 64;
      const dx = Math.abs(a.x + aw / 2 - b.x - bw / 2), dy = Math.abs(a.y + ah / 2 - b.y - bh / 2);
      const gx = Math.max(0, a.x - b.x - bw, b.x - a.x - aw), gy = Math.max(0, a.y - b.y - bh, b.y - a.y - ah);
      const verticalA = ['down', 'up'].includes(a.direction), verticalB = ['down', 'up'].includes(b.direction);
      const side = verticalA && verticalB ? dx >= Math.min(aw, bw) * .5 && gx <= 20 && Math.hypot(gx, gy) <= 40 : !verticalA && !verticalB ? dy >= Math.min(ah, bh) * .5 && gy <= 40 && Math.hypot(gx, gy) <= 40 : Math.hypot(gx, gy) <= 40;
      if (side && !(dx < 1 && dy < 1)) pairs.push([a.id, b.id]);
    }
    p.neighbours = pairs;
  }
  function geometryChanged(p) { if (p.neighbourMode === 'auto') detectNeighbours(p); }
  function addStudents(p, text) {
    const names = text.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
    if (!names.length) throw new Error('Trage mindestens einen Namen ein, einen pro Zeile.');
    if (p.students.length + names.length > 60) throw new Error('Höchstens 60 Personen pro Projekt.');
    const known = new Set(p.students.map(s => s.name.toLocaleLowerCase('de')));
    for (const name of names) {
      if (name.length > 80 || known.has(name.toLocaleLowerCase('de'))) throw new Error('Namen müssen eindeutig und höchstens 80 Zeichen lang sein: ' + name);
      known.add(name.toLocaleLowerCase('de'));
    }
    for (const name of names) p.students.push({ id: 's' + String(++p.counters.student).padStart(2, '0'), name, yes: [], no: [] });
  }
  function removeStudent(p, id) {
    p.students = p.students.filter(s => s.id !== id);
    for (const s of p.students) { s.yes = s.yes.filter(w => w !== id); s.no = s.no.filter(w => w.id !== id); }
    p.rules = p.rules.map(r => ({ ...r, students: r.students.filter(s => s !== id) })).filter(r => r.students.length >= (r.kind === 'separate' ? 2 : 1));
    delete p.assignment[id]; delete p.defaultLayout.assignment[id];
  }
  function addSeats(p, count) {
    if (!Number.isInteger(count) || count < 1 || p.seats.length + count > 60) throw new Error('Es sind 1–60 Tische möglich.');
    for (let i = 0; i < count; i++) {
      const id = 't' + String(++p.counters.seat).padStart(2, '0');
      let spot = null;
      for (let y = 24; y + 64 <= p.room.height - 24 && !spot; y += 90) for (let x = 24; x + 100 <= p.room.width - 24; x += 120) {
        const items = [...p.seats, ...['desk', 'board'].map(k => p.room[k]).filter(o => o.enabled)];
        if (!items.some(s => x < s.x + (s.width || 100) + 8 && x + 108 > s.x && y < s.y + (s.height || 64) + 8 && y + 72 > s.y)) { spot = { x, y }; break; }
      }
      if (!spot) throw new Error('Hier passen keine weiteren Tische ohne Überlappung hinein. Vergrößere zuerst den Raum.');
      p.seats.push({ id, label: id.slice(1), ...spot, width: 100, height: 64, direction: 'down', back: false, note: '' });
    }
    geometryChanged(p); remember(p);
  }
  function removeSeat(p, id) {
    p.seats = p.seats.filter(s => s.id !== id); p.neighbours = p.neighbours.filter(pair => !pair.includes(id));
    p.assignment = Object.fromEntries(Object.entries(p.assignment).filter(([, seat]) => seat !== id)); remember(p);
  }
  function assign(p, studentId, seatId) {
    const previousStudent = Object.keys(p.assignment).find(id => p.assignment[id] === seatId), previousSeat = Object.prototype.hasOwnProperty.call(p.assignment, studentId) ? p.assignment[studentId] : undefined;
    if (previousStudent) delete p.assignment[previousStudent];
    if (!studentId) return;
    if (previousStudent && previousSeat && previousSeat !== seatId) p.assignment[previousStudent] = previousSeat;
    p.assignment[studentId] = seatId;
  }
  function updateSeats(p, ids, changes) {
    if (changes.direction !== undefined && !['down', 'left', 'up', 'right'].includes(changes.direction)) throw new Error('Ungültige Blickrichtung.');
    if (changes.back !== undefined && typeof changes.back !== 'boolean') throw new Error('Ungültige Kennzeichnung für hintere Plätze.');
    const chosen = new Set(ids);
    for (const item of p.seats) if (chosen.has(item.id)) {
      if (changes.direction !== undefined) item.direction = changes.direction;
      if (changes.back !== undefined) item.back = changes.back;
    }
    if (changes.direction !== undefined) geometryChanged(p);
  }
  function clampMove(p, items, dx, dy) {
    if (!items.length) return { dx: 0, dy: 0 };
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error('Ungültige Verschiebung.');
    return {
      dx: Math.max(-Math.min(...items.map(t => t.x)), Math.min(p.room.width - Math.max(...items.map(t => t.x + t.width)), Math.round(dx))),
      dy: Math.max(-Math.min(...items.map(t => t.y)), Math.min(p.room.height - Math.max(...items.map(t => t.y + t.height)), Math.round(dy)))
    };
  }
  function moveSeats(p, ids, dx, dy) {
    const chosen = new Set(ids), items = p.seats.filter(t => chosen.has(t.id));
    const delta = clampMove(p, items, dx, dy);
    for (const item of items) { item.x += delta.dx; item.y += delta.dy; }
    geometryChanged(p);
  }
  function rotateSeats(p, ids) {
    const chosen = new Set(ids), directions = ['down', 'left', 'up', 'right'];
    for (const item of p.seats) if (chosen.has(item.id)) item.direction = directions[(directions.indexOf(item.direction) + 1) % 4];
    geometryChanged(p);
  }
  function resize(p, width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Bitte gültige Raummaße eingeben.');
    const sx = width / p.room.width, sy = height / p.room.height;
    for (const s of [...p.seats, p.room.desk, p.room.board]) { s.x = Math.max(0, Math.min(width - (s.width || 100), s.x * sx)); s.y = Math.max(0, Math.min(height - (s.height || 64), s.y * sy)); }
    p.room.width = width; p.room.height = height; p.room = ProjectFile.room(p.room); geometryChanged(p); remember(p);
  }
  return { remember, detectNeighbours, geometryChanged, addStudents, removeStudent, addSeats, removeSeat, assign, updateSeats, clampMove, moveSeats, rotateSeats, resize };
})();

// Schreibvorgänge bleiben in Reihenfolge; schnelle Änderungen werden zusammengefasst.
class ProjectWriter {
  constructor(onState) { this.onState = onState; this.handle = null; this.pending = null; this.running = false; this.failed = false; this.waiters = []; }
  connect(handle) { if (this.running) throw new Error('Die Datei wird noch gespeichert.'); this.handle = handle; this.failed = false; }
  request(text, revision) { this.pending = { text, revision }; this.failed = false; this.drain(); }
  async drain() {
    if (this.running || !this.handle || !this.pending || this.failed) return;
    this.running = true;
    while (this.pending && !this.failed) {
      const item = this.pending; this.pending = null; this.onState('writing', item.revision);
      let stream;
      try { stream = await this.handle.createWritable(); await stream.write(item.text); await stream.close(); this.onState('saved', item.revision); }
      catch (error) { try { await stream?.abort(); } catch { } if (!this.pending) this.pending = item; this.failed = true; this.onState('error', item.revision, error); }
    }
    this.running = false; this.onState('idle'); this.waiters.splice(0).forEach(done => done());
  }
  async flush() { await this.drain(); if (this.running) await new Promise(resolve => this.waiters.push(resolve)); }
}

// UI
(() => {
  const $ = id => document.getElementById(id), clone = ProjectFile.clone;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cacheKey = 'sitzplaner.project.v3.' + location.pathname;
  let project = null, view = 'plan', mode = 'people', selected = null, selectedStudent = null, linkStart = null;
  let multiSelect = false, selectedSeats = new Set(), roomResizePreview = null;
  const newProjectTitle = $('room-dialog-title').textContent;
  let history = [], future = [], revision = 0, savedRevision = 0, fileHandle = null, autosave = false, fileName = '', saveTimer, noticeTimer, busy = false, worker = null, roomDialogMode = 'new', solverMessage = '';
  let idFloor = { student: 0, seat: 0 }, cache = null;
  try { cache = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { }
  const writer = new ProjectWriter((state, rev, error) => {
    if (state === 'saved') { savedRevision = rev; cacheProject(); }
    if (state === 'error') { autosave = false; notice('Die Datei konnte nicht gespeichert werden. Dein Browserentwurf bleibt erhalten. Bitte erneut speichern oder eine Kopie herunterladen.\n' + error.message, true, 12000); }
    renderSave(state);
  });
  const student = id => project.students.find(s => s.id === id);
  const seat = id => project.seats.find(s => s.id === id);
  const dirty = () => !!project && revision !== savedRevision;
  const selectedObject = () => selected?.kind === 'seat' ? seat(selected.id) : selected ? project.room[selected.kind] : null;
  function clearSelection() { selected = null; selectedSeats.clear(); }
  function roomMinimum(p) {
    return { width: Math.ceil(Math.max(600, p.room.desk.width, p.room.board.width)), height: Math.ceil(Math.max(400, p.room.desk.height, p.room.board.height)) };
  }
  function syncRoomControls() {
    const minimum = roomMinimum(project);
    for (const dimension of ['width', 'height']) {
      const input = $('plan-room-' + dimension);
      input.min = minimum[dimension]; input.value = project.room[dimension]; input.disabled = busy;
      $('plan-room-' + dimension + '-value').textContent = Math.round(project.room[dimension]);
    }
  }
  function syncRoomDialog() {
    const width = +$('room-width').value, height = +$('room-height').value;
    $('room-width-value').textContent = width; $('room-height-value').textContent = height;
    const scale = Math.min(220 / width, 112 / height);
    $('room-outline').style.width = width * scale + 'px'; $('room-outline').style.height = height * scale + 'px';
  }
  function previewRoomResize() {
    if (!project || busy) return;
    roomResizePreview ||= clone(project);
    const next = clone(roomResizePreview), original = project;
    try {
      Model.resize(next, +$('plan-room-width').value, +$('plan-room-height').value);
      // Nur die Darstellung ändert sich während des Ziehens. Ein Loslassen ergibt einen Undo-Schritt.
      project = next; renderPlan(true);
    } finally { project = original; }
  }
  function finishRoomResize() {
    if (!roomResizePreview) return;
    const width = +$('plan-room-width').value, height = +$('plan-room-height').value;
    roomResizePreview = null;
    if (width === project.room.width && height === project.room.height) { renderPlan(true); return; }
    if (!commit(p => Model.resize(p, width, height))) renderPlan();
  }
  function cancelRoomResize() { if (roomResizePreview) { roomResizePreview = null; renderPlan(true); } }
  function notice(message, error = false, duration = 6500) { $('notice').textContent = message; $('notice').classList.toggle('error', error); $('notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('notice').hidden = true, duration); }
  function safe(action) { try { return action(); } catch (error) { notice(error.message || 'Die Änderung konnte nicht übernommen werden.', true); } }
  function cacheProject() {
    if (!project) return;
    try { cache = { project: clone(project), dirty: dirty(), fileName }; localStorage.setItem(cacheKey, JSON.stringify(cache)); }
    catch { if (!cacheProject.warned) { notice('Der Browserentwurf konnte nicht gesichert werden. Speichere deine Projektdatei regelmäßig.', true); cacheProject.warned = true; } }
  }
  function renderSave(state) {
    $('project-heading').hidden = !project; $('save-project').hidden = !project; $('save-copy').hidden = !project;
    if (!project) return;
    $('project-name').textContent = project.name;
    let message = state === 'writing' ? 'Speichert …' : autosave ? dirty() ? 'Änderungen werden gespeichert …' : 'Automatisch gespeichert · ' + fileName : dirty() ? 'Projektdatei noch speichern' : fileName ? 'Projektdatei · ' + fileName : 'Browserentwurf';
    if (state === 'error') message = 'Speichern fehlgeschlagen';
    $('save-status').textContent = message; $('save-status').classList.toggle('dirty', dirty() || state === 'error');
    $('save-project').textContent = autosave ? 'Jetzt speichern' : 'Projekt speichern';
    $('save-project').disabled = busy; $('save-copy').disabled = busy;
    $('new-project').disabled = busy || writer.running; $('open-project').disabled = busy || writer.running;
  }
  function scheduleSave() {
    clearTimeout(saveTimer); cacheProject(); renderSave();
    if (autosave) saveTimer = setTimeout(() => { writer.request(ProjectFile.serialize(project), revision); }, 550);
  }
  function commit(change, message, refresh = true) {
    if (!project || busy) return;
    return safe(() => {
      const next = clone(project); change(next); next.updatedAt = new Date().toISOString();
      next.counters.student = Math.max(next.counters.student, idFloor.student); next.counters.seat = Math.max(next.counters.seat, idFloor.seat);
      const normalized = ProjectFile.normalize(next);
      history.push(clone(project)); if (history.length > 60) history.shift(); future = []; project = normalized;
      idFloor = { ...project.counters }; revision++; solverMessage = ''; scheduleSave(); if (refresh) render(); else { $('undo').disabled = false; $('redo').disabled = true; if (view === 'plan') renderPlan(true); if (view === 'students') renderStudents(true); } if (message) notice(message); return true;
    });
  }
  async function switchAllowed() {
    if (busy) return false;
    clearTimeout(saveTimer);
    if (autosave && dirty()) { writer.request(ProjectFile.serialize(project), revision); await writer.flush(); }
    if (dirty() && !confirm('Deine letzten Änderungen sind noch nicht in einer Projektdatei gespeichert. Trotzdem wechseln?')) return false;
    return true;
  }
  function adopt(p, handle = null, name = '', isDirty = false) {
    project = ProjectFile.normalize(p); history = []; future = []; clearSelection(); multiSelect = false; roomResizePreview = null; selectedStudent = project.students[0]?.id; linkStart = null;
    view = 'plan'; mode = project.seats.length ? 'people' : 'layout'; fileHandle = handle; fileName = name; autosave = false; writer.connect(null); writer.pending = null;
    revision = 1; savedRevision = isDirty ? 0 : 1; idFloor = { ...project.counters }; solverMessage = ''; cacheProject(); render();
  }
  function showRoomDialog(isNew) {
    roomDialogMode = isNew ? 'new' : 'edit';
    $('room-dialog-title').textContent = isNew ? newProjectTitle : 'Raum einstellen';
    const minimum = isNew ? { width: 600, height: 400 } : roomMinimum(project);
    $('room-width').min = minimum.width; $('room-height').min = minimum.height;
    $('room-name').value = isNew ? 'Meine Klasse' : project.name; $('room-width').value = isNew ? 1000 : project.room.width; $('room-height').value = isNew ? 780 : project.room.height;
    $('round-label').hidden = isNew; $('room-round').value = isNew ? '' : project.ballotRound;
    syncRoomDialog(); $('room-dialog').showModal();
  }
  function render() {
    $('welcome').hidden = !!project; $('workspace').hidden = !project; $('recover').hidden = !cache;
    renderSave(); if (!project) return;
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    ['plan', 'students', 'rules'].forEach(v => $('view-' + v).hidden = v !== view);
    $('undo').disabled = !history.length || busy; $('redo').disabled = !future.length || busy;
    if (view === 'plan') renderPlan(); if (view === 'students') renderStudents(); if (view === 'rules') renderRules();
  }
  const directions = { down: '↓', left: '←', right: '→', up: '↑' };
  function objectMarkup(item, kind, report) {
    const who = kind === 'seat' ? project.students.find(s => project.assignment[s.id] === item.id) : null;
    const classes = ['object', kind === 'seat' ? 'seat' : 'furniture ' + kind];
    const isSelected = mode === 'layout' && multiSelect && kind === 'seat' ? selectedSeats.has(item.id) : selected?.kind === kind && (kind !== 'seat' || selected.id === item.id);
    if (isSelected) classes.push('selected');
    if (kind === 'seat' && linkStart === item.id) classes.push('link-start');
    if (who && report.hardStudents.includes(who.id)) classes.push('hard'); else if (who && report.softStudents.includes(who.id)) classes.push('soft');
    const label = kind === 'seat' ? 'Tisch ' + item.label + (who ? ', ' + who.name : ', frei') + (item.back ? ', hinten' : '') + (item.note ? ', ' + item.note : '') : item.label;
    return `<button type="button" class="${classes.join(' ')}" data-object="${kind}" data-id="${esc(item.id || kind)}" aria-label="${esc(label)}" aria-pressed="${!!isSelected}" title="${esc(label)}" style="left:${item.x / project.room.width * 100}%;top:${item.y / project.room.height * 100}%;width:${item.width / project.room.width * 100}%;height:${item.height / project.room.height * 100}%">${kind === 'seat' ? `<span class="seat-meta"><span>${esc(item.label)}</span><span class="tag">${item.back ? 'H ' : ''}${item.note ? '! ' : ''}${directions[item.direction]}</span></span><span class="seat-name">${esc(who?.name || 'Frei')}</span>` : esc(item.label)}</button>`;
  }
  function renderPlan(keepEditor = false) {
    const report = Engine.evaluate(project, project.assignment);
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    selectedSeats = new Set([...selectedSeats].filter(id => seat(id)));
    $('layout-tools').hidden = mode !== 'layout'; $('link-tools').hidden = mode !== 'links';
    $('room-controls').hidden = mode !== 'layout'; $('selection-tools').hidden = mode !== 'layout' || !multiSelect;
    $('multi-select').setAttribute('aria-pressed', String(multiSelect));
    $('selection-count').textContent = selectedSeats.size ? selectedSeats.size + (selectedSeats.size === 1 ? ' Tisch ausgewählt' : ' Tische ausgewählt') : 'Tische anklicken, um sie auszuwählen.';
    $('clear-selection').disabled = !selectedSeats.size;
    $('select-all-tables').disabled = !project.seats.length;
    $('room').classList.toggle('multi-select', mode === 'layout' && multiSelect);
    syncRoomControls();
    $('room').classList.toggle('editing', mode === 'layout'); $('room').style.aspectRatio = `${project.room.width}/${project.room.height}`;
    const markup = project.seats.map(t => objectMarkup(t, 'seat', report)).join('') + ['desk', 'board'].filter(k => project.room[k].enabled).map(k => objectMarkup(project.room[k], k, report)).join('');
    if (!keepEditor) $('objects').innerHTML = markup;
    else {
      const temp = document.createElement('div'); temp.innerHTML = markup;
      for (const next of temp.children) {
        const previous = [...$('objects').children].find(el => el.dataset.object === next.dataset.object && el.dataset.id === next.dataset.id);
        if (previous) { for (const name of ['style', 'class', 'aria-label', 'aria-pressed', 'title']) previous.setAttribute(name, next.getAttribute(name)); previous.innerHTML = next.innerHTML; }
      }
    }
    $('empty-room').hidden = !!project.seats.length || project.room.desk.enabled || project.room.board.enabled;
    $('connections').setAttribute('viewBox', `0 0 ${project.room.width} ${project.room.height}`);
    $('connections').innerHTML = mode === 'links' ? project.neighbours.map(([a, b]) => { const x = seat(a), y = seat(b); return `<line x1="${x.x + x.width / 2}" y1="${x.y + x.height / 2}" x2="${y.x + y.width / 2}" y2="${y.y + y.height / 2}"/>`; }).join('') : '';
    $('link-hint').textContent = linkStart ? 'Jetzt den zweiten Tisch wählen. Erneutes Anklicken bricht ab.' : `${project.neighbours.length} Verbindungen · ${project.neighbourMode === 'auto' ? 'Automatische Erkennung' : 'Manuell festgelegt'}`;
    const assigned = Object.keys(project.assignment).length;
    $('plan-count').textContent = `${project.students.length} Personen · ${project.seats.length} Tische · ${project.students.length - assigned} ohne Platz`;
    $('calculate').disabled = busy || !project.students.length || project.seats.length < project.students.length;
    $('calculate').hidden = busy; $('stop').hidden = !busy;
    const summary = project.students.length ? `${report.yesCount} Wünsche erfüllt · ${report.coverage} von ${project.students.length} Personen mit Wunschpartner · ${report.noCount} Nein-Konflikte` : '';
    $('report').textContent = [solverMessage, summary, ...report.warnings.slice(0, 8), report.warnings.length > 8 ? 'Weitere Regelkonflikte sind im Plan rot markiert.' : ''].filter(Boolean).join('\n');
    if (!keepEditor) renderInspector();
  }
  function renderBulkInspector() {
    const items = project.seats.filter(t => selectedSeats.has(t.id));
    const direction = items.every(t => t.direction === items[0].direction) ? items[0].direction : '';
    const backCount = items.filter(t => t.back).length, ids = items.map(t => t.id);
    $('inspector').hidden = false; $('editor-grid').classList.add('has-inspector');
    $('inspector').innerHTML = `<h3><button id="close-inspector" class="close" aria-label="Auswahl schließen">×</button>${items.length} Tische</h3><label>Blickrichtung<select id="bulk-direction">${!direction ? '<option value="" selected disabled>Unterschiedlich</option>' : ''}${Object.entries(directions).map(([value, arrow]) => `<option value="${value}" ${direction === value ? 'selected' : ''}>${({ down: 'Nach unten', up: 'Nach oben', left: 'Nach links', right: 'Nach rechts' })[value]} ${arrow}</option>`).join('')}</select></label><label class="inline-check"><input type="checkbox" id="bulk-back" ${backCount === items.length ? 'checked' : ''}>Hintere Plätze</label><button id="delete-selected" class="danger">Tische entfernen</button><span class="muted">Gemeinsam ziehen oder mit Pfeiltasten verschieben. R dreht die Auswahl.</span>`;
    $('close-inspector').onclick = () => { clearSelection(); renderPlan(); };
    $('bulk-direction').onchange = event => commit(p => Model.updateSeats(p, ids, { direction: event.target.value }));
    $('bulk-back').indeterminate = backCount > 0 && backCount < items.length;
    $('bulk-back').onchange = event => commit(p => Model.updateSeats(p, ids, { back: event.target.checked }));
    $('delete-selected').onclick = () => commit(p => { ids.forEach(id => Model.removeSeat(p, id)); clearSelection(); });
  }
  function renderInspector() {
    if (mode === 'layout' && multiSelect && selectedSeats.size > 1) { renderBulkInspector(); return; }
    const o = selectedObject(); if (!o) selected = null;
    const show = !!o && mode !== 'links'; $('inspector').hidden = !show; $('editor-grid').classList.toggle('has-inspector', show); if (!show) return;
    const isSeat = selected.kind === 'seat';
    const who = isSeat ? project.students.find(s => project.assignment[s.id] === o.id)?.id || '' : '';
    $('inspector').innerHTML = `<h3><button id="close-inspector" class="close" aria-label="Auswahl schließen">×</button>${isSeat ? 'Tisch ' + esc(o.label) : esc(o.label)}</h3>` + (isSeat ? `<label>Person<select id="seat-person"><option value="">Frei</option>${project.students.map(s => `<option value="${esc(s.id)}" ${s.id === who ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : '') + (mode === 'layout' ? `<label>Bezeichnung<input id="object-label" maxlength="40" value="${esc(o.label)}"></label><div class="two-columns"><label>Breite<input id="object-width" type="number" min="${isSeat ? 40 : 20}" max="${isSeat ? 300 : project.room.width}" value="${o.width}"></label><label>Höhe<input id="object-height" type="number" min="${isSeat ? 32 : 16}" max="${isSeat ? 240 : project.room.height}" value="${o.height}"></label></div>${isSeat ? `<label>Blickrichtung<select id="seat-direction">${Object.entries(directions).map(([v, arrow]) => `<option value="${v}" ${o.direction === v ? 'selected' : ''}>${({ down: 'Nach unten', up: 'Nach oben', left: 'Nach links', right: 'Nach rechts' })[v]} ${arrow}</option>`).join('')}</select></label><label class="inline-check"><input type="checkbox" id="seat-back" ${o.back ? 'checked' : ''}>Hinterer Platz</label><label>Platznotiz<textarea id="seat-note" rows="2" maxlength="500" placeholder="z. B. eingeschränkte Sicht">${esc(o.note)}</textarea></label><p class="hint">Notizen markieren Problemstellen. Verbindliche Vorgaben legst du unter „Regeln“ fest.</p>` : ''}<button id="delete-object" class="danger">${isSeat ? 'Tisch' : esc(o.label)} entfernen</button><span class="muted">Ziehen oder Pfeiltasten zum Verschieben${isSeat ? ', R zum Drehen' : ''}.</span>` : `<p class="hint">Zwei Tische nacheinander anklicken, um Personen zu tauschen. Über die Liste kannst du auch unplatzierte Personen setzen.</p>`);
    $('close-inspector').onclick = () => { clearSelection(); renderPlan(); };
    if (isSeat) $('seat-person').onchange = event => commit(p => Model.assign(p, event.target.value, o.id));
    if (mode !== 'layout') return;
    $('object-label').onchange = event => commit(p => { const obj = isSeat ? p.seats.find(t => t.id === o.id) : p.room[selected.kind]; if (!event.target.value.trim()) throw new Error('Bitte eine Bezeichnung eingeben.'); obj.label = event.target.value.trim(); }, null, false);
    for (const dim of ['width', 'height']) $('object-' + dim).onchange = event => {
      if (!commit(p => { const obj = isSeat ? p.seats.find(t => t.id === o.id) : p.room[selected.kind]; obj[dim] = +event.target.value; obj.x = Math.max(0, Math.min(obj.x, p.room.width - obj.width)); obj.y = Math.max(0, Math.min(obj.y, p.room.height - obj.height)); Model.geometryChanged(p); }, null, false)) renderPlan();
    };
    if (isSeat) {
      $('seat-direction').onchange = event => commit(p => { p.seats.find(t => t.id === o.id).direction = event.target.value; Model.geometryChanged(p); });
      $('seat-back').onchange = event => commit(p => p.seats.find(t => t.id === o.id).back = event.target.checked);
      $('seat-note').onchange = event => commit(p => p.seats.find(t => t.id === o.id).note = event.target.value, null, false);
    }
    $('delete-object').onclick = () => commit(p => { if (isSeat) Model.removeSeat(p, o.id); else p.room[selected.kind].enabled = false; clearSelection(); });
  }
  function renderStudents(keepEditor = false) {
    if (!student(selectedStudent)) selectedStudent = project.students[0]?.id;
    $('student-count').textContent = project.students.length + ' Personen';
    $('student-list').innerHTML = project.students.map(s => `<button data-student="${esc(s.id)}" class="${s.id === selectedStudent ? 'active' : ''}"><span>${esc(s.name)}</span><small>${esc(s.id)}</small></button>`).join('');
    if (keepEditor) return;
    const s = student(selectedStudent);
    if (!s) { $('student-editor').innerHTML = '<p class="muted">Füge zuerst die Namen deiner Klasse hinzu.</p>'; return; }
    function wishes(kind) {
      const list = s[kind], used = new Set([s.id, ...s.yes, ...s.no.map(w => w.id)]);
      return `<div><h3>${kind === 'yes' ? 'Ja · Neben wem möchtest du sitzen?' : 'Nein · Neben wem ungern?'}</h3>${list.map((w, i) => `<div class="wish-row"><select class="rank" data-wish="${kind}" data-index="${i}" aria-label="Rang von ${esc(student(kind === 'yes' ? w : w.id).name)}">${list.map((_, rank) => `<option value="${rank}" ${rank === i ? 'selected' : ''}>${rank + 1}</option>`).join('')}</select><span class="wish-name">${esc(student(kind === 'yes' ? w : w.id).name)}</span>${kind === 'no' ? `<label><input type="checkbox" data-absolute="${i}" ${w.absolute ? 'checked' : ''}>Absolut</label>` : ''}<button class="remove-wish" data-remove-wish="${kind}" data-index="${i}" aria-label="Wunsch entfernen">×</button></div>`).join('')}${list.length < 5 ? `<select class="wish-add" data-add-wish="${kind}" aria-label="${kind === 'yes' ? 'Ja' : 'Nein'} hinzufügen"><option value="">Person hinzufügen …</option>${project.students.filter(t => !used.has(t.id)).map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select>` : '<p class="muted">Alle fünf Plätze belegt.</p>'}</div>`;
    }
    $('student-editor').innerHTML = `<div class="student-heading"><label>Name<input id="student-name" maxlength="80" value="${esc(s.name)}"></label><small>${esc(s.id)}</small><button id="delete-student" class="danger">Entfernen</button></div><div class="wish-columns">${wishes('yes')}${wishes('no')}</div>`;
    $('student-name').onchange = event => {
      if (!commit(p => { const name = event.target.value.trim(); if (!name || p.students.some(t => t.id !== s.id && t.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) throw new Error('Bitte einen eindeutigen Namen eingeben.'); p.students.find(t => t.id === s.id).name = name; }, null, false)) renderStudents();
    };
    $('delete-student').onclick = () => { if (confirm(s.name + ' entfernen? Die zugehörigen Wünsche und Regelzuordnungen werden ebenfalls entfernt.')) commit(p => Model.removeStudent(p, s.id)); };
    $('student-editor').querySelectorAll('[data-add-wish]').forEach(el => el.onchange = () => el.value && commit(p => p.students.find(t => t.id === s.id)[el.dataset.addWish].push(el.dataset.addWish === 'yes' ? el.value : { id: el.value, absolute: false })));
    $('student-editor').querySelectorAll('[data-remove-wish]').forEach(el => el.onclick = () => commit(p => p.students.find(t => t.id === s.id)[el.dataset.removeWish].splice(+el.dataset.index, 1)));
    $('student-editor').querySelectorAll('[data-wish]').forEach(el => el.onchange = () => commit(p => { const list = p.students.find(t => t.id === s.id)[el.dataset.wish]; list.splice(+el.value, 0, list.splice(+el.dataset.index, 1)[0]); }));
    $('student-editor').querySelectorAll('[data-absolute]').forEach(el => el.onchange = () => commit(p => p.students.find(t => t.id === s.id).no[+el.dataset.absolute].absolute = el.checked));
  }
  function renderRules() {
    $('rule-students').innerHTML = project.students.map(s => `<label><input type="checkbox" value="${esc(s.id)}" name="rule-person">${esc(s.name)}</label>`).join('');
    $('rule-list').innerHTML = project.rules.map(r => `<div class="rule-card"><div>${r.kind === 'separate' ? 'Nicht nebeneinander' : 'Nicht hinten'}<small>${r.students.map(id => esc(student(id).name)).join(', ')}</small></div><button data-delete-rule="${esc(r.id)}" class="danger">Entfernen</button></div>`).join('') || '<p class="muted">Noch keine festen Regeln.</p>';
  }
  function selectObject(kind, id) {
    if (busy) return;
    if (mode === 'links') {
      if (kind !== 'seat') return;
      if (!linkStart) { linkStart = id; renderPlan(); return; }
      const first = linkStart; linkStart = null;
      if (first === id) { renderPlan(); return; }
      commit(p => { const index = p.neighbours.findIndex(pair => pair.includes(first) && pair.includes(id)); if (index >= 0) p.neighbours.splice(index, 1); else p.neighbours.push([first, id]); p.neighbourMode = 'manual'; }); return;
    }
    if (mode === 'layout' && multiSelect && kind === 'seat') {
      if (selectedSeats.has(id)) selectedSeats.delete(id); else selectedSeats.add(id);
      selected = selectedSeats.size ? { kind: 'seat', id: [...selectedSeats].at(-1) } : null;
      renderPlan(); return;
    }
    if (mode === 'layout' && kind !== 'seat') selectedSeats.clear();
    if (mode === 'people' && kind === 'seat' && selected?.kind === 'seat' && selected.id !== id) {
      const previous = selected.id; selected = null;
      commit(p => { const a = Object.keys(p.assignment).find(s => p.assignment[s] === previous), b = Object.keys(p.assignment).find(s => p.assignment[s] === id); if (a) p.assignment[a] = id; if (b) p.assignment[b] = previous; }); return;
    }
    selected = selected?.kind === kind && selected.id === id ? null : { kind, id }; renderPlan();
  }
  let drag = null, suppressClick = false;
  const selectedFor = id => multiSelect && selectedSeats.has(id) ? [...selectedSeats] : [id];
  $('objects').addEventListener('pointerdown', event => {
    const el = event.target.closest('[data-object]'); if (!el || mode !== 'layout' || busy || event.button !== 0) return;
    const kind = el.dataset.object, id = el.dataset.id;
    const ids = kind === 'seat' ? selectedFor(id) : [id];
    const items = ids.map(itemId => clone(kind === 'seat' ? seat(itemId) : project.room[kind]));
    drag = { el, kind, id, ids, items, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, moved: false, rect: $('room').getBoundingClientRect() };
    el.setPointerCapture(event.pointerId);
  });
  $('objects').addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 3) drag.moved = true; if (!drag.moved) return;
    Object.assign(drag, Model.clampMove(project, drag.items, dx * project.room.width / drag.rect.width, dy * project.room.height / drag.rect.height));
    for (const item of drag.items) {
      const el = drag.kind === 'seat' ? $('objects').querySelector(`[data-object="seat"][data-id="${item.id}"]`) : drag.el;
      el.classList.add('dragging'); el.style.left = (item.x + drag.dx) / project.room.width * 100 + '%'; el.style.top = (item.y + drag.dy) / project.room.height * 100 + '%';
    }
  });
  function endDrag(cancelled) {
    if (!drag) return; const d = drag; drag = null;
    if (!d.moved) return;
    suppressClick = true; setTimeout(() => suppressClick = false, 0);
    if (cancelled) { renderPlan(); return; }
    selected = { kind: d.kind, id: d.id };
    if (d.kind === 'seat' && multiSelect) selectedSeats = new Set(d.ids);
    commit(p => {
      if (d.kind === 'seat') Model.moveSeats(p, d.ids, d.dx, d.dy);
      else { p.room[d.kind].x = d.items[0].x + d.dx; p.room[d.kind].y = d.items[0].y + d.dy; }
    });
  }
  $('objects').addEventListener('pointerup', () => endDrag(false)); $('objects').addEventListener('pointercancel', () => endDrag(true));
  $('objects').addEventListener('click', event => { if (suppressClick) return; const el = event.target.closest('[data-object]'); if (el) selectObject(el.dataset.object, el.dataset.id); });
  $('room').addEventListener('click', event => {
    if (suppressClick || busy || event.target.closest('[data-object]') || event.target.closest('button')) return;
    clearSelection(); linkStart = null; renderPlan();
  });
  $('objects').addEventListener('keydown', event => {
    const el = event.target.closest('[data-object]'); if (!el || mode !== 'layout' || busy || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'r', 'R'].includes(event.key)) return;
    event.preventDefault(); const kind = el.dataset.object, id = el.dataset.id, ids = kind === 'seat' ? selectedFor(id) : [id];
    if (kind === 'seat' && multiSelect) { selectedSeats = new Set(ids); selected = { kind, id }; }
    commit(p => {
      const step = event.shiftKey ? 20 : 5;
      if (event.key.toLowerCase() === 'r') { if (kind === 'seat') Model.rotateSeats(p, ids); }
      else {
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        if (kind === 'seat') Model.moveSeats(p, ids, dx, dy);
        else { const item = p.room[kind], delta = Model.clampMove(p, [item], dx, dy); item.x += delta.dx; item.y += delta.dy; }
      }
    });
    $('objects').querySelector(`[data-object="${kind}"][data-id="${id}"]`)?.focus();
  });
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { cancelRoomResize(); mode = b.dataset.mode; clearSelection(); multiSelect = false; linkStart = null; renderPlan(); });
  $('multi-select').onclick = () => {
    multiSelect = !multiSelect;
    if (multiSelect) selectedSeats = new Set(selected?.kind === 'seat' ? [selected.id] : []);
    else { const id = [...selectedSeats].at(-1); selectedSeats.clear(); selected = id ? { kind: 'seat', id } : null; }
    renderPlan();
  };
  $('select-all-tables').onclick = () => { selectedSeats = new Set(project.seats.map(t => t.id)); selected = project.seats.length ? { kind: 'seat', id: project.seats[0].id } : null; renderPlan(); };
  $('clear-selection').onclick = () => { clearSelection(); renderPlan(); };
  for (const dimension of ['width', 'height']) {
    $('room-' + dimension).oninput = syncRoomDialog;
    const input = $('plan-room-' + dimension);
    input.oninput = () => safe(previewRoomResize); input.onchange = finishRoomResize;
    input.onpointercancel = cancelRoomResize;
  }
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { if (busy) return; view = b.dataset.view; render(); });
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).close());
  $('new-project').onclick = $('start-new').onclick = async () => { if (await switchAllowed()) showRoomDialog(true); };
  $('room-tool').onclick = () => showRoomDialog(false);
  $('room-form').onsubmit = event => {
    event.preventDefault();
    if (roomDialogMode === 'new') { safe(() => { adopt(ProjectFile.create($('room-name').value, +$('room-width').value, +$('room-height').value), null, '', true); $('room-dialog').close(); }); }
    else if (commit(p => { p.name = $('room-name').value; p.ballotRound = $('room-round').value; Model.resize(p, +$('room-width').value, +$('room-height').value); })) $('room-dialog').close();
  };
  $('add-students').onclick = () => { $('names-text').value = ''; $('names-dialog').showModal(); };
  $('names-form').onsubmit = event => { event.preventDefault(); if (commit(p => Model.addStudents(p, $('names-text').value))) $('names-dialog').close(); };
  $('student-list').onclick = event => { const el = event.target.closest('[data-student]'); if (el) { selectedStudent = el.dataset.student; renderStudents(); } };
  $('rule-form').onsubmit = event => {
    event.preventDefault(); const ids = [...document.querySelectorAll('[name="rule-person"]:checked')].map(el => el.value);
    commit(p => p.rules.push({ id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), kind: $('rule-kind').value, students: ids }));
  };
  $('rule-list').onclick = event => { const el = event.target.closest('[data-delete-rule]'); if (el) commit(p => p.rules = p.rules.filter(r => r.id !== el.dataset.deleteRule)); };
  $('add-tables').onclick = () => commit(p => Model.addSeats(p, +$('table-count').value));
  $('empty-add').onclick = () => { mode = 'layout'; renderPlan(); $('table-count').focus(); };
  for (const kind of ['desk', 'board']) $(kind + '-tool').onclick = () => {
    selectedSeats.clear(); selected = { kind, id: kind };
    if (!project.room[kind].enabled) commit(p => p.room[kind].enabled = true); else renderPlan();
  };
  $('detect-links').onclick = () => { linkStart = null; commit(p => { Model.detectNeighbours(p); p.neighbourMode = 'auto'; }, 'Nachbarn anhand von Abstand und Blickrichtung erkannt. Prüfe die gestrichelten Verbindungen und korrigiere sie bei Bedarf durch Anklicken.'); };
  $('remember-layout').onclick = () => commit(p => Model.remember(p), 'Diese Anordnung ist jetzt der Standard.');
  $('reset-layout').onclick = () => { if (confirm('Die gespeicherte Standardanordnung wiederherstellen? Wünsche und Regeln bleiben erhalten.')) commit(p => Object.assign(p, ProjectFile.restore(p))); };
  function travel(from, to) {
    if (!from.length || busy) return; const next = from.pop(); to.push(clone(project)); next.counters = { student: Math.max(next.counters.student, idFloor.student), seat: Math.max(next.counters.seat, idFloor.seat) }; project = ProjectFile.normalize(next); clearSelection(); roomResizePreview = null; revision++; solverMessage = ''; scheduleSave(); render();
  }
  $('undo').onclick = () => travel(history, future); $('redo').onclick = () => travel(future, history);
  $('print-plan').onclick = () => { clearSelection(); renderPlan(); window.print(); };
  $('recover').onclick = () => safe(() => { const draft = ProjectFile.normalize(cache.project); adopt(draft, null, '', true); notice('Browserentwurf wiederhergestellt. Speichere ihn als Projektdatei.'); });
  $('home').onclick = async event => { event.preventDefault(); if (await switchAllowed()) { project = null; writer.connect(null); fileHandle = null; autosave = false; render(); } };

  function importWishes(text) {
    if (!project) { notice('Diese Datei enthält nur Wunschzettel. Erstelle oder öffne zuerst ein Projekt mit den dazugehörigen Personen-IDs.', true); return; }
    try {
      const records = Ballots.parse(text, project.students, project.ballotRound);
      if (commit(p => Object.assign(p, Ballots.merge(p, records)))) { view = 'students'; render(); notice(`${records.length} Wunschzettel übernommen. Sie sind jetzt Teil dieses Projekts. Bereits vorhandene Wünsche dieser Personen wurden ersetzt.`, false, 9000); }
    } catch (error) { notice('Keine Wünsche übernommen.\n' + (error.details || [error.message]).slice(0, 5).join('\n'), true, 14000); }
  }
  async function readFile(file) { if (file.size > 2 * 1024 * 1024) throw new Error('Die Datei ist zu groß. Erlaubt sind bis zu 2 MB.'); return file.text(); }
  async function openFile(file, handle = null) {
    const text = await readFile(file), trimmed = text.trim(); let data, defaults;
    if (trimmed.startsWith('<')) {
      const doc = new DOMParser().parseFromString(text, 'text/html'), node = doc.getElementById('initial-data');
      if (!node) throw new Error('Diese HTML-Datei enthält kein Sitzplan-Projekt. Öffne eine Projektdatei (.json).');
      data = JSON.parse(node.textContent); const d = doc.getElementById('default-layout'); if (d) defaults = JSON.parse(d.textContent);
    } else {
      try { data = JSON.parse(text); } catch { data = null; }
      if (!data || data.v === 1 || /^SITZ(?:1|LISTE1):/.test(trimmed)) { importWishes(text); return; }
    }
    const normalized = ProjectFile.normalize(data, defaults);
    if (!(await switchAllowed())) return;
    adopt(normalized, handle, file.name, data.version !== 3);
    notice(handle ? 'Projekt geöffnet. Mit „Projekt speichern“ gibst du das automatische Speichern in diese Datei frei.' : 'Projekt geöffnet. Änderungen speicherst du mit „Projekt speichern“ als neue Projektdatei.', false, 8500);
  }
  async function openProject() {
    if (busy) return;
    try {
      if (window.showOpenFilePicker && window.isSecureContext) {
        const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: 'Sitzplan-Projekt oder Wunschzettel', accept: { 'application/json': ['.json'], 'text/plain': ['.txt'], 'text/html': ['.html'] } }] });
        await openFile(await handle.getFile(), handle);
      } else { $('project-input').value = ''; $('project-input').click(); }
    } catch (error) { if (error.name !== 'AbortError') notice(error.message, true); }
  }
  $('open-project').onclick = $('start-open').onclick = openProject;
  $('project-input').onchange = async () => { const file = $('project-input').files[0]; if (file) try { await openFile(file); } catch (error) { notice('Projekt konnte nicht geöffnet werden: ' + error.message, true); } };
  $('import-wishes').onclick = () => { $('wishes-input').value = ''; $('wishes-input').click(); };
  $('wishes-input').onchange = async () => { const file = $('wishes-input').files[0]; if (file) try { importWishes(await readFile(file)); } catch (error) { notice(error.message, true); } };
  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const suggestedName = () => project.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') + '.json';
  async function saveProject(copy = false) {
    if (!project || busy) return;
    clearTimeout(saveTimer);
    if (copy) { download(ProjectFile.serialize(project), suggestedName()); notice('Kopie heruntergeladen. Sie enthält den gesamten Raum, alle Personen, Wünsche und Regeln.'); return; }
    try {
      if ((fileHandle || window.showSaveFilePicker) && window.isSecureContext) {
        let handle = fileHandle;
        if (!handle) handle = await window.showSaveFilePicker({ suggestedName: suggestedName(), types: [{ description: 'Sitzplan-Projekt', accept: { 'application/json': ['.json'] } }] });
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted' && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Die Schreibfreigabe fehlt. Nutze „Kopie speichern“, um das Projekt herunterzuladen.');
        await writer.flush(); fileHandle = handle; fileName = handle.name; writer.connect(handle); autosave = true;
        writer.request(ProjectFile.serialize(project), revision); await writer.flush(); renderSave();
      } else {
        download(ProjectFile.serialize(project), suggestedName()); savedRevision = revision; fileName = suggestedName(); cacheProject(); renderSave();
        notice('Projektdatei heruntergeladen. Dieser Browser kann sie nicht automatisch überschreiben. Lade nach weiteren Änderungen die aktuelle Projektdatei erneut herunter.', false, 11000);
      }
    } catch (error) { if (error.name !== 'AbortError') notice('Speichern nicht möglich: ' + error.message, true, 11000); }
  }
  $('save-project').onclick = () => saveProject(); $('save-copy').onclick = () => saveProject(true);
  window.addEventListener('beforeunload', event => { if (dirty() || writer.running) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { cancelRoomResize(); clearSelection(); linkStart = null; if (project && view === 'plan') renderPlan(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && project) { event.preventDefault(); saveProject(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.target.matches('input,textarea,select') && project) { event.preventDefault(); event.shiftKey ? travel(future, history) : travel(history, future); }
  });
  $('student-prompt').onclick = async () => {
    const roster = project.students.map(s => `${s.id}: ${s.name}`).join('\n');
    const prompt = `Formatiere meinen Wunschzettel für einen Sitzplan. Verwende ausschließlich diese IDs:\n${roster}\n\nMeine Angaben (ich ersetze die Platzhalter durch Namen):\nIch: [mein Name]\nJa, in Prioritätsreihenfolge 1 bis 5: [Namen oder -]\nNein, in Prioritätsreihenfolge 1 bis 5: [Namen oder -; ein ! hinter dem Namen bedeutet absolutes Nein]\n\nGib genau eine JSON-Zeile ohne Markdown aus: {"v":1,"round":"${project.ballotRound}","student":"meine ID","yes":["ID","-","-","-","-"],"no":["ID!","-","-","-","-"]}. Ersetze alle Namen durch passende IDs aus der Liste, ergänze fehlende Plätze bis genau fünf mit "-" am Ende, behalte die Prioritäten bei. Ein ! ist nur bei Nein erlaubt. Frage bei uneindeutigen Namen, Selbstnennungen oder doppelten/gleichzeitig bei Ja und Nein genannten Personen nach. Erfinde keine Wünsche. JSON oder Base64 ist keine Verschlüsselung und kein Nachweis der Identität.`;
    try { await navigator.clipboard.writeText(prompt); notice('Schülerprompt mit allen IDs und der aktuellen Runde kopiert.'); } catch { notice('Die Zwischenablage ist hier nicht verfügbar.', true); }
  };
  function stopSolver(message) {
    worker?.terminate(); worker = null; busy = false; document.body.classList.remove('busy'); if (message) solverMessage = message; render();
  }
  $('calculate').onclick = () => {
    try { Engine.validate(project); } catch (error) { notice(error.message, true); return; }
    if (!project.students.length || project.seats.length < project.students.length) return;
    const code = `const Engine = (${createEngine.toString()})(); self.onmessage = e => { try { self.postMessage({type:'result',result:Engine.solve(e.data,8000,progress=>self.postMessage({type:'progress',progress}))}); } catch(error) { self.postMessage({type:'error',message:error.message}); } };`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); notice('Die Berechnung konnte nicht gestartet werden: ' + error.message, true); return; }
    URL.revokeObjectURL(url); busy = true; document.body.classList.add('busy'); solverMessage = 'Sitzordnung wird berechnet …'; render();
    worker.onmessage = event => {
      const data = event.data;
      if (data.type === 'error') { stopSolver(); notice(data.message, true); }
      if (data.type === 'result') {
        stopSolver(); const result = data.result;
        if (result.assignment && Engine.evaluate(project, result.assignment).valid) commit(p => p.assignment = result.assignment);
        solverMessage = result.status === 'OPTIMAL' ? 'Beste Sitzordnung für diese Vorgaben gefunden.' : result.assignment ? 'Passende Sitzordnung gefunden. Alle festen Regeln sind erfüllt; ein globales Optimum ist nicht garantiert.' : result.message || 'Noch keine passende Sitzordnung gefunden. Prüfe Plätze und Regeln oder versuche es erneut.'; renderPlan();
      }
    };
    worker.onerror = event => { stopSolver(); notice('Berechnung abgebrochen: ' + event.message, true); }; worker.postMessage(clone(project));
  };
  $('stop').onclick = () => stopSolver('Berechnung gestoppt.');
  render();
})();
