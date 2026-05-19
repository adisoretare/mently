# Referat de prezentare — InfoEducație 2026

---

| | |
|---|---|
| **Titlu lucrare** | Mently — Graf vizual de cunoștințe |
| **Secțiunea** | Web |
| **Județ** | Cluj |
| **Autor** | Adigeoc |
| **Contact** | adigeoc@gmail.com |
| **An** | 2026 |

---

## Rezumat

Mently este o aplicație web client-side care transformă notițele fragmentate într-un graf interactiv animat în timp real. Utilizatorul adaugă notițe cu titlu, descriere și tag-uri; aplicația derivă automat legăturile semantice din tag-urile comune — fără ca utilizatorul să traseze manual vreo conexiune. Graful este rendat pe HTML5 Canvas cu un algoritm Fruchterman-Reingold implementat from scratch, la 60 fps. Aplicația este construită exclusiv în Vanilla JavaScript ES6 — fără framework, fără build step, fără dependențe NPM — și demonstrează că modularitatea, performanța și securitatea sunt realizabile cu Web Platform API pur.

---

## Cap. I — Inginerie Web și Programare *(25 puncte)*

### 1.1 Arhitectura aplicației

Aplicația este un Single Page Application pur client-side, organizat în **16 module ES6** cu responsabilități disjuncte și dependențe unidirecționale (fără cicluri):

```
┌──────────────────────────────────────────────────────┐
│  PRESENTATION                                         │
│  ui.js · ui-form · ui-list · ui-drawer · canvas.js   │
│  ui-node-panel · ui-tasks · ui-fullscreen · focus.js  │
├──────────────────────────────────────────────────────┤
│  DOMAIN LOGIC                                         │
│  graph.js (algoritmi) ← physics.js (simulare)         │
├──────────────────────────────────────────────────────┤
│  DATA                                                 │
│  store.js — state + persistență + pub/sub             │
├──────────────────────────────────────────────────────┤
│  CROSS-CUTTING                                        │
│  security.js · i18n.js · dom.js                       │
└──────────────────────────────────────────────────────┘
```

**Principiu de dependență**: fiecare strat depinde doar de stratul de dedesubt sau de modulele cross-cutting. Niciodată invers.

### 1.2 Design Patterns

| Pattern | Unde | Beneficiu |
|---|---|---|
| **Observer** | `store.js → subscribe(fn)` | Decuplare totală — store nu cunoaște consumatorii |
| **Mediator** | `ui.js` orchestrează `ui-list ↔ canvas ↔ ui-form` | Componentele nu se apelează direct |
| **Composition Root** | `main.js` — singurul punct de bootstrap | Dependențele rezolvate într-un singur loc |
| **Module Pattern** | ES6 native modules | Scope izolat, zero globale, zero name collisions |
| **Defense in Depth** | `security.js` → `store.js` → `ui-*.js` | O verigă slabă nu compromite lanțul |

### 1.3 Algoritmi specifici

**A. Construcție muchii — Inverted Index**

Muchiile nu sunt stocate; sunt derivate la fiecare modificare de date. Naive O(n²·t) este înlocuit cu un inverted index `tag → Set<noteId>`:

```
Complexitate: O(t · Σk²)
unde t = număr de tag-uri distincte, k = noduri per tag
Pentru distribuții Zipf reale: ~200× mai rapid față de varianta naivă
```

Beneficiu arhitectural: imposibil să existe muchii orfane sau inconsistențe noduri–muchii. Tag-urile sunt singura sursă de adevăr.

**B. Componente conexe — BFS**

Click pe un tag → BFS din toate nodurile cu acel tag → Set de noduri din aceeași componentă conexă → highlight selectiv pe canvas. Complexitate O(V + E).

**C. Sistem solar — BFS pe adâncime (Tier rendering)**

Nodul cu cel mai mare grad dintr-o componentă devine „soarele" (Tier 0). BFS din soare calculează adâncimea: Tier 1 (planete interioare), Tier 2 (planete gazoase cu benzi atmosferice), Tier 3 (planete exterioare cu efect crescent). Selecția unui nod îl promovează temporar ca soare — perspectivă subiectivă.

**D. Fruchterman-Reingold simplificat (force-directed layout)**

Trei forțe combinate cu cooling alpha:

```
Repulsie Coulomb:    F = K_r / d²         (toate perechile)
Atracție Hooke:      F = K_a · w · (d−L)  (pe muchii, w = tag-uri comune)
Centering:           F = K_c · (centru − poziție)
```

