# Mently — Graf vizual de cunoștințe

## Informații generale

*   **Categorie:** Web
*   **Județul:** Cluj
*   **Surse:** [GitHub — adisoretare/mently](https://github.com/adisoretare/mently)
*   **Homepage:** [https://mently-xi.vercel.app/](https://mently-xi.vercel.app/)

---

## Descriere

Mently este o platformă web inovatoare dedicată managementului personal al cunoștințelor, care transformă notițele fragmentate într-o hartă mentală interactivă și dinamică. Obiectivul principal al site-ului este de a ajuta utilizatorii să vizualizeze conexiunile ascunse dintre ideile lor, fără efortul de a trasa manual legături, oferind o experiență de organizare explorabilă și intuitivă.

Pe Mently, utilizatorii adaugă notițe cu un titlu, o descriere, tag-uri relevante și fișiere atașate (PDF-uri, texte, imagini — de exemplu un eseu pentru BAC). Aplicația preia aceste date și derivă automat legăturile semantice din tag-urile comune, generând în timp real un graf vizual animat. Sistemul grupează vizual informația sub forma unui „sistem solar" — centroidul fiecărei componente conexe devine „soarele" categoriei sale, iar celelalte noduri devin planete pe diverse orbite. Această abordare permite oricărui student sau cercetător să observe imediat ce concepte se suprapun și să descopere clustere de subiecte fără a le căuta explicit.

Inspirat de modul reticular în care funcționează însăși memoria umană, Mently oferă utilizatorilor nu doar un simplu carnețel digital, ci un mediu de descoperire. Platforma îmbină organizarea clasică (liste, task-uri, căutare full-text, statistici) cu reprezentarea spațială, reflectând structura complexă a cunoștințelor unui utilizator.

Prin combinarea acestor elemente — automatizarea conexiunilor semantice, randarea fizică a grafurilor la 60fps, aplicație instalabilă (PWA) care funcționează integral offline și o arhitectură 100% fără server — Mently se diferențiază clar. Nu necesită conturi, nu colectează date în cloud și oferă o viteză instantanee, fiind un instrument digital transparent, sigur și complet orientat spre utilizator.

**Zero dependențe: fiecare linie de cod din aplicație este scrisă de autori.** Nu există framework-uri runtime, biblioteci externe sau componente preluate — de la simularea fizică și algoritmii de graf până la stratul de securitate și service worker-ul offline.

---

## Rulare locală și teste

Aplicația e un site static — orice server de fișiere funcționează:

```bash
git clone https://github.com/adisoretare/mently && cd mently

# opțiunea 1
python -m http.server 8080
# opțiunea 2
npx serve .

# apoi deschide http://localhost:8080
```

**Teste automate** (103 teste unitare, zero dependențe — runner-ul nativ din Node.js ≥ 20):

```bash
node --test tests/*.test.mjs
```

Testele acoperă modulele pure: algoritmii de graf (`graph.js`), simularea fizică (`physics.js`), stratul de securitate (`security.js` — inclusiv vectori de prototype pollution și XSS), store-ul cu undo/redo (`store.js`) și căutarea cu diacritice (`search.js`). Rulează automat la fiecare push prin GitHub Actions (`.github/workflows/test.yml`).

**Build CSS** (doar la modificarea claselor Tailwind; JS nu are build step):

```bash
npx tailwindcss -i tailwind-input.css -o tailwind.css --minify
```

---

## Tehnologii

### Arhitectură Tehnică

**Stack Tehnologic:**
*   **Frontend logic:** Vanilla JavaScript ES6+ (module native, zero framework-uri)
*   **Persistență pe două niveluri:** `localStorage` cu schemă JSON versionată (metadata notițe) + `IndexedDB` (fișierele atașate, ca Blob-uri binare)
*   **Interfață & Markup:** HTML5 cu ARIA semantic, Tailwind CSS v3.4 (pre-compilat) și CSS personalizat
*   **Rendering vizual:** HTML5 Canvas 2D cu zoom/pan/pinch (transformare `screen = world × zoom + viewport`)
*   **Algoritmi:** implementări proprii — Fruchterman-Reingold (layout), centroid de arbore (alegerea „soarelui"), BFS (componente conexe, adâncimi), inverted index (derivarea muchiilor), folding Unicode NFD (căutare fără diacritice)
*   **Offline / PWA:** service worker scris de mână (precache app shell, cache-first) + `manifest.webmanifest` → aplicație instalabilă
*   **Fonturi self-hosted:** subseturi woff2 latin + latin-ext servite de pe același origin — zero request-uri externe la runtime
*   **Testare:** `node:test` (runner-ul nativ Node) + CI GitHub Actions
*   **Build Tool:** `npx tailwindcss --minify` (doar pentru CSS, zero build step pentru JS)
*   **Deployment:** Vercel (CDN edge global, HTTPS automat, headere de securitate din `vercel.json`)

### Structura Aplicației

```
index.html ──► main.js (composition root) ──► ui.js (Mediator)
                                                ├── ui-form.js       add/edit + atașamente + voice input
                                                ├── ui-list.js       carduri + căutare + export/import
                                                ├── ui-tasks.js      task manager
                                                ├── ui-node-panel.js panou nod (atașamente, TTS, acțiuni)
                                                ├── ui-drawer.js     drawer mobil (focus trap)
                                                ├── ui-shortcuts.js  modal scurtături (focus trap)
                                                ├── ui-fullscreen.js mod ecran complet
                                                ├── canvas.js        randare Canvas 2D + zoom/pan/pinch
                                                ├── focus.js         focus mode (step-through)
                                                └── url-hash.js      deep linking (#node= / #tag=)

store.js       ──► stare + localStorage + undo/redo (Observer/pub-sub)
attachments.js ──► IndexedDB pentru fișiere (Blob) + GC orfani
graph.js       ──► algoritmi puri de graf (muchii, BFS, centroid, describeNode)
physics.js     ──► simulare forță Fruchterman-Reingold (pură)
search.js      ──► căutare full-text fără diacritice (pură)
security.js    ──► SINGURA sursă de validare: escapeHtml, sanitizare, allowlist fișiere, rate limiter
i18n.js        ──► RO/EN prin ES6 Proxy
dom.js         ──► aria-live + utilitare de focus
sw.js          ──► service worker (offline)
```

**Model de Date (State & Persistență)**
*   **Store (`store.js`):** starea aplicației prin pattern-ul Observer (pub/sub), persistență automată în localStorage, **undo/redo prin stivă de snapshot-uri** (`structuredClone`, cap 50).
*   **Atașamente (`attachments.js`):** arhitectură pe două niveluri — metadata (mică) rămâne în starea din localStorage, conținutul binar (mare) în IndexedDB; blob-urile orfane sunt curățate la pornire, compatibil cu undo.
*   **Entități:** Notițe (titlu, descriere, tag-uri, atașamente), Task-uri (notițe cu flag `isTask`).

**Logică de Business (Domain Logic — funcții pure, testate unitar)**
*   **Graph Engine (`graph.js`):** derivarea muchiilor printr-un *inverted index* (evită compararea naivă O(n²) a tuturor perechilor), BFS pentru componente conexe și adâncimi, **centroid de arbore** pentru alegerea „soarelui" fiecărei componente, `describeNode` pentru reprezentarea non-vizuală (accesibilitate).
*   **Physics Simulator (`physics.js`):** repulsie Coulomb, atracție Hooke pe muchii ponderată cu numărul de tag-uri comune, integrare Euler cu damping, **alpha cooling** — simularea se oprește singură când converge (economie majoră de CPU/baterie).
*   **Search (`search.js`):** folding Unicode NFD cu mapare de indexuri — „invatare" găsește „învățare", iar evidențierea `<mark>` cade exact pe caracterele originale.

**Prezentare (Controllere UI & Canvas)**
*   **UI Mediator (`ui.js`):** componentele nu se cunosc între ele; orchestrarea selecției bidirecționale sidebar ↔ canvas.
*   **Canvas Renderer (`canvas.js`):** 60fps cu rAF gate pe `document.hidden`, hit-testing sincronizat cu vizualul, zoom spre cursor, pinch cu două degete, pan pe spațiu gol.

---

### Funcționalități Principale

**Management Inteligent al Notițelor**
*   Creare, editare și ștergere rapidă de notițe; sistem de tag-uri inline (Enter).
*   **Fișiere atașate** (max 5 × 10 MB per notiță): PDF, text, Markdown, imagini — cu previzualizare inline, deschidere în tab nou și descărcare; allowlist strict de tipuri (html/svg/js interzise categoric).
*   **Căutare full-text insensibilă la diacritice** în titlu, conținut și tag-uri, cu evidențierea match-urilor.
*   **Undo/Redo** (Ctrl+Z / Ctrl+Shift+Z) pentru orice operație, inclusiv import și ștergere totală.
*   Zonă separată pentru Task-uri cu toggle pentru progres.

**Generarea și Randarea Grafului Interactiv**
*   Muchii create instant din intersecția de tag-uri; greutatea muchiei = numărul de tag-uri comune.
*   **Zoom (rotiță/butoane, 0.25×–3×), pan (drag pe spațiu gol) și pinch cu două degete** pe touch.
*   Simulare fizică fluidă cu drag & drop pe orice nod, corect la orice nivel de zoom.
*   Sistem solar vizual: soare = centroidul componentei; planete pe orbite după adâncimea BFS.

**Navigare și Descoperire**
*   **Focus mode:** parcurgere pas-cu-pas a subarborelui unui nod, cu spotlight animat.
*   Filtrare pe tag-uri; deep linking prin URL hash (`#node=`, `#tag=`), validat la intrare.

**Interacțiune Avansată & Acces Universal**
*   Input vocal (Web Speech API) pe titlu și descriere + **text-to-speech**: orice notiță poate fi citită cu voce tare în limba activă (ro-RO/en-US) — ambele direcții vocale.
*   Keyboard shortcuts (`?`), mod fullscreen, export/import JSON complet (inclusiv fișierele atașate, împachetate base64).
*   **PWA instalabilă**: după prima încărcare aplicația funcționează integral offline (service worker propriu).

---

### Caracteristici Tehnice Avansate

*   **Securitate Defense in Depth:** CSP strict `script-src 'self'` (fără `unsafe-inline`, fără `unsafe-eval`), dublat ca header HTTP în `vercel.json` (+ `frame-ancestors 'none'`); `escapeHtml()` la fiecare punct de randare; protecție Prototype Pollution la import și la hidratarea din localStorage (propriul storage e tratat ca untrusted); validarea input-ului din URL hash; allowlist strict pentru fișiere atașate cu tip MIME derivat din extensie (nu din declarația fișierului); sanitizare nume de fișiere anti path-traversal; rate limiter (30 inserări/min) și cap de 1000 noduri (anti-DoS).
*   **Testare:** 103 teste unitare pe modulele pure, rulate în CI la fiecare push. Testele au descoperit și corectat 2 bug-uri reale (regex-ul de tag-uri respingea ș/ț „comma below"; JSON corupt în localStorage dezactiva greșit persistența).
*   **Accesibilitate (WCAG 2.1 AA):** canvas-ul (aria-hidden) are reprezentare non-vizuală — la selecție se anunță contextul de graf („planetă a soarelui X, conectată cu…"), iar `#graph-summary` (sr-only) descrie structura pe grupuri; focus trap pe drawer și modale; aria-live pentru fiecare acțiune; `prefers-reduced-motion` respectat; `<html lang>` sincronizat cu limba activă; text-to-speech integrat.
*   **Performanță Algoritmică:** inverted index la construirea muchiilor; alpha cooling oprește simularea convergentă; rAF gate pe tab ascuns; DPR-aware canvas pentru ecrane HiDPI; căutare debounced cu montare statică a input-ului.
*   **Internaționalizare (i18n):** dicționar complet RO/EN prin ES6 Proxy; detecție automată a limbii browserului la prima vizită; limba persistată.

---

## Formatul JSON de export

```jsonc
{
  "version": 1,
  "notes": [
    {
      "id": "uuid-v4",
      "title": "string ≤ 200",
      "content": "string ≤ 10.000",
      "tags": ["string ≤ 32", "... max 10"],
      "attachments": [
        { "id": "uuid", "name": "eseu.pdf", "type": "application/pdf", "size": 12345, "addedAt": 1735689600000 }
      ],
      "createdAt": 1735689600000,
      "updatedAt": 1735689600000,
      "collapsed": false, "isTask": false, "done": false, "isSun": false
    }
  ],
  "meta": { "createdAt": 0, "updatedAt": 0, "lastExportAt": 0 },
  "files": { "<attachment-id>": "<base64>" }
}
```

La import, fiecare notă trece prin `validateNote()` (notele invalide sunt sărite, nu opresc importul), iar fișierele base64 sunt acceptate doar dacă sunt referențiate de un atașament valid și sub limita de 10 MB per fișier.

---

## Compatibilitate

| | Chrome/Edge | Firefox | Safari |
|---|---|---|---|
| Aplicația de bază | ✅ | ✅ | ✅ |
| PWA instalabilă + offline | ✅ | ✅ (offline, fără install prompt) | ✅ |
| Voice input (SpeechRecognition) | ✅ | ❌ (butonul se ascunde automat) | ✅ |
| Text-to-speech (speechSynthesis) | ✅ | ✅ | ✅ |
| Pinch zoom pe touch | ✅ | ✅ | ✅ |

Cerințe: browser modern cu module ES6. Conexiune la internet doar pentru prima încărcare — ulterior aplicația funcționează **integral offline** (fonturi self-hosted, service worker, date locale).

---

## Realizatori

* **Antonie Adrian**
  * **Școală:** Liceul de Informatică „Tiberiu Popoviciu"
  * **Clasă:** a 10-a
  * **Județ:** Cluj
  * **Oraș:** Cluj-Napoca
* **Neș Damian**
  * **Școală:** Liceul de Informatică „Tiberiu Popoviciu"
  * **Clasă:** a 10-a
  * **Județ:** Cluj
  * **Oraș:** Cluj-Napoca
