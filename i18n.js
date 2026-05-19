/**
 * i18n.js — Texte UI centralizate (singura sursă de adevăr pentru toate string-urile vizibile)
 * =============================================================================
 * DE CE există acest fișier:
 *   Fără el, string-urile sunt împrăștiate prin toată baza de cod. La o traducere
 *   sau o corecție de copie, ar trebui să cauți în 8 fișiere în loc de unul.
 *   Avantaj secundar: jurat/reviewer vede instantaneu TOT ce apare în UI.
 *
 * REGULA: orice text vizibil pentru utilizator trebuie să vină de aici.
 *   - console.warn/error sunt exceptate — sunt mesaje pentru dezvoltator.
 *   - Atributele aria-label din index.html au fallback static (fără JS),
 *     dar sunt suprascrise la boot de ui.js cu valorile din t.a11y.*.
 *
 * FUNCȚIILE cu parametri permit pluralizare context-aware fără bibliotecă.
 *   Ex: t.list.countMany(5) → "5 notițe"
 * =============================================================================
 */

const ro = {
  brand: 'Mently',
  // Tagline-ul apare în sidebar sub logo și în <title> pagină.
  // Era "Visual Knowledge Graph" — tradus complet pentru coerență vizuală.
  tagline: 'Graf vizual de cunoștințe',

  // ─── Statisticile din sidebar (4 carduri: noduri, muchii, tag-uri, grupuri) ───
  // Namespace separat ca să nu polueze `list` sau `a11y`.
  stats: {
    nodes: 'Noduri',
    edges: 'Muchii',
    tags: 'Tag-uri',
    // "Cmps" era abreviere opacă chiar și în engleză; "Grupuri" e mai clar.
    components: 'Grupuri',
  },

  form: {
    headingAdd: 'Adaugă un nod',
    headingEdit: 'Editezi',
    titleLabel: 'Titlu',
    titlePlaceholder: 'O idee, un concept, o întrebare…',
    contentLabel: 'Descriere',
    contentPlaceholder: 'Detaliază (opțional)',
    tagsLabel: 'Tag-uri',
    tagsPlaceholder: 'Scrie un tag și apasă Enter',
    tagsHint: 'Tag-urile comune devin muchii în graf.',
    submitAdd: 'Adaugă în graf',
    submitEdit: 'Salvează modificările',
    cancel: 'Renunță',
    optional: 'opțional',
    // Label-uri accesibilitate — anterior hardcodate în template-ul HTML din ui-form.js
    requiredHint: '(obligatoriu)',
    tagsAddedLabel: 'Tag-uri adăugate',
    removeTagLabel: (tag) => `Șterge tag ${tag}`,
  },

  list: {
    heading: 'Notițe',
    empty: 'Niciun nod încă. Folosește formularul de mai sus.',
    // Mesajul hero din starea goală (când nu există nicio notiță).
    // Înlocuiește "Empty mind, full potential." care rămăsese în engleză.
    emptyHero: 'Minte goală, potențial maxim.',
    countOne: '1 notiță',
    countMany: (n) => `${n} notițe`,
    editLabel: (title) => `Editează: ${title}`,
    deleteLabel: (title) => `Șterge: ${title}`,
    selectLabel: (title) => `Selectează: ${title}`,
    tagFilterLabel: (tag) => `Filtrează după tag: ${tag}`,
    clearFilterLabel: 'Anulează filtrul',
    // Eticheta "Filtru" din bara de filtru activ — era hardcodată în template
    filterLabel: 'Filtru',
    clearAll: 'Șterge tot graful',
    clearAllConfirm: 'Confirmă — click din nou',
    deleteConfirm: 'Confirmă ștergerea',
    exportBtn: 'Export',
    importBtn: 'Import',
  },

  errors: {
    titleRequired: 'Titlul este obligatoriu.',
    titleTooLong: 'Titlul depășește 200 de caractere.',
    contentTooLong: 'Descrierea depășește 10.000 de caractere.',
    tagsTooMany: 'Maxim 10 tag-uri per notiță.',
    duplicateTag: 'Tag-ul există deja în această notiță.',
    invalidTag: 'Tag invalid (folosește litere, cifre, cratimă).',
    importTooLarge: 'Fișier prea mare (maxim 5 MB).',
    importFailed: (msg) => `Import eșuat: ${msg}`,
    storageDisabled: 'Stocare locală indisponibilă — modificările nu vor fi păstrate la reîncărcare.',
    storageQuota: 'Stocare locală plină — eliberează spațiu sau exportă graful.',
    // Fallback generic când eroarea nu are mesaj specific
    unknown: 'Eroare necunoscută.',
    // Mesajele pentru store.js — injectate prin Store.setMessages() ca să nu
    // existe import circular (store.js nu importă i18n.js în mod deliberat).
    rateLimited: 'Prea multe inserări consecutive. Așteaptă câteva secunde.',
    notesCapReached: (max) => `Limită atinsă: maxim ${max} notițe.`,
  },

  drawer: {
    open: 'Deschide panoul de editare',
    close: 'Închide panoul',
  },

  a11y: {
    skipToGraph: 'Sari la graf',
    noteAdded: (title) => `Notița "${title}" a fost adăugată.`,
    noteUpdated: (title) => `Notița "${title}" a fost actualizată.`,
    noteDeleted: (title) => `Notița "${title}" a fost ștearsă.`,
    noteSelected: (title) => `Notița "${title}" este selectată.`,
    nodeSelected: (title) => `Nodul "${title}" este selectat.`,
    selectionCleared: 'Selecție anulată.',
    tagHighlighted: (tag) => `Componenta conexă pentru tag-ul "${tag}" este evidențiată.`,
    drawerOpened: 'Panou deschis.',
    drawerClosed: 'Panou închis.',
    editingStart: (title) => `Editezi notița "${title}".`,
    editingCancel: 'Editare anulată.',
    clearAllArmed: 'Confirmă ștergerea totală — click din nou pentru a continua.',
    clearAllDone: 'Graful a fost șters complet.',
    deleteArmed: (title) => `Confirmă ștergerea "${title}" — click din nou.`,
    exported: 'Graf exportat ca JSON.',
    imported: (count, skipped) => skipped > 0
      ? `${count} notițe importate, ${skipped} sărite.`
      : `${count} notițe importate.`,
    // Label-uri pentru regiunile ARIA din index.html — ui.js le aplică la boot.
    // index.html păstrează valori statice ca fallback pentru browsere fără JS.
    appLabel: 'Mently — graf vizual de cunoștințe',
    sidebarRegion: 'Editor de notițe',
    canvasRegion: 'Vizualizarea grafului de cunoștințe',
    statsRegion: 'Statistici graf',
    formRegion: 'Formular notițe',
  },

  meta: {
    // Textul hero din canvas-ul gol.
    // Era "A blank constellation." — rămas în engleză; tradus acum.
    blank: 'O constelație goală.',
    blankHint: 'Adaugă o notiță în panoul lateral — graful se construiește din tag-urile comune.',
  },
};

export const t = ro;