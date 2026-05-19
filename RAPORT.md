# Mently — Graf vizual de cunoștințe

## Informații generale

- **Categorie:** Web
- **Județ:** Cluj
- **Surse:** [GitHub — adisoretare/mently](https://github.com/adisoretare/mently)
- **Homepage:** https://mently-xi.vercel.app/

---

## Descriere

Mently este o aplicație web care transformă notițele fragmentate într-o hartă mentală interactivă. Utilizatorul adaugă notițe cu titlu, descriere și tag-uri; aplicația derivă automat legăturile semantice dintre ele din tag-urile pe care le au în comun — fără ca utilizatorul să traseze manual nicio muchie. Rezultatul este un **graf vizual animat în timp real**, care reflectă structura cunoștințelor utilizatorului.

Ideea centrală este simplă dar puternică: cunoașterea nu este liniară, ci reticulară. Notițele izolate nu valorează mai mult decât suma lor — valoarea apare din conexiunile dintre ele. Mently face aceste conexiuni vizibile, automate și explorabile. Un student care notează concepte din mai multe cursuri va vedea imediat ce idei se suprapun; un cercetător care adaugă surse bibliografice va observa clustere de subiecte fără să le caute explicit.

Interfața este împărțită în două zone sincronizate bidirecțional: un panou lateral cu formularul de editare, lista de notițe, statistici și un jurnal de task-uri; și o zonă de canvas care afișează graful animat. Selectarea unui nod pe canvas îl evidențiază în sidebar și invers. Nodurile au roluri vizuale inspirate din sistemul solar — nodul cu cele mai multe conexiuni devine „soarele" componentei, celelalte sunt planete de tier 1–3, fiecare cu textură Canvas 2D distinctă (atmosferă, benzi gazoase, crescent).

Aplicația funcționează complet offline după prima încărcare, fără server, fără bază de date, fără cont de utilizator necesar. Toate datele sunt stocate local în `localStorage` cu schemă versionată. Codul este 100% vanilla JavaScript ES6 — fără framework, fără build step, fără NPM — ceea ce face arhitectura complet transparentă și auditabilă, iar portabilitatea maximă.

---

## Tehnologii — Descriere Tehnică

### Stack tehnologic

| Categorie | Alegere |
|---|---|
| Limbaj | Vanilla JavaScript ES6+ (module native) |
| Markup | HTML5 cu ARIA semantic |
| Stilizare | Tailwind CSS v3.4 via CDN + `style.css` pentru tokens și animații custom |
| Rendering | HTML5 Canvas 2D |
| Persistență | localStorage cu schemă JSON versionată |
| Layout algoritm | Fruchterman-Reingold (implementare proprie, fără bibliotecă) |
| Build | Zero — fișiere statice servite direct |
| Deployment | Vercel (CDN edge global, HTTPS automat) |
| Versionare | Git + GitHub (`adisoretare/mently`) |

### Arhitectura pe straturi

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

| Pattern | Implementare |
|---|---|
| **Observer** | `store.js` expune `subscribe(fn)` — componentele se abonează și reacționează la modificări fără să se cunoască direct |
| **Mediator** | `ui.js` orchestrează comunicarea — `ui-list` și `canvas.js` nu se apelează direct, toate evenimentele trec prin mediator |
| **Composition Root** | `main.js` este singurul punct de bootstrap — rezolvă dependențele și inițializează modulele în ordinea corectă |
| **Module Pattern** | ES6 native: fiecare fișier este un modul cu scope izolat, zero variabile globale expuse |
| **Defense in Depth** | Validare la boundary → sanitizare la save → escape la render — trei bariere independente |

---

### Module

| Fișier | Rol | Responsabilitate principală |
|---|---|---|
| `main.js` | Composition Root | Bootstrap în ordinea corectă; error handling global; expunere dev console |
| `store.js` | Data Layer | CRUD notițe, persistență localStorage, pub/sub Observer |
| `security.js` | Cross-cutting | escapeHtml, sanitize input, parseAndValidateImport, rate limiter, LIMITS |
| `graph.js` | Domain Logic | Construcție muchii (inverted index), adjacency map, BFS, componente conexe, sistem solar |
| `physics.js` | Domain Logic | Simulare Fruchterman-Reingold: repulsie Coulomb, atracție Hooke, centering, alpha decay, Euler explicit |
| `canvas.js` | Presentation | Render Canvas 2D la 60fps, Pointer Events (mouse + touch), picking geometric, sistem solar vizual, focus spotlight |
| `ui.js` | Presentation / Mediator | Inițializează componentele, wire-uiește evenimentele bidirecționale, sidebar collapse |
| `ui-form.js` | Presentation | Formular dual-mode add/edit, tag chips inline, validare client-side |
| `ui-list.js` | Presentation | Carduri notițe, tag filter, edit/delete, export JSON, import JSON cu validare |
| `ui-drawer.js` | Presentation | Drawer mobil cu focus trap (WCAG 2.4.3), backdrop click, Escape to close |
| `ui-node-panel.js` | Presentation | Panou flotant ancorat pe nod selectat (detalii + acțiuni: focus / edit / set-sun) |
| `ui-tasks.js` | Presentation | Secțiunea Tasks (notițe cu `isTask=true`), toggle done, contor progres |
| `ui-fullscreen.js` | Presentation | Toggle fullscreen pe zona canvas (Fullscreen API) |
| `focus.js` | Presentation | Focus mode: BFS step-through în subarborele nodului selectat, spotlight pe canvas |
| `i18n.js` | Cross-cutting | Dicționar RO al tuturor textelor UI; funcții de pluralizare |
| `dom.js` | Cross-cutting | aria-live announcer (workaround browser quirk), allFocusable/firstFocusable helpers |

---

### Algoritmi implementați

**1. Construcție muchii — Inverted Index**
Complexitate O(t · Σk²), unde t = numărul de tag-uri unice, k = numărul de notițe per tag.

Muchiile nu sunt stocate explicit — sunt derivate la fiecare schimbare de date din tag-urile comune ale notițelor. Un inverted index `tag → Set<noteId>` permite generarea perechilor eficient, fără O(n²) naiv pe toate notițele.

**2. Componente conexe + BFS**
Complexitate O(V + E).

Click pe un tag în sidebar → BFS din toate notițele cu acel tag → Set de noduri din aceeași componentă conexă → highlight selectiv pe canvas.

**3. Sistem solar — BFS pe adâncime**

Nodul cu cel mai mare grad dintr-o componentă devine „soarele" (Tier 0). BFS din soare calculează adâncimea fiecărui nod: Tier 1 (planete interioare), Tier 2 (planete gazoase), Tier 3 (planete exterioare). Dacă utilizatorul selectează un nod, acesta devine temporar soarele componentei sale — perspectivă subiectivă.

**4. Simulare fizică Fruchterman-Reingold**

Trei forțe combinate cu cooling alpha:
- **Repulsie Coulomb-like** — toate perechile de noduri se resping (F ∝ K_r / d²); previne suprapunerea
- **Atracție Hooke-like** — muchiile sunt arcuri elastice (F ∝ K_a · weight · (d − L_rest)); tag-urile comune apropie nodurile
- **Centering** — forță proporțională spre centrul viewport-ului; graful nu fuge în afara ecranului

Integrare Euler explicită cu damping (vx \*= 0.86) și clamp pe magnitudine. Alpha decay gradual → convergence; reheat la drag sau nod nou.

**5. Picking geometric**
Complexitate O(n).

Click pe canvas → parcurgere liniară a nodurilor → nodul cu distanța d² ≤ r² față de cursor. Același `nodeRadius()` folosit în render și în picking garantează sincronizarea vizual ↔ hit-test.

---

### Funcționalități principale

- **Add / Edit / Delete notițe** cu titlu, descriere, tag-uri (chips inline, Enter pentru confirmare)
- **Graf interactiv** derivat automat din tag-uri comune, animat la 60fps prin Canvas 2D
- **Drag & drop** pe noduri; click pentru selecție; hover pentru highlight
- **Focus mode** — click pe nod → BFS step-through cu Prev/Next, spotlight animat pe canvas, exit cu Esc
- **Sistem solar vizual** — Tier 0 (soare) cu coroană pulsantă, Tier 1–3 cu texturi Canvas distincte
- **Inele orbitale** per componentă (top 5), cu lerp smooth pentru eliminarea jitter-ului
- **Tag filter** — click pe tag → highlight componentă conexă; re-click → toggle off
- **Tasks section** — notițe marcate `isTask` apar separat cu toggle done și contor progres
- **Export JSON** — descarcă `mently-<timestamp>.json` cu toate notițele
- **Import JSON** — validare strictă → replace notițe (cu anunț accesibil pentru nr. importate/skipped)
- **Clear All** cu confirmare 2-click (fără `confirm()` nativ)
- **Sidebar collapse** persistent (localStorage) cu tranziție rAF + resize canvas
- **Fullscreen toggle** pe zona canvas (Fullscreen API)
- **Mobile drawer** cu focus trap, backdrop, Escape to close, sync la resize

---

### Securitate — Defense in Depth (5 straturi)

**Strategie:** fiecare strat este independent. Dacă un strat cedează, celelalte îl opresc pe atacator.

| Strat | Implementare |
|---|---|
| 1. Transport + headers HTTP | CSP în `index.html`; X-Frame-Options DENY, HSTS, Referrer-Policy, Permissions-Policy via `vercel.json` |
| 2. Input boundary | `sanitizeTitle`, `sanitizeContent`, `sanitizeTags` în `security.js` la orice mutare în store |
| 3. Output escaping | `escapeHtml()` cu 8 entități (`& < > " ' / \` =`) la fiecare `innerHTML` cu date user-provided |
| 4. Rate limiting | Token bucket 30 acțiuni/minut; hard cap 1000 noduri (previne DoS prin physics O(n²)) |
| 5. Validare la load | Datele din localStorage revalidate per-câmp la boot (anti-tampering via DevTools) |

**Atacuri specifice acoperite:**

| Atac | Mitigare |
|---|---|
| XSS prin innerHTML | `escapeHtml()` aplicat la fiecare render |
| Prototype pollution | `__proto__`, `constructor`, `prototype` refuzate explicit la import JSON |
| DoS prin input gigant | LIMITS: titlu 200 chars, conținut 10.000 chars, import max 5 MB |
| Control character injection | `\x00–\x1F` stripped, RTL override prevenit |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'` în CSP |
| HTTPS downgrade | HSTS `max-age=63072000; includeSubDomains` |
| localStorage tampering | Revalidare completă la fiecare boot |

**Demo live securitate (în DevTools console la prezentare):**
```javascript
// Verificare XSS escape
window.__mently.Store.addNote({ title: '<script>alert(1)</script>', tags: [] });
// → nodul apare cu textul literal, scriptul nu se execută

// Verificare prototype pollution
window.__mently.Store.replaceNotes(JSON.parse('{"__proto__":{"admin":true}}'));
// → import eșuat, 0 notițe importate

// Verificare rate limiter
for (let i = 0; i < 35; i++) window.__mently.Store.addNote({ title: `test${i}`, tags: [] });
// → după 30 inserări: "Prea multe inserări consecutive"
```

---

### Accesibilitate (WCAG 2.1 AA)

| Criteriu | Implementare |
|---|---|
| ARIA roles | `role="button"`, `role="list"`, `role="region"`, `role="toolbar"` pe toate elementele interactive |
| Anunțuri live | `dom.js:announce()` cu `aria-live="polite"` pentru fiecare acțiune semnificativă |
| Focus trap | Drawer mobil: Tab/Shift+Tab nu ies din sidebar când e deschis (WCAG 2.4.3) |
| Focus management | La deschidere drawer → focus pe primul element; la închidere → focus revine pe trigger |
| Navigare tastatură | Tab/Enter pe carduri și butoane, Esc pentru deselect/cancel, Arrow keys în focus mode |
| Skip link | „Sari la graf" vizibil la focus, invizibil altfel |
| prefers-reduced-motion | Animații Canvas dezactivate (puls soare, lerp viewport, drawer transition) |

---

## Cerințe sistem

**Pentru utilizare:**
- Browser modern cu suport ES6 modules — Chrome 90+, Firefox 90+, Safari 15+, Edge 90+
- Conexiune la internet pentru prima accesare (Tailwind CDN + Google Fonts); după aceea funcționează din cache browser
- **NU necesită** Node.js, NPM, build step sau cont de utilizator

**Rulare locală (alternativă la URL public):**
```bash
cd mently
python -m http.server 8000
# → http://localhost:8000
```

**Hardware recomandat:**
- RAM: minimum 2 GB disponibil în browser
- Ecran: minimum 1024×600px
- GPU: orice GPU integrat (Canvas 2D nu necesită accelerare 3D)

---

## Realizatori

**Adigeoc**
- Email: adigeoc@gmail.com
- Județ: Cluj
- Școală: *(de completat)*
- Clasă: *(de completat)*

---

## Plan de prezentare orală

### Structură recomandată (7–10 minute)

**1. Opening — problema (30 sec)**
> *„Notițele izolate nu au valoare prin ele însele — valoarea apare din conexiunile dintre ele. Mently le face vizibile automat."*
- Deschizi pagina goală pe ecran, storage curat

**2. Demo adăugare notițe (2 min)**
- Adaugă 5–6 notițe cu tag-uri suprapuse (ex: `matematică`, `algoritmică`, `complexitate`)
- Graful se construiește live la fiecare notița adăugată — juriul vede muchiile apărând automat
- Subliniezi: *„Nu am trasat nicio muchie manual — ele apar din tag-urile comune"*

**3. Interacțiune graf (1.5 min)**
- Drag pe nod, click pe tag (highlight componentă BFS)
- Click pe nod → deschide panoul → buton Focus → step-through BFS prev/next → Esc
- Subliniezi: *„Focus mode traversează subarborele BFS al nodului selectat"*

**4. Tasks + Export/Import (1 min)**
- Marchează 2 notițe `isTask` → contor Tasks 2/2 → toggle done
- Export JSON → descarcă fișierul → deschide în text editor → JSON valid
- Import același fișier → notițele revin

**5. Arhitectura — schema pe straturi (1.5 min)**
- Arăți schema din `RAPORT.md`: 4 straturi (Presentation / Domain / Data / Cross-cutting)
- Menționezi: Observer, Mediator, Composition Root
- Subliniezi: *„Zero framework, zero NPM, zero build step — totul e transparent"*

**6. Demo securitate live în DevTools (1 min)**
- Deschizi Console, rulezi cele 3 comenzi din secțiunea Securitate de mai sus
- XSS → textul literal vizibil, scriptul nu rulează
- Prototype pollution → 0 notițe importate
- Rate limiter → mesaj de eroare după 30 inserări

**7. Design + accesibilitate (30 sec)**
- Tab navigation live: Tab prin sidebar → toate elementele primesc focus ring
- Resize la mobile (Chrome DevTools) → drawer apare cu hamburger

**8. Closing (30 sec)**
> *„Mently demonstrează că un produs complet — grafuri, securitate, accesibilitate — se poate construi fără niciun framework, cu zero dependențe externe în cod."*

---

### Întrebări frecvente ale juriului + răspunsuri pregătite

**„De ce nu ai folosit React/Vue?"**
> Vanilla JS permite să demonstrez că înțeleg ce se întâmplă la fiecare nivel — nu am ascuns logica în abstractizări de framework. Observer pattern implementat manual e mai valoros ca demonstrație decât useState.

**„Cum funcționează graful?"**
> Muchiile nu sunt stocate — sunt derivate la runtime dintr-un inverted index `tag → Set<noteId>`. La fiecare schimbare de date, reconstruiesc adjency map-ul în O(t · Σk²) în loc de O(n²) naiv.

**„Ce face algoritmul de layout?"**
> Fruchterman-Reingold cu trei forțe: repulsie Coulomb între toate nodurile, atracție Hooke pe muchii, centering spre viewport. Integrare Euler cu alpha decay — graful converge dar se reîncălzește la interacțiune.

**„Cum e securizat față de XSS?"**
> Defense in Depth: sanitizare la input (security.js), escapeHtml la orice innerHTML, CSP care blochează scripturi din domenii externe. Demonstrabil live în consolă.

**„Datele sunt în siguranță în localStorage?"**
> localStorage e tratată ca untrusted — la fiecare boot, datele sunt revalidate per câmp (schema check + type check + length check). Dacă cineva modifică manual, valorile invalide sunt stripped.

**„De ce Tailwind?"**
> Ca limbaj de utilități pentru layout și culori — analogul CSS al printf. Designul (compoziția, paleta, animațiile) e 100% propriu. Canvas rendering-ul, sistemul solar vizual, focus spotlight-ul — totul e cod custom.

**„Aplicația funcționează offline?"**
> Da, după prima accesare. Tailwind și Google Fonts intră în cache-ul browserului. localStorage e 100% local. Zero request-uri la server pentru funcționalitate.

**„Ce ar fi mai departe?"**
> Sync între dispozitive (WebRTC peer-to-peer sau un backend minimal), exportul grafului ca imagine SVG, un mode de prezentare cu slideshow generat automat din BFS.
