// Voice input wrapper over Web Speech API. Injects transcript into the title input.

import { t } from './i18n.js';
import { getCurrentLanguage } from './i18n.js';
import { announce } from './dom.js';

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

let btn = null;
let rec = null;
let isRecording = false;

export function init(titleInputEl) {
  if (!SpeechRec) return; // silently skip on unsupported browsers (e.g. Firefox)

  btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'voice-btn';
  btn.setAttribute('aria-label', t.voice.startLabel);
  btn.innerHTML = micIcon();

  btn.addEventListener('click', () => {
    isRecording ? stop() : start(titleInputEl);
  });

  // Insert button after the title input
  titleInputEl.insertAdjacentElement('afterend', btn);
}

function start(titleInputEl) {
  rec = new SpeechRec();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = getCurrentLanguage() === 'ro' ? 'ro-RO' : 'en-US';

  rec.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    titleInputEl.value = titleInputEl.value
      ? titleInputEl.value + ' ' + transcript
      : transcript;
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
