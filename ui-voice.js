/**
 * ui-voice.js — Dictare vocală pentru câmpul de titlu.
 * Folosește Web Speech API — un API nativ al browserului care transformă
 * vorbirea în text (speech-to-text), fără vreo bibliotecă externă.
 * Adaugă un buton cu microfon lângă input; transcrierea se lipește în câmp.
 * Pe browserele fără suport (ex: Firefox) modulul pur și simplu nu apare.
 */

import { t } from './i18n.js';
import { getCurrentLanguage } from './i18n.js';
import { announce } from './dom.js';

// Chrome/Edge expun API-ul cu prefixul „webkit”, de aceea verificăm ambele nume
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

let btn = null;
let rec = null;
let isRecording = false;

/**
 * Creează butonul de microfon și îl inserează după inputul de titlu.
 * @param {HTMLInputElement} titleInputEl — câmpul în care se injectează transcrierea.
 */
export function init(titleInputEl) {
  if (!SpeechRec) return; // ieșim în liniște pe browserele fără suport (ex: Firefox)

  btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'voice-btn';
  btn.setAttribute('aria-label', t.voice.startLabel);
  btn.innerHTML = micIcon();

  btn.addEventListener('click', () => {
    isRecording ? stop() : start(titleInputEl);
  });

  // Inserăm butonul imediat după inputul de titlu
  titleInputEl.insertAdjacentElement('afterend', btn);
}

function start(titleInputEl) {
  rec = new SpeechRec();
  rec.continuous = false;      // o singură frază, apoi se oprește singur
  rec.interimResults = false;  // nu vrem rezultate parțiale, doar transcrierea finală
  // Limba de recunoaștere urmează limba aleasă în aplicație
  rec.lang = getCurrentLanguage() === 'ro' ? 'ro-RO' : 'en-US';

  rec.onresult = (e) => {
    // Adăugăm transcrierea la textul existent (cu spațiu), nu îl suprascriem
    const transcript = e.results[0][0].transcript;
    titleInputEl.value = titleInputEl.value
      ? titleInputEl.value + ' ' + transcript
      : transcript;
    // Declanșăm manual evenimentul 'input' — setarea .value din JS nu îl emite,
    // iar restul aplicației (validare, contor) ascultă exact acest eveniment
    titleInputEl.dispatchEvent(new Event('input', { bubbles: true }));
  };

  rec.onend = () => setRecording(false);
  rec.onerror = () => setRecording(false);

  rec.start();
  setRecording(true);
  announce(t.voice.started);
}

function stop() {
  if (rec) { rec.stop(); rec = null; }
  setRecording(false);
  announce(t.voice.stopped);
}

// Ține în sincron starea internă cu aspectul butonului (clasă CSS + aria-label)
function setRecording(val) {
  isRecording = val;
  if (!btn) return;
  btn.classList.toggle('is-recording', val);
  btn.setAttribute('aria-label', val ? t.voice.stopLabel : t.voice.startLabel);
}

function micIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>`;
}