Integrare Euler explicită cu damping `vx *= 0.86` și clamp pe magnitudine (anti-explozii numerice). Alpha decay gradual → convergence; reheat la drag sau nod nou. Bucla rulează via `requestAnimationFrame` — auto-pause când tab-ul e ascuns.

**E. Picking geometric O(n)**

Click pe canvas → parcurgere lineară a nodurilor → nodul cu `d² ≤ (r + padding)²`. `nodeRadius()` este o funcție centralizată, apelată identic în `render()` și `findNodeAt()` — garanție că vizualul și hit-testingul sunt mereu sincronizate.

### 1.4 Arhitectura datelor

```json
{
  "version": 1,
  "notes": [
    {
      "id": "uuid-v4",
      "title": "string (max 200 chars, sanitized)",
      "content": "string (max 10000 chars, sanitized)",
      "tags": ["string (max 32 chars, lowercase, alphanum+-)"],
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000,
      "collapsed": false,
      "isTask": false,
      "done": false,
      "isSun": false
    }
  ],
  "meta": { "createdAt": 0, "updatedAt": 0 }
}
```

Schema este **versionată** (`version: 1`) pentru a permite migrări viitoare. Persistată în `localStorage` la cheia `mently:v1:state`. Muchiile nu sunt stocate — derivate la runtime din tag-uri.

### 1.5 Structurarea codului sursă

16 module ES6, fiecare cu API public minimal:

| Modul | Linii | Responsabilitate |
|---|---|---|
| `main.js` | ~130 | Bootstrap, error handling global |
| `store.js` | ~295 | CRUD, persistență, pub/sub |
| `security.js` | ~375 | Sanitizare, validare, rate limiting |
| `graph.js` | ~420 | Muchii, BFS, adjacency, sistem solar |
| `physics.js` | ~270 | Simulare Fruchterman-Reingold |
| `canvas.js` | ~1250 | Render Canvas 2D, pointer events |
| `ui.js` | ~265 | Mediator UI |
| `ui-form.js` | ~400 | Formular add/edit dual-mode |
| `ui-list.js` | ~520 | Carduri, export/import |
| `ui-drawer.js` | ~140 | Drawer mobil |
| `ui-node-panel.js` | ~315 | Panou flotant nod |
| `ui-tasks.js` | ~160 | Secțiunea Tasks |
| `focus.js` | ~270 | Focus mode BFS step-through |
| `i18n.js` | ~190 | Texte UI (RO) |
| `dom.js` | ~65 | aria-live, helpers focus |
| `ui-fullscreen.js` | ~50 | Toggle fullscreen |

### 1.6 Performanță

- **Canvas render**: `requestAnimationFrame` sincronizat cu refresh-ul ecranului → 60fps, fără tearing
- **High-DPI**: pixel buffer = CSS size × `devicePixelRatio` → linii crisp pe Retina/4K
- **Alpha decay**: simularea se „calmează" automat → 0 CPU când graful e stabil
- **Tab ascuns**: `document.hidden` gate în render loop → 0 CPU usage când tabul nu e vizibil
- **Resize debounce**: `cancelAnimationFrame` coalescing pe `window.resize`
- **Paletă CSS**: citită o singură dată la init, nu per-frame (evită layout thrashing)
- **Inverted index**: calcul muchii O(t·k²) vs O(n²) naiv

### 1.7 Sistem de management al codului

Git cu istoricul semantic per pas:

```
feat: add JSON export/import buttons with validation
fix: suppress NodePanel during focus mode
fix: focus traverses only real subtree, not entire component
feat: UI polish, sidebar collapse toggle, browser fullscreen button
refactor: agresiv comentarii + RAPORT.md InfoEducatie
```

Repository: `https://github.com/adisoretare/mently`

---

## Cap. II — Funcționalitate și utilitate *(20 puncte)*

### 2.1 Utilitatea lucrării

Mently rezolvă o problemă concretă: notițele liniare (liste, foldere) nu exprimă relațiile semantice dintre idei. Un student care studiază machine learning, matematică și lingvistică computațională are notițe care se intersectează la concepte comune — dar în sistemele tradiționale aceste intersecții sunt invizibile. Mently le face vizibile automat, prin tag-uri.

### 2.2 Funcționalități principale

