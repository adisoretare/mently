# Mently — Graf vizual de cunoștințe

## Informații generale

- **Categorie:** Web
- **Județ:** Cluj
- **Autor:** Adigeoc (adigeoc@gmail.com)
- **Surse:** Repository local (`C:\Users\TIS\Desktop\mently`) · servit via HTTP static
- **Tehnologii principale:** Vanilla JavaScript ES6, HTML5 Canvas 2D, Tailwind CSS v3.4 (CDN), localStorage

---

## Descriere

Mently este o aplicație web client-side care transformă notițele fragmentate într-o hartă mentală interactivă. Utilizatorul adaugă notițe cu titlu, descriere și tag-uri; aplicația derivă automat legăturile semantice dintre notițe (un „nod" în limbajul aplicației) din tag-urile pe care le au în comun, fără ca utilizatorul să traseze manual nicio muchie. Rezultatul este un graf vizual animat în timp real, care reflectă structura cunoștințelor utilizatorului.

Interfața este împărțită în două zone: un panou lateral (sidebar) cu formularul de adăugare/editare, lista de notițe și statistici, și o zonă de canvas care afișează graful. Cele două zone sunt sincronizate bidirecțional — selectarea unui nod pe canvas îl evidențiază în sidebar și invers. Click pe un tag în sidebar filtrează graful și evidențiază componenta conexă care îl conține. Nodurile au roluri vizuale inspirate din sistemul solar: nodul cu cele mai multe conexiuni devine „soarele" componentei, celelalte sunt planete de tier 1–3, fiecare cu texturi Canvas distincte.

Aplicația respectă principiile de accesibilitate WCAG 2.1: toate elementele interactive sunt accesibile cu tastatura, există anunțuri ARIA live pentru fiecare acțiune semnificativă, suport prefers-reduced-motion, focus trap în drawer-ul mobil, și un skip-link vizibil la focus. Pe mobil, sidebar-ul se transformă într-un drawer cu backdrop și animație de tranziție. Pe desktop, sidebar-ul este fix alături de canvas.

Securitatea este tratată ca strat separat, nu ca afterthought: tot inputul utilizatorului este sanitizat înainte de a atinge state-ul (security.js) și escaped din nou la fiecare render (escapeHtml în innerHTML). Aplicația apără explicit împotriva XSS, prototype pollution la importul JSON, DoS prin input gigant, și control character injection.

---

## Tehnologii — Descriere Tehnică

### Arhitectură

Aplicația este un Single Page Application pur client-side, fără server, fără build step, fără NPM. Modulele se încarcă via ES6 native import/export peste HTTP static.

**Stack:**
| Categorie | Alegere |
|---|---|
| Limbaj | Vanilla JavaScript ES6+ (module native) |
| Markup | HTML5 cu ARIA semantic |
| Stilizare | Tailwind CSS v3.4 via CDN + `style.css` pentru tokens și animații |
| Rendering | HTML5 Canvas 2D |
| Persistență | localStorage cu schemă JSON versionată |
| Layout algoritm | Fruchterman-Reingold (implementare proprie) |
| Build | Zero — fișiere statice servite direct |

**Organizare în straturi:**
```
┌──────────────────────────────────────────────────────────────┐
│  PRESENTATION                                                 │
│  ui.js (mediator) → ui-form, ui-list, ui-drawer, canvas.js   │
├──────────────────────────────────────────────────────────────┤
│  DOMAIN LOGIC                                                 │
│  graph.js (algoritmi) ← physics.js (simulare)                │
├──────────────────────────────────────────────────────────────┤
│  DATA                                                         │
│  store.js (state + persistență + pub/sub)                     │
├──────────────────────────────────────────────────────────────┤
│  CROSS-CUTTING                                                │
│  security.js  |  i18n.js  |  dom.js                          │
└──────────────────────────────────────────────────────────────┘
```

**Design patterns utilizate:**
- **Observer** — `store.js` expune `subscribe(fn)`; componentele se abonează și reacționează la modificări fără să se cunoască între ele.
- **Mediator** — `ui.js` orchestrează comunicarea: `ui-list` și `canvas.js` nu se apelează direct; ui.js rutează evenimentele între ele.
- **Composition Root** — `main.js` este singurul punct de bootstrap; rezolvă dependențele și inițializează modulele în ordinea corectă.
- **Defense in Depth** — validare la boundary (form), sanitizare la save (store → security), escape la render (innerHTML).
- **Module Pattern** — ES6 native: fiecare fișier este un modul cu scope izolat. Zero globale expuse în afara `window.__mently` (dev-only).

---

### Module

| Fișier | Rol | Responsabilitate principală |
|---|---|---|
| `main.js` | Composition Root | Bootstrap în ordinea corectă; error handling global; expunere dev console |
| `store.js` | Data Layer | CRUD notițe, persistență localStorage, pub/sub Observer |
| `security.js` | Cross-cutting | escapeHtml, sanitize input, parseAndValidateImport, rate limiter, LIMITS |
| `graph.js` | Domain Logic | Construcție muchii (inverted index), adjacency map, BFS, componente conexe, sistem solar (soare + adâncimi BFS) |
| `physics.js` | Domain Logic | Simulare Fruchterman-Reingold: repulsie Coulomb, atracție Hooke, centering, alpha decay, Euler explicit |
| `canvas.js` | Presentation | Render Canvas 2D la 60fps, Pointer Events (mouse + touch), picking geometric, sistem solar vizual (Tier 0–3), focus spotlight, inele orbitale |
| `ui.js` | Presentation/Mediator | Inițializează componentele, wire-uiește evenimentele bidirecționale, gestionează sidebar collapse |
| `ui-form.js` | Presentation | Formular dual-mode add/edit, tag chips, validare client-side, subscribe la store pentru resilience la delete extern |
| `ui-list.js` | Presentation | Carduri notițe, tag filter, edit/delete, export JSON, import JSON cu validare |
| `ui-drawer.js` | Presentation | Drawer mobil cu focus trap (WCAG 2.4.3), backdrop click, Escape to close, sync la breakpoint |
| `ui-node-panel.js` | Presentation | Panou flotant ancorat pe nod selectat (detalii + acțiuni focus/edit/set-sun) |
| `ui-tasks.js` | Presentation | Secțiunea Tasks (notițe cu isTask=true), toggle done, contorizare |
| `ui-fullscreen.js` | Presentation | Toggle fullscreen pe zona canvas (Fullscreen API) |
| `focus.js` | Presentation | Focus mode: BFS step-through în subarborele nodului selectat, spotlight pe canvas |
| `i18n.js` | Cross-cutting | Dicționar RO al tuturor textelor UI; funcții de pluralizare context-aware |
| `dom.js` | Cross-cutting | aria-live announcer (workaround browser quirk), allFocusable/firstFocusable helpers |

---

### Algoritmi implementați

**1. Construcție muchii — Inverted Index O(t · Σk²)**

Muchiile nu sunt stocate explicit; sunt derivate la fiecare schimbare de date din tag-urile comune ale notițelor. Un inverted index `tag → Set<noteId>` permite generarea perechilor eficient, fără O(n²) naiv pe toate notițele.

**2. Componente conexe + BFS**

Click pe un tag în sidebar → BFS din toate notițele cu acel tag → Set de noduri din aceeași componentă conexă → highlight selectiv pe canvas. Complexitate O(V + E).

**3. Sistem solar — BFS pe adâncime**

Nodul cu cel mai mare grad dintr-o componentă devine „soarele" (Tier 0). BFS din soare calculează adâncimea fiecărui nod: Tier 1 (planete interioare), Tier 2 (planete gazoase), Tier 3 (planete exterioare). Dacă utilizatorul selectează un nod, acesta devine temporar soarele componentei sale (perspectivă subiectivă).

**4. Fruchterman-Reingold simplificat**

Trei forțe combinate cu cooling alpha:
- **Repulsie Coulomb-like**: toate perechile de noduri se resping (F ∝ K_r / d²) → previne suprapunerea
- **Atracție Hooke-like**: muchiile sunt arcuri (F ∝ K_a · weight · (d − L_rest)) → tag-uri comune apropie nodurile
- **Centering**: forță spre centrul viewport-ului → graful nu fuge în afara ecranului

Integrare Euler explicită cu damping (vx *= 0.86) și clamp pe magnitudine. Alpha decay gradual → convergence; reheat la drag sau nod nou.

**5. Picking geometric O(n)**

Click pe canvas → parcurgere lineară a nodurilor → nodul cu distanța d² ≤ r² față de cursor. Același `nodeRadius()` folosit în render și în picking pentru sincronizare vizual ↔ hit-test.

---

### Funcționalități principale

- **Add / Edit / Delete notițe** cu titlu, descriere, tag-uri (chips inline, Enter pentru confirmare)
- **Graf interactiv** derivat automat din tag-uri comune, animat la 60fps
- **Drag & drop** pe noduri; click pentru selecție; hover pentru highlight
- **Focus mode**: click pe nod → intrare în modul de focus cu BFS step-through (Prev/Next), spotlight pe canvas, exit cu Esc
- **Sistem solar vizual**: Tier 0 (soare) cu coroană pulsantă, Tier 1–3 cu texturi Canvas distincte (atmosferă, benzi gazoase, crescent)
- **Inele orbitale** per componentă (top 5), cu lerp smooth pentru eliminarea jitter-ului
- **Tag filter**: click pe tag → highlight componentă conexă; re-click → toggle off
- **Tasks section**: notițe marcate `isTask` apar separat cu toggle done și contor
- **Export JSON**: descarcă `mently-<timestamp>.json` cu toate notițele
- **Import JSON**: file picker → validare strictă → replace notițe (cu anunț a11y pentru nr. importate/skipped)
- **Clear All** cu confirmare 2-click (fără `confirm()` nativ)
- **Sidebar collapse** persistent (localStorage) cu tranziție rAF → resize canvas
- **Fullscreen toggle** pe zona canvas
- **Mobile drawer** cu focus trap, backdrop, Escape to close, sync la resize

---

### Securitate

Strategie: **defense in depth** — 5 straturi concentric:

1. **CSP + HTTP headers** — `Content-Security-Policy` în `index.html` limitează sursele; `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
2. **Input boundary** — sanitizare la save: `sanitizeTitle`, `sanitizeContent`, `sanitizeTags` în `security.js` înainte de orice mutare în store
3. **Output escaping** — `escapeHtml()` cu 8 entități (`& < > " ' / \` =`) aplicat la fiecare `innerHTML` cu date user-provided
4. **Rate limiting** — token bucket 30 acțiuni/minut; hard cap 1000 noduri (previne DoS prin physics O(n²))
5. **Validare la load** — datele din localStorage sunt revalidate per-câmp la fiecare boot (anti-tampering via DevTools)

**Atacuri specifice acoperite:**
- XSS prin innerHTML
- Prototype pollution la import JSON (`__proto__`, `constructor`, `prototype` refuzate explicit)
- DoS prin input gigant (LIMITS: titlu 200 chars, conținut 10k chars, import max 5MB)
- Control character injection (`\x00–\x1F` stripped, RTL override prevenit)
- localStorage tampering

---

### Accesibilitate (WCAG 2.1)

- **ARIA roles** pe toate elementele interactive (`role="button"`, `role="list"`, `role="region"`, etc.)
- **aria-live announcer** (`dom.js:announce`) pentru acțiuni: nod adăugat/editat/șters, export/import, selecție, focus mode
- **Focus trap** în drawer mobil (Tab/Shift+Tab nu ies din sidebar când e deschis)
- **Focus management**: la deschidere drawer → focus pe primul element; la închidere → focus revine pe elementul care a declanșat
- **Keyboard navigation**: Tab/Enter pe carduri și butoane, Esc pentru deselect/cancel edit, Arrow keys în focus mode
- **skip-link** „Sari la conținut" vizibil la focus pentru utilizatori cu screen reader
- **prefers-reduced-motion**: animații Canvas dezactivate (puls soare, lerp viewport); drawer fără tranziție

---

## Cerințe sistem

**Browsere suportate:**
- Google Chrome 90+ (recomandat)
- Mozilla Firefox 90+
- Safari 15+
- Microsoft Edge 90+
- Orice browser cu suport ES6 native modules

**Cerințe de rulare:**
- Server HTTP static (nu funcționează pe `file://` din cauza ES6 modules)
  - Python: `python -m http.server 8000`
  - VS Code: extensia Live Server
  - Node.js: `npx serve .`
- **NU necesită** Node.js, NPM, build step sau bundler
- Conexiune internet pentru încărcarea Tailwind CSS și Google Fonts (CDN); funcționează offline după prima încărcare (cache browser)

**Hardware recomandat:**
- RAM: minimum 2 GB disponibil
- Ecran: minimum 1024×600px (optimal 1280×720px sau mai mare)
- GPU: orice GPU integrat (Canvas 2D nu necesită accelerare 3D)

**Pornire rapidă:**
```bash
cd mently
python -m http.server 8000
# → http://localhost:8000
```
