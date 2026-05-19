// Singura sursă de adevăr pentru toate string-urile vizibile. Orice text UI vine de aici.

const ro = {
  brand: 'Mently',
  tagline: 'Graf vizual de cunoștințe',

  stats: {
    nodes: 'Noduri',
    edges: 'Muchii',
    tags: 'Tag-uri',
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
    requiredHint: '(obligatoriu)',
    tagsAddedLabel: 'Tag-uri adăugate',
    removeTagLabel: (tag) => `Șterge tag ${tag}`,
  },

  list: {
    heading: 'Notițe',
    empty: 'Adaugă prima notiță cu tag-uri — conexiunile se construiesc singure.',
    emptyHero: 'Graful tău de cunoștințe te așteaptă.',
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

  sidebar: {
    collapse: 'Închide bara laterală',
    expand: 'Deschide bara laterală',
  },

  fullscreen: {
    enter: 'Mod ecran complet',
    exit: 'Ieși din ecran complet',
  },

  panel: {
    panelLabel: 'Detalii nod',
    closeLabel: 'Închide',
    setSunLabel: 'Setează ca soare',
    unsetSunLabel: 'Scoate soarele',
    collapseLabel: 'Comprimă copiii',
    expandLabel: 'Extinde copiii',
    markTaskLabel: 'Marchează ca task',
    unmarkTaskLabel: 'Scoate din taskuri',
    markDoneLabel: 'Finalizat',
    markUndoneLabel: 'Redeschide',
    editLabel: 'Editează',
    deleteLabel: 'Șterge',
    deleteConfirmLabel: 'Confirmă ștergerea',
    focusLabel: 'Focus',
    descriptionEmpty: 'Fără descriere.',
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
    sidebarCollapsed: 'Bara laterală închisă.',
    sidebarExpanded: 'Bara laterală deschisă.',
    fullscreenEntered: 'Mod ecran complet activ.',
    fullscreenExited: 'Mod ecran complet dezactivat.',
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
    // Mesaje pentru sistemul solar — când un nod devine soare temporar prin selecție.
    sunPromoted: (title) => `Centrul vizualizării este acum nodul "${title}".`,
    sunReset: 'Centrul vizualizării a revenit la nodul cel mai conectat.',
    // Node panel actions
    panelOpened: (title) => `Panoul nodului "${title}" este deschis.`,
    panelClosed: 'Panoul nodului este închis.',
    sunPinned: (title) => `Nodul "${title}" setat ca soare permanent.`,
    sunUnpinned: (title) => `Nodul "${title}" nu mai este soare permanent.`,
    collapsed: (title) => `Copiii nodului "${title}" au fost comprimați.`,
    expanded: (title) => `Copiii nodului "${title}" au fost extinși.`,
    markedTask: (title) => `Nodul "${title}" marcat ca task.`,
    unmarkedTask: (title) => `Nodul "${title}" scos din taskuri.`,
    markedDone: (title) => `Task-ul "${title}" finalizat.`,
    markedUndone: (title) => `Task-ul "${title}" redeschis.`,
    focusStarted: (title) => `Focus pornit pe nodul "${title}".`,
    focusStep: (i, total, title) => `Pasul ${i} din ${total}: ${title}.`,
    focusExited: 'Focus oprit.',
    tasksToggled: (expanded) => expanded ? 'Secțiunea Tasks extinsă.' : 'Secțiunea Tasks restrânsă.',
  },

  tasks: {
    heading: 'Tasks',
    count: (done, total) => `${done}/${total}`,
    showDone: 'Arată finalizate',
    hideDone: 'Ascunde finalizate',
    empty: 'Niciun task încă',
    ariaToggle: (expanded) => expanded ? 'Restrânge tasks' : 'Extinde tasks',
  },

  focus: {
    button: 'Focus',
    stepLabel: (i, total) => `Pasul ${i} / ${total}`,
    prev: 'Anterior',
    next: 'Următor',
    exit: 'Ieși',
    noPrereq: 'Nod izolat — fără prerechizite.',
    unavailable: 'Nodul nu mai există.',
  },

  meta: {
    blank: 'Nicio conexiune încă.',
    blankHint: 'Adaugă notițe cu tag-uri comune — conexiunile apar automat.',
  },
};

export const t = ro;