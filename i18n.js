// i18n.js — Internaționalizare (i18n = „internationalization”, 18 litere între i și n).
// Singura sursă de adevăr pentru toate string-urile vizibile. Orice text UI vine de aici.
// Două dicționare paralele (ro/en) cu exact aceeași structură de chei,
// plus un Proxy exportat ca `t` prin care restul aplicației citește textele.

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
    attachLabel: 'Fișiere atașate',
    attachAdd: 'Atașează fișier (PDF, text, imagine)',
    attachHint: 'Max 5 fișiere × 10 MB: pdf, txt, md, png, jpg, webp.',
    removeAttachLabel: (name) => `Elimină fișierul ${name}`,
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
    filterLabel: 'Filtru',
    clearAll: 'Șterge tot graful',
    clearAllConfirm: 'Confirmă — click din nou',
    deleteConfirm: 'Confirmă ștergerea',
    exportBtn: 'Export',
    importBtn: 'Import',
    searchPlaceholder: 'Caută în notițe…',
    searchLabel: 'Caută în notițe după titlu, conținut sau tag',
    searchNoResults: 'Nicio notiță nu se potrivește căutării.',
  },

  errors: {
    titleRequired: 'Titlul este obligatoriu.',
    titleTooLong: 'Titlul depășește 200 de caractere.',
    contentTooLong: 'Descrierea depășește 10.000 de caractere.',
    tagsTooMany: 'Maxim 10 tag-uri per notiță.',
    duplicateTag: 'Tag-ul există deja în această notiță.',
    invalidTag: 'Tag invalid (folosește litere, cifre, cratimă).',
    importTooLarge: 'Fișier prea mare (maxim 64 MB).',
    importFailed: (msg) => `Import eșuat: ${msg}`,
    attachInvalidType: (name) => `Tip de fișier nepermis: ${name}. Acceptate: pdf, txt, md, png, jpg, webp.`,
    attachTooLarge: (name) => `Fișierul ${name} depășește 10 MB.`,
    attachTooMany: (max) => `Maxim ${max} fișiere per notiță.`,
    attachStoreFailed: 'Fișierul nu a putut fi salvat local (stocare indisponibilă).',
    storageDisabled: 'Stocare locală indisponibilă — modificările nu vor fi păstrate la reîncărcare.',
    storageQuota: 'Stocare locală plină — eliberează spațiu sau exportă graful.',
    unknown: 'Eroare necunoscută.',
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
    attachmentsHeading: 'Fișiere atașate',
    attachPreviewLabel: (name) => `Previzualizează ${name}`,
    attachOpenLabel: (name) => `Deschide ${name} în tab nou`,
    attachDownloadLabel: (name) => `Descarcă ${name}`,
    attachMissing: 'Fișierul lipsește din stocarea locală.',
    readAloudLabel: 'Citește cu voce tare',
    stopReadingLabel: 'Oprește citirea',
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
    appLabel: 'Mently — graf vizual de cunoștințe',
    sidebarRegion: 'Editor de notițe',
    canvasRegion: 'Vizualizarea grafului de cunoștințe',
    statsRegion: 'Statistici graf',
    formRegion: 'Formular notițe',
    sunPromoted: (title) => `Centrul vizualizării este acum nodul "${title}".`,
    sunReset: 'Centrul vizualizării a revenit la nodul cel mai conectat.',
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
    searchResults: (n) => n === 1 ? '1 rezultat găsit.' : `${n} rezultate găsite.`,
    attachmentAdded: (name) => `Fișierul "${name}" a fost atașat.`,
    attachmentRemoved: (name) => `Fișierul "${name}" a fost eliminat.`,
    nodeContext: (d) => {
      if (!d) return '';
      if (d.neighborCount === 0) return 'Nod izolat, fără conexiuni.';
      const who = d.isSun
        ? `Soarele grupului său de ${d.componentSize} notițe.`
        : (d.sunTitle ? `Planetă a soarelui "${d.sunTitle}", grup de ${d.componentSize} notițe.` : `Grup de ${d.componentSize} notițe.`);
      const conns = d.neighbors
        .map((n) => n.sharedTags.length ? `"${n.title}" (${n.sharedTags.join(', ')})` : `"${n.title}"`)
        .join(', ');
      const rest = d.neighborCount > d.neighbors.length ? ` și încă ${d.neighborCount - d.neighbors.length}` : '';
      return `${who} Conectat cu ${conns}${rest}.`;
    },
    graphSummaryLabel: 'Structura grafului',
    graphSummaryGroup: (i, size, sun) => `Grupul ${i}: ${size} notițe, soare "${sun}"`,
    graphSummaryIsolated: (n) => `${n} noduri izolate`,
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

  lang: {
    switchTo: 'EN',
    switchLabel: 'Switch to English',
  },

  zoomCtrl: {
    zoomIn: 'Mărește graful',
    zoomOut: 'Micșorează graful',
    reset: 'Resetează vizualizarea',
    recenter: 'Recentrează graful în ecran',
  },

  history: {
    undoLabel: 'Anulează ultima acțiune (Ctrl+Z)',
    redoLabel: 'Refă acțiunea anulată (Ctrl+Shift+Z)',
    undone: 'Acțiune anulată.',
    redone: 'Acțiune refăcută.',
  },

  theme: {
    toggleLabel: 'Toggle theme',
    lightLabel: 'Light mode',
    darkLabel: 'Dark mode',
  },

  voice: {
    startLabel: 'Start voice input',
    stopLabel: 'Stop voice input',
    started: 'Voice input started.',
    stopped: 'Voice input stopped.',
    unsupported: 'Voice input not supported in this browser.',
  },

  shortcuts: {
    title: 'Scurtături de tastatură',
    close: 'Închide',
    rows: {
      help: 'Ajutor scurtături',
      close: 'Închide / anulează',
      navigate: 'Navighează elementele',
      activate: 'Activează selecția',
      focusPrev: 'Mod focus — anterior',
      focusNext: 'Mod focus — următor',
      fullscreen: 'Ecran complet',
      undo: 'Anulează acțiunea',
      redo: 'Refă acțiunea',
    },
  },
};

