/**
 * i18n.js — Texte UI centralizate
 * =============================================================================
 * Toate string-urile vizibile sunt aici. Permite localizare (en/ro/fr/…) cu
 * un singur fișier de tradus. Funcțiile cu parametri permit pluralizare.
 * =============================================================================
 */

const ro = {
  brand: 'Mently',
  tagline: 'Visual Knowledge Graph',

  form: {
    heading: 'Adaugă un nod',
    titleLabel: 'Titlu',
    titlePlaceholder: 'O idee, un concept, o întrebare…',
    contentLabel: 'Descriere',
    contentPlaceholder: 'Detaliază (opțional)',
    tagsLabel: 'Tag-uri',
    tagsPlaceholder: 'Scrie un tag și apasă Enter',
    tagsHint: 'Tag-urile comune devin muchii în graf.',
    submit: 'Adaugă în graf',
    optional: 'opțional',
  },

  list: {
    heading: 'Notițe',
    empty: 'Niciun nod încă. Folosește formularul de mai sus.',
    countOne: '1 notiță',
    countMany: (n) => `${n} notițe`,
    deleteLabel: (title) => `Șterge: ${title}`,
    selectLabel: (title) => `Selectează: ${title}`,
    tagFilterLabel: (tag) => `Filtrează după tag: ${tag}`,
    clearFilterLabel: 'Anulează filtrul',
    filterActive: (tag) => `Filtru activ: ${tag}`,
  },

  errors: {
    titleRequired: 'Titlul este obligatoriu.',
    titleTooLong: 'Titlul depășește 200 de caractere.',
    contentTooLong: 'Descrierea depășește 10.000 de caractere.',
    tagsTooMany: 'Maxim 10 tag-uri per notiță.',
    duplicateTag: 'Tag-ul există deja în această notiță.',
    invalidTag: 'Tag invalid (folosește litere, cifre, cratimă).',
  },

  drawer: {
    open: 'Deschide panoul de editare',
    close: 'Închide panoul',
  },

  a11y: {
    skipToGraph: 'Sari la graf',
    noteAdded: (title) => `Notița "${title}" a fost adăugată.`,
    noteDeleted: (title) => `Notița "${title}" a fost ștearsă.`,
    noteSelected: (title) => `Notița "${title}" este selectată.`,
    nodeSelected: (title) => `Nodul "${title}" este selectat.`,
    selectionCleared: 'Selecție anulată.',
    tagHighlighted: (tag) => `Componenta conexă pentru tag-ul "${tag}" este evidențiată.`,
    drawerOpened: 'Panou deschis.',
    drawerClosed: 'Panou închis.',
  },

  meta: {
    blank: 'A blank constellation.',
    blankHint: 'Adaugă o notiță în panoul lateral — graful se construiește din tag-urile comune.',
  },
};

export const t = ro;