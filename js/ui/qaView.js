/**
 * PulseTube AI — Interactive Q&A Chat View
 */

import { escapeHtml } from '../utils/formatters.js';
import { renderRichStudyText } from './components.js';
import { dom } from './dom.js';

export function renderQaWelcome(videoTitle) {
  dom.qaMessages.innerHTML = `
    <div class="qa-msg assistant">
      Dossiê teórico carregado para <strong>${escapeHtml(videoTitle)}</strong> (modo econômico: <strong>~98% menos tokens</strong>).
      Pergunte sobre qualquer conceito, peça exercícios de fixação ou cite um minuto como <code>12:30</code> para inspecionar automaticamente só esse trecho do vídeo.
    </div>
  `;
}

export function appendQaMessage(role, htmlContent) {
  const div = document.createElement('div');
  div.className = `qa-msg ${role}`;
  div.innerHTML = htmlContent;
  dom.qaMessages.appendChild(div);
  dom.qaMessages.scrollTop = dom.qaMessages.scrollHeight;
  return div;
}

export function formatQaMarkdownWithTimestamps(text) {
  return renderRichStudyText(text);
}