const en = {
  brand: 'Mently',
  tagline: 'Visual knowledge graph',

  stats: {
    nodes: 'Nodes',
    edges: 'Edges',
    tags: 'Tags',
    components: 'Groups',
  },

  form: {
    headingAdd: 'Add a node',
    headingEdit: 'Editing',
    titleLabel: 'Title',
    titlePlaceholder: 'An idea, concept, or question…',
    contentLabel: 'Description',
    contentPlaceholder: 'Add details (optional)',
    tagsLabel: 'Tags',
    tagsPlaceholder: 'Type a tag and press Enter',
    tagsHint: 'Shared tags become edges in the graph.',
    submitAdd: 'Add to graph',
    submitEdit: 'Save changes',
    cancel: 'Cancel',
    optional: 'optional',
    requiredHint: '(required)',
    tagsAddedLabel: 'Added tags',
    removeTagLabel: (tag) => `Remove tag ${tag}`,
    attachLabel: 'Attached files',
    attachAdd: 'Attach file (PDF, text, image)',
    attachHint: 'Max 5 files × 10 MB: pdf, txt, md, png, jpg, webp.',
    removeAttachLabel: (name) => `Remove file ${name}`,
  },

  list: {
    heading: 'Notes',
    empty: 'Add your first note with tags — connections build themselves.',
    emptyHero: 'Your knowledge graph awaits.',
    countOne: '1 note',
    countMany: (n) => `${n} notes`,
    editLabel: (title) => `Edit: ${title}`,
    deleteLabel: (title) => `Delete: ${title}`,
    selectLabel: (title) => `Select: ${title}`,
    tagFilterLabel: (tag) => `Filter by tag: ${tag}`,
    clearFilterLabel: 'Clear filter',
    filterLabel: 'Filter',
    clearAll: 'Clear entire graph',
    clearAllConfirm: 'Confirm — click again',
    deleteConfirm: 'Confirm deletion',
    exportBtn: 'Export',
    importBtn: 'Import',
    searchPlaceholder: 'Search notes…',
    searchLabel: 'Search notes by title, content or tag',
    searchNoResults: 'No notes match your search.',
  },

  errors: {
    titleRequired: 'Title is required.',
    titleTooLong: 'Title exceeds 200 characters.',
    contentTooLong: 'Description exceeds 10,000 characters.',
    tagsTooMany: 'Maximum 10 tags per note.',
    duplicateTag: 'Tag already exists in this note.',
    invalidTag: 'Invalid tag (use letters, digits, hyphens).',
    importTooLarge: 'File too large (max 64 MB).',
    importFailed: (msg) => `Import failed: ${msg}`,
    attachInvalidType: (name) => `File type not allowed: ${name}. Accepted: pdf, txt, md, png, jpg, webp.`,
    attachTooLarge: (name) => `File ${name} exceeds 10 MB.`,
    attachTooMany: (max) => `Maximum ${max} files per note.`,
    attachStoreFailed: 'File could not be saved locally (storage unavailable).',
    storageDisabled: 'Local storage unavailable — changes will not persist on reload.',
    storageQuota: 'Local storage full — free up space or export the graph.',
    unknown: 'Unknown error.',
    rateLimited: 'Too many inserts in a row. Please wait a moment.',
    notesCapReached: (max) => `Limit reached: maximum ${max} notes.`,
  },

  drawer: {
    open: 'Open editor panel',
    close: 'Close panel',
  },

  sidebar: {
    collapse: 'Collapse sidebar',
    expand: 'Expand sidebar',
  },

  fullscreen: {
    enter: 'Enter fullscreen',
    exit: 'Exit fullscreen',
  },

  panel: {
    panelLabel: 'Node details',
    closeLabel: 'Close',
    setSunLabel: 'Set as sun',
    unsetSunLabel: 'Unset sun',
    collapseLabel: 'Collapse children',
    expandLabel: 'Expand children',
    markTaskLabel: 'Mark as task',
    unmarkTaskLabel: 'Remove from tasks',
    markDoneLabel: 'Mark done',
    markUndoneLabel: 'Reopen',
    editLabel: 'Edit',
    deleteLabel: 'Delete',
    deleteConfirmLabel: 'Confirm deletion',
    focusLabel: 'Focus',
    descriptionEmpty: 'No description.',
    attachmentsHeading: 'Attached files',
    attachPreviewLabel: (name) => `Preview ${name}`,
    attachOpenLabel: (name) => `Open ${name} in new tab`,
    attachDownloadLabel: (name) => `Download ${name}`,
    attachMissing: 'File is missing from local storage.',
    readAloudLabel: 'Read aloud',
    stopReadingLabel: 'Stop reading',
  },

  a11y: {
    skipToGraph: 'Skip to graph',
    noteAdded: (title) => `Note "${title}" added.`,
    noteUpdated: (title) => `Note "${title}" updated.`,
    noteDeleted: (title) => `Note "${title}" deleted.`,
    noteSelected: (title) => `Note "${title}" selected.`,
    nodeSelected: (title) => `Node "${title}" selected.`,
    selectionCleared: 'Selection cleared.',
    tagHighlighted: (tag) => `Connected component for tag "${tag}" highlighted.`,
    drawerOpened: 'Panel opened.',
    drawerClosed: 'Panel closed.',
    sidebarCollapsed: 'Sidebar collapsed.',
    sidebarExpanded: 'Sidebar expanded.',
    fullscreenEntered: 'Fullscreen mode active.',
    fullscreenExited: 'Fullscreen mode deactivated.',
    editingStart: (title) => `Editing note "${title}".`,
    editingCancel: 'Edit cancelled.',
    clearAllArmed: 'Confirm full deletion — click again to proceed.',
    clearAllDone: 'Graph cleared.',
    deleteArmed: (title) => `Confirm deletion of "${title}" — click again.`,
    exported: 'Graph exported as JSON.',
    imported: (count, skipped) => skipped > 0
      ? `${count} notes imported, ${skipped} skipped.`
      : `${count} notes imported.`,
    appLabel: 'Mently — visual knowledge graph',
    sidebarRegion: 'Note editor',
    canvasRegion: 'Knowledge graph visualization',
    statsRegion: 'Graph statistics',
    formRegion: 'Note form',
    sunPromoted: (title) => `Visualization center is now node "${title}".`,
    sunReset: 'Visualization center returned to the most connected node.',
    panelOpened: (title) => `Node panel "${title}" opened.`,
    panelClosed: 'Node panel closed.',
    sunPinned: (title) => `Node "${title}" set as permanent sun.`,
    sunUnpinned: (title) => `Node "${title}" is no longer the permanent sun.`,
    collapsed: (title) => `Children of node "${title}" collapsed.`,
    expanded: (title) => `Children of node "${title}" expanded.`,
    markedTask: (title) => `Node "${title}" marked as task.`,
    unmarkedTask: (title) => `Node "${title}" removed from tasks.`,
    markedDone: (title) => `Task "${title}" completed.`,
    markedUndone: (title) => `Task "${title}" reopened.`,
    focusStarted: (title) => `Focus started on node "${title}".`,
    focusStep: (i, total, title) => `Step ${i} of ${total}: ${title}.`,
    focusExited: 'Focus stopped.',
    tasksToggled: (expanded) => expanded ? 'Tasks section expanded.' : 'Tasks section collapsed.',
    searchResults: (n) => n === 1 ? '1 result found.' : `${n} results found.`,
    attachmentAdded: (name) => `File "${name}" attached.`,
    attachmentRemoved: (name) => `File "${name}" removed.`,
    nodeContext: (d) => {
      if (!d) return '';
      if (d.neighborCount === 0) return 'Isolated node, no connections.';
      const who = d.isSun
        ? `Sun of its group of ${d.componentSize} notes.`
        : (d.sunTitle ? `Planet of sun "${d.sunTitle}", group of ${d.componentSize} notes.` : `Group of ${d.componentSize} notes.`);
      const conns = d.neighbors
        .map((n) => n.sharedTags.length ? `"${n.title}" (${n.sharedTags.join(', ')})` : `"${n.title}"`)
        .join(', ');
      const rest = d.neighborCount > d.neighbors.length ? ` and ${d.neighborCount - d.neighbors.length} more` : '';
      return `${who} Connected to ${conns}${rest}.`;
    },
    graphSummaryLabel: 'Graph structure',
    graphSummaryGroup: (i, size, sun) => `Group ${i}: ${size} notes, sun "${sun}"`,
    graphSummaryIsolated: (n) => `${n} isolated nodes`,
  },

  tasks: {
    heading: 'Tasks',
    count: (done, total) => `${done}/${total}`,
    showDone: 'Show completed',
    hideDone: 'Hide completed',
    empty: 'No tasks yet',
    ariaToggle: (expanded) => expanded ? 'Collapse tasks' : 'Expand tasks',
  },

  focus: {
    button: 'Focus',
    stepLabel: (i, total) => `Step ${i} / ${total}`,
    prev: 'Previous',
    next: 'Next',
    exit: 'Exit',
    noPrereq: 'Isolated node — no prerequisites.',
    unavailable: 'Node no longer exists.',
  },

  meta: {
    blank: 'No connections yet.',
    blankHint: 'Add notes with shared tags — connections appear automatically.',
  },

  lang: {
    switchTo: 'RO',
    switchLabel: 'Schimbă în română',
  },

  zoomCtrl: {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    reset: 'Reset view',
    recenter: 'Recenter graph in view',
  },

  history: {
    undoLabel: 'Undo last action (Ctrl+Z)',
    redoLabel: 'Redo undone action (Ctrl+Shift+Z)',
    undone: 'Action undone.',
    redone: 'Action redone.',
  },

  theme: {
    toggleLabel: 'Toggle theme',
    lightLabel: 'Light mode',
    darkLabel: 'Dark mode',
  },

  voice: {
    startLabel: 'Start voice input',
    stopLabel: 'Stop voice input',
    started: 'Voice input started.',
    stopped: 'Voice input stopped.',
    unsupported: 'Voice input not supported in this browser.',
  },

  shortcuts: {
    title: 'Keyboard shortcuts',
    close: 'Close',
    rows: {
      help: 'Shortcuts help',
      close: 'Close / cancel',
      navigate: 'Navigate elements',
      activate: 'Activate selected',
      focusPrev: 'Focus mode — previous',
      focusNext: 'Focus mode — next',
      fullscreen: 'Fullscreen toggle',
      undo: 'Undo action',
      redo: 'Redo action',
    },
  },
};

