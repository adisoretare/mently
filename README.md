# Mently — Graf vizual de cunoștințe

## Informații generale

*   **Categorie:** Web
*   **Județul:** Cluj
*   **Surse:** [GitHub — adisoretare/mently](https://github.com/adisoretare/mently)
*   **Homepage:** [https://mently-xi.vercel.app/](https://mently-xi.vercel.app/)

---

## Descriere

Mently este o platformă web inovatoare dedicată managementului personal al cunoștințelor, care transformă notițele fragmentate într-o hartă mentală interactivă și dinamică. Obiectivul principal al site-ului este de a ajuta utilizatorii să vizualizeze conexiunile ascunse dintre ideile lor, fără efortul de a trasa manual legături, oferind o experiență de organizare explorabilă și intuitivă.

Pe Mently, utilizatorii adaugă notițe cu un titlu, o descriere și tag-uri relevante. Aplicația preia aceste date și derivă automat legăturile semantice din tag-urile comune, generând în timp real un graf vizual animat. Sistemul grupează vizual informația sub forma unui „sistem solar” – nodul cu cele mai multe conexiuni devine „soarele” categoriei sale, iar celelalte devin planete pe diverse orbite. Această abordare permite oricărui student sau cercetător să observe imediat ce concepte se suprapun și să descopere clustere de subiecte fără a le căuta explicit.

Inspirat de modul reticular în care funcționează însăși memoria umană, Mently oferă utilizatorilor nu doar un simplu carnețel digital, ci un mediu de descoperire. Platforma îmbină organizarea clasică (liste, task-uri, statistici) cu reprezentarea spațială, reflectând structura complexă a cunoștințelor unui utilizator.

Prin combinarea acestor elemente – automatizarea conexiunilor semantice, randarea fizică a grafurilor la 60fps și o arhitectură 100% offline, fără server – Mently se diferențiază clar pe piață. Nu necesită conturi, nu colectează date în cloud și oferă o viteză instantanee, fiind un instrument digital transparent, sigur și complet orientat spre utilizator.

---

## Tehnologii

### Descriere Tehnică – Mently

#### Arhitectură Tehnică
**Stack Tehnologic:**
*   **Frontend logic:** Vanilla JavaScript ES6+ (module native, zero framework-uri)
*   **Bază de date:** `localStorage` cu schemă JSON versionată (offline-first)
*   **Interfață & Markup:** HTML5 cu ARIA semantic, Tailwind CSS v3.4 (pre-compilat) și CSS personalizat
*   **Rendering vizual:** HTML5 Canvas 2D
*   **Algoritmi layout:** Implementare proprie a simulării fizice Fruchterman-Reingold
*   **Build Tool:** `npx tailwindcss --minify` (doar pentru CSS, zero build step pentru JS)
*   **Deployment:** Vercel (CDN edge global, HTTPS automat)

#### Structura Aplicației

**Model de Date (State & Persistență)**
*   **Store (`store.js`):** Gestionarea stării aplicației prin pattern-ul Observer (pub/sub), cu persistență automată în localStorage.
*   **Entități principale:** Notițe (titlu, descriere, tag-uri), Task-uri (notițe cu flag-ul `isTask`), Istoric progres.

**Logică de Business (Domain Logic)**
*   **Graph Engine (`graph.js`):** Construcția dinamică a muchiilor folosind un *inverted index* pentru optimizarea complexității. Rulează algoritmi BFS pentru descoperirea componentelor conexe.
*   **Physics Simulator (`physics.js`):** Motor fizic care calculează repulsia (tip Coulomb), atracția pe muchii (tip Hooke) și centrarea pe ecran, integrat prin metoda Euler.
*   **URL Synchronizer (`url-hash.js`):** Sincronizare bidirecțională între elementul selectat din graf și deep linking prin hash-ul URL-ului.

**Prezentare (Controllere UI & Canvas)**
*   **UI Mediator (`ui.js`):** Orchestrează comunicarea între panoul lateral (lista de notițe, formular) și vizualizarea grafică.
*   **Canvas Renderer (`canvas.js`):** Gestionează desenarea nodurilor la 60fps, pointer events (hit-testing geometric) și efectele vizuale (puls, texturi planetare).
*   **Module UI specifice:** `ui-form` (editare/adaugare), `ui-tasks` (gestiune task-uri), `ui-voice` (input vocal).

**Servicii Transversale (Cross-Cutting)**
*   **Security Service (`security.js`):** Logica de sanitizare, evadare XSS și rate-limiting.
*   **i18n Proxy (`i18n.js`):** Sistem de traducere instantanee RO/EN prin ES6 Proxies.

---

### Funcționalități Principale

**Management Inteligent al Notițelor**
*   Creare, editare și ștergere rapidă de notițe.
*   Sistem de tag-uri inline (confirmare cu Enter) pentru categorizare.
*   Zonă separată pentru Task-uri cu toggle pentru progres.

**Generarea și Randarea Grafului Interactiv**
*   Crearea instantanee a muchiilor pe baza intersecției de tag-uri.
*   Simulare fizică fluidă: utilizatorii pot interacționa prin drag & drop cu orice nod.
*   Sistem solar vizual: evidențierea nodurilor centrale (Tier 0) și gruparea elementelor secundare pe orbite (Tier 1-3).

**Navigare și Descoperire**
*   **Focus mode:** Parcurgere tip "step-through" a unei componente conexe, cu un spotlight animat pe Canvas.
*   Filtrare pe tag-uri direct din interfață pentru a izola vizual doar un cluster de informații.

**Interacțiune Avansată**
*   Input vocal nativ (Web Speech API) integrat direct în formular, cu detecție automată a limbii selectate.
*   Sistem de Keyboard Shortcuts (activat cu tasta `?`) pentru navigare completă din tastatură.
*   Mod Fullscreen nativ pentru o experiență de tip white-board.
*   Export și import al întregii structuri de cunoștințe în format JSON.

---

### Caracteristici Tehnice Avansate

*   **Securitate Defense in Depth:** 5 straturi de protecție. Validare la input, `escapeHtml()` la randare, protecție împotriva Prototype Pollution la importul de JSON și un Rate Limiter local pentru a preveni crash-urile prin DoS (limitat la 1000 noduri).
*   **Accesibilitate (WCAG 2.1 AA):** Focus trap perfect pentru meniurile mobile și modale, utilizarea ARIA live announcers pentru feedback-ul interfeței (ex: pornire/oprire dictare vocală) și respectarea preferinței de sistem `prefers-reduced-motion`.
*   **Performanță Algoritmică:** Evitarea complexității $O(n^2)$ la construirea muchiilor prin utilizarea indexării inverse, asigurând actualizări instantanee pe măsură ce utilizatorul tastează.
*   **Internationalizare (i18n):** Arhitectură eficientă de schimbare a limbii din mers, cu un dicționar complet stocat local.

---

## Cerințe sistem

Pentru utilizarea platformei:
*   Browser web modern cu suport pentru module native ES6 (Chrome, Firefox, Safari, Edge etc.)
*   Conexiune la internet doar pentru prima încărcare (descărcarea fonturilor)
*   *Platforma funcționează offline ulterior, iar input-ul vocal necesită permisiune pentru microfon.*

---

## Realizatori

* **Antonie Adrian**
  * **Școală:** Liceul de Informatică „Tiberiu Popoviciu”
  * **Clasă:** a 10-a
  * **Județ:** Cluj
  * **Oraș:** Cluj-Napoca
* **Neș Damian**
  * **Școală:** Liceul de Informatică „Tiberiu Popoviciu”
  * **Clasă:** a 10-a
  * **Județ:** Cluj
  * **Oraș:** Cluj-Napoca