| Funcționalitate | Status | Detaliu |
|---|---|---|
| Add / Edit / Delete notițe | ✅ | Formular dual-mode, tag chips inline |
| Graf interactiv auto-generat | ✅ | Din tag-uri comune, animat la 60fps |
| Drag & drop noduri | ✅ | Pointer Events API (mouse + touch) |
| Click selecție + sync sidebar | ✅ | Bidirecțional canvas ↔ sidebar |
| Tag filter cu highlight BFS | ✅ | Click tag → componentă conexă |
| Focus mode cu BFS step-through | ✅ | Prev/Next în subarborele nodului |
| Sistem solar vizual (Tier 0–3) | ✅ | Canvas texturi distincte per tier |
| Tasks section | ✅ | isTask + toggle done + contor |
| Export JSON | ✅ | Download `mently-<ts>.json` |
| Import JSON cu validare strictă | ✅ | Size check + parseAndValidateImport |
| Clear All cu confirmare 2-click | ✅ | Fără `confirm()` nativ |
| Sidebar collapse persistent | ✅ | Salvat în localStorage |
| Fullscreen toggle | ✅ | Fullscreen API pe zona canvas |
| Mobile drawer cu focus trap | ✅ | WCAG 2.4.3 compliant |

### 2.3 Persistență și gestionarea conținutului

- **localStorage**: date salvate automat după fiecare operație, inclusiv la import
- **Export JSON**: fișier descărcabil cu toate notițele, metadata și versiune schemă
- **Import JSON**: validare strictă înainte de apply (size cap 5MB, schemă, prototype pollution guard)
- **Schema versionată**: permite migrare non-destructivă la versiuni viitoare

---

## Cap. III — Interacțiunea cu utilizatorul + Design *(20 puncte)*

### 3.1 Design vizual

- **Paletă**: warm-stone dark (`ink-*`) cu accent amber (`signal-*`) și text neutru (`paper-*`) — 100% custom, fără default Tailwind
- **Tipografie**: Instrument Serif italic pentru brand, Geist Sans pentru UI, Geist Mono pentru statistici
- **Textură**: grain overlay + vignette radial în `style.css` — atmosferă cosmică, nu background plat
- **Animații**: `animate-fade-up` pentru sidebar, `animate-float` pentru empty state, puls soare pe canvas
- **Sistem solar**: paleta per componentă — 8 familii de culori distincte; soarele cu coroană pulsantă, planete cu texturi Canvas (limb darkening, highlight 3D, benzi gazoase, efect crescent)

### 3.2 Ergonomie și interacțiune

- **Drag & drop** pe noduri cu reheat la 0.6 alpha
- **Hover states** pe carduri, noduri, butoane
- **Escape** → deselect nod pe canvas, cancel edit în formular
- **2-click confirm** pentru delete și clear-all (fără dialog nativ)
- **Focus mode**: click pe un nod → spotlight + BFS step-through cu Prev/Next
- **Tag filter**: click pe tag → highlight componentă; re-click → toggle off
- **Sidebar collapse**: toggle persistent, cu resize canvas via `rAF → window.dispatchEvent('resize')`

### 3.3 Accesibilitate (WCAG 2.1)

- **ARIA roles** pe toate elementele interactive
- **aria-live announcer** (`dom.js`) pentru orice acțiune semnificativă: nod adăugat/editat/șters, selecție, export/import, focus mode
- **Focus trap** în drawer mobil — Tab/Shift+Tab nu ies din sidebar când e deschis
- **Focus management** la deschidere/închidere drawer (revenire la elementul anterior)
- **Skip-link** „Sari la conținut" vizibil la focus pentru utilizatori screen reader
- **prefers-reduced-motion**: animații Canvas dezactivate; drawer fără tranziție; lerp viewport instant
- **Keyboard navigation**: Tab/Enter pe toate cardurile și butoanele, Arrow keys în focus mode
- **Contrast**: toate culorile text/background depășesc 4.5:1 pe fundal dark

### 3.4 Internaționalizare

- **`i18n.js`**: singura sursă de adevăr pentru toate textele vizibile
- Funcții de pluralizare context-aware fără bibliotecă: `t.list.countMany(n) → "5 notițe"`
- Atributele `aria-label` din `index.html` au fallback static (pentru cazul fără JS), suprascrise la boot de `ui.js` cu valorile din `t.a11y.*`
- Arhitectura suportă adăugarea unei limbi noi prin un singur fișier nou + un import în `i18n.js`

### 3.5 Responsive și independență de platformă

- **Desktop ≥ 768px**: sidebar fix, canvas alăturat
- **Mobile < 768px**: sidebar off-screen → drawer cu hamburger, backdrop blur, animație slide-in
- **Pointer Events API**: handler unificat mouse + touch + pen (standard W3C) — cod 2× mai scurt față de duplicate listeners
- **High-DPI**: canvas pixel buffer × `devicePixelRatio` — crisp pe Retina, 4K, și ecrane mobile dense
- **Testat pe**: Chrome 90+, Firefox 90+, Safari 15+, Edge 90+