const LANGS = { ro, en };
const LANG_KEY = 'mently:lang';
let currentLang = 'ro';

/**
 * Stabilește limba activă la pornire: preferința salvată, altfel limba browserului.
 * Apelată o singură dată, din main.js, înaintea oricărei randări de text.
 */
export function initLanguage() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && LANGS[saved]) {
    currentLang = saved;
  } else if (typeof navigator !== 'undefined' && navigator.language) {
    // Prima vizită fără preferință salvată: detectăm limba browserului.
    // ro/ro-RO → română; orice altceva → engleză (fallback internațional).
    currentLang = navigator.language.toLowerCase().startsWith('ro') ? 'ro' : 'en';
  }
  // <html lang> trebuie să reflecte limba reală — screen readerele aleg vocea
  // și regulile de pronunție pe baza lui. Guard: i18n.js e importabil headless (teste).
  if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLang;
  }
}

/**
 * Schimbă limba: salvează preferința și reîncarcă pagina.
 * Reload-ul e intenționat — e mult mai simplu și mai sigur decât să
 * re-randăm manual fiecare bucată de text din aplicație.
 * @param {string} lang — 'ro' sau 'en'; orice altceva e ignorat.
 */
export function setLanguage(lang) {
  if (!LANGS[lang]) return;
  localStorage.setItem(LANG_KEY, lang);
  location.reload();
}

/** Returnează codul limbii active ('ro' sau 'en'). */
export function getCurrentLanguage() {
  return currentLang;
}

// Un Proxy ES6 e un obiect care interceptează accesările de proprietăți printr-un
// „handler” — aici, capcana `get`. Când cineva scrie `t.form.headingAdd`, capcana
// e apelată cu cheia 'form' și returnează secțiunea din dicționarul limbii ACTIVE.
// DE CE: toate modulele importă aceeași referință `t` o singură dată; la schimbarea
// limbii textele se rezolvă corect fără re-import și fără să pasăm limba peste tot.
export const t = new Proxy({}, {
  get(_, key) {
    return LANGS[currentLang][key];
  },
});