---

## Cap. IV — Originalitate *(15 puncte)*

### 4.1 Originalitatea ideii

**Graf derivat din tag-uri, nu din link-uri explicite.** Spre deosebire de Obsidian (backlink-uri `[[note]]`) sau Roam (referințe directe), Mently pornește de la un nivel mai granular: tag-urile semantice. Conexiunile apar automat fără ca autorul să le traseze manual — emergent din pattern-urile de organizare ale utilizatorului.

**Imposibilitate structurală de inconsistență**: deoarece muchiile sunt derivate, nu stocate, nu poate exista niciodată o muchie orfană sau o inconsistență noduri–muchii. Ștergerea unui nod elimină automat toate muchiile sale.

### 4.2 Originalitatea implementării

- **Sistem solar vizual** cu 8 palete per componentă conexă și 4 tipuri de noduri-planetă cu texturi Canvas distincte (coroană pulsantă, atmosferă, benzi gazoase, crescent) — implementare proprie, nu bibliotecă vizualizare
- **Focus mode BFS**: traversare interactivă a grafului pas cu pas, cu spotlight care pan-ează canvas-ul lerp spre nodul curent
- **Inele orbitale** cu lerp smooth per componentă (eliminare jitter fizică)
- **Internaționalizare completă** (RO/EN) cu proxy dinamic și persistență localStorage
- **Voice input** prin Web Speech API: dictare titlu, recunoaștere adaptată după limba activă (ro-RO / en-US)
- **URL hash deep linking**: starea de selecție (nod/tag) se reflectă în URL — link-urile sunt share-abile și restaurabile
- **Zero dependențe de runtime**: `tailwind.css` compilat static local — niciun request extern la JavaScript terț
- **Paletă warm-stone**: distanțare deliberată față de genericul dark-blue/gray; amber accent cu griuri calde

### 4.3 Diferențierea față de abordări existente

| Caracteristică | Mently | Obsidian | Roam Research | Logseq |
|---|---|---|---|---|
| Sursa conexiunilor | Tag-uri *(automat)* | Link-uri `[[explicit]]` | Referințe directe | Link-uri + backlink-uri |
| Inconsistențe posibile | Imposibil structural | Posibil (link-uri orfane) | Posibil | Posibil |
| Arhitectură | Browser-only, client-side | Electron (local app) | Cloud SaaS | Electron + Cloud sync |
| Open-source | Da (cod public) | Parțial (plugin API) | Nu | Da |
| Framework JS | Vanilla (zero deps) | React + Electron | React | Clojure/ClojureScript |
| Vizualizare graf | Canvas 2D custom (FR) | D3.js graph plugin | Nu (implicit) | D3.js |
| Cont necesar | Nu | Nu | Da | Nu |
| Build step | Nu *(CSS pre-compilat)* | Da | N/A SaaS | Da |
| Voice input | Da *(Web Speech API)* | Nu | Nu | Nu |
| URL deep linking | Da *(hash-based)* | Nu | Da (URL-based) | Nu |
| Internaționalizare | Da *(RO/EN)* | Via plugin | Nu | Parțial |

**Cei 3 diferențiatori unici ai Mently:**
1. **Graf emergent din tag-uri** — nu necesită link-uri manuale; imposibilitate structurală de inconsistență
2. **Sistem solar vizual** — fiecare componentă conexă = „sistem planetar" cu soare, orbite, planete tipologice
3. **Zero install, zero framework, zero cont** — rulează direct din browser, cod 100% Vanilla JS

---

## Cap. V — Securitate *(10 puncte)*

### 5.1 Strategie: Defense in Depth

```
Layer 1: CSP + HTTP headers (browser-level)
Layer 2: Input sanitization (security.js → store.js)
Layer 3: Output escaping (escapeHtml în fiecare innerHTML)
Layer 4: Rate limiting + resource caps
Layer 5: Validare la load (anti-tampering localStorage)
```

### 5.2 Vectori acoperiti

| Atac | Surface | Mitigare |
|---|---|---|
| **XSS prin innerHTML** | Form inputs, JSON import | `escapeHtml()` cu 8 entități (`& < > " ' / \` =`) la fiecare render |
| **XSS prin store** | `addNote`, `updateNote` | `sanitizeTitle/Content/Tags` în `security.js` înainte de save |
| **Prototype pollution** | JSON import, object literals | Verificare `__proto__`, `constructor`, `prototype` ca own props → skip note |
| **DoS input gigant** | Form, import | `LIMITS`: titlu 200 chars, content 10k chars, import max 5MB |
| **DoS spam** | `addNote` programatic | Rate limiter token-bucket: 30 acțiuni/minut |
| **DoS fizică O(n²)** | `addNote` | Hard cap 1000 noduri (physics loop oprită la depășire) |
| **localStorage tampering** | DevTools, alt tab | Re-validare per-câmp la fiecare boot |
| **Control char injection** | Text fields | Strip `\x00–\x1F`, RTL override characters |
| **Clickjacking** | iframe embed | `frame-ancestors 'none'` în CSP |
| **MIME confusion** | Static files | `X-Content-Type-Options: nosniff` |

### 5.3 Verificare live (console)

```javascript
// XSS escape
__mently.Security.escapeHtml('<script>alert(1)</script>')
// → "&lt;script&gt;alert(1)&lt;&#x2F;script&gt;"

// XSS prin formular real
__mently.Store.addNote({ title: '<img src=x onerror=alert(1)>', tags: [] })
// → apare în sidebar ca TEXT inofensiv, zero execuție

// Prototype pollution
__mently.Security.parseAndValidateImport('{"version":1,"notes":[{"__proto__":{"evil":true}}]}')
// → { importedCount: 0, skippedCount: 1 } — nota e skipped, nu throw

// Rate limiter
let blocked = 0;
for (let i = 0; i < 35; i++) {
  try { __mently.Store.addNote({ title: `n${i}`, tags: [] }); }
  catch (e) { blocked++; }
}
console.log(`Blocked: ${blocked}`); // → 5
```

### 5.4 Vectori intenționat în afara scope-ului

- **CSRF**: aplicația e 100% client-side, fără cookies, fără sesiune
- **SQL Injection**: nu există SQL
- **Authentication**: single-user, local — nu există conturi
- **Full HTML sanitization (DOMPurify)**: nu inserăm HTML user-generated — doar `textContent` via `escapeHtml`

---

## Cap. VII — Prezentare *(10 puncte)*

### 7.1 Documentație

| Document | Conținut |
|---|---|
| `RAPORT.md` | Documentație tehnică completă (arhitectură, module, algoritmi, securitate, cerințe sistem) |
| `REFERAT.md` | Prezentare formală pentru jurizare (acest document) |
| `index.html` (CSP + comentarii) | Threat model și decizii de securitate vizibile direct în cod |

### 7.2 Demo practic — flux recomandat

**Pregătire (5 min înainte):**
- Browser pe `localhost:5500`, DevTools închis, storage curat (`__mently.Store.clearAll()`)
- Notițe demo pregătite (6 notițe din ML/matematică cu tag-uri suprapuse)

**Flux demonstrativ (7–10 min):**

1. **Opening (30 sec)** — pagina goală, prezentarea problemei rezolvate
2. **Add 3–6 notițe** cu tag-uri suprapuse → graful se construiește live, muchiile apar automat
3. **Interacțiune** — drag nod, click selecție, click tag (highlight componentă BFS), focus mode
4. **Arhitectură** — schema pe straturi, design patterns, algoritmi principali
5. **Demo securitate live** — XSS escape, prototype pollution, rate limiter în DevTools console
6. **Design & a11y** — Tab navigation, focus ring, skip-link, resize mobile → drawer

**Răspunsuri pregătite** la întrebările frecvente ale juriului:

> *"De ce Vanilla JS și nu React?"*
> Modularitatea e cerută explicit în barem. 16 module ES6 demonstrează nativ JavaScript Module Pattern fără overhead framework. Arhitectura e auditabilă linie cu linie.

> *"De ce nu stochezi muchiile?"*
> Single source of truth. Muchiile sunt 100% derivabile din tag-uri; stocarea lor ar crea risc de inconsistență la fiecare modificare.

> *"Ce algoritm folosești pentru layout?"*
> Fruchterman-Reingold simplificat: repulsie Coulomb + atracție Hooke + centering, cu alpha cooling din d3-force pentru convergence. O(n²+e) per tick; pentru >1000 noduri aș folosi Barnes-Hut O(n log n).

> *"Cum protejezi față de XSS?"*
> Defense in depth pe 3 niveluri: sanitize la save (security.js), escape la render (escapeHtml pe fiecare innerHTML), CSP cu script-src restrictiv. Plus rate limiting.

---

## Cerințe de rulare

```bash
cd mently
python -m http.server 8000   # sau: npx serve .
# → http://localhost:8000
```

**Browser**: Chrome 90+ / Firefox 90+ / Safari 15+ / Edge 90+
**Nu necesită**: Node.js, NPM, build step, bundler, cont, backend, baze de date.
