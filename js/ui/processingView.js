/**
 * PulseTube AI — Live Multimodal Processing Stage UI (Real-Time Stream Telemetry, No Auto-Switch)
 */

import { state } from '../state/store.js';
import { dom } from './dom.js';

let receivedFirstSignal = false;
let currentModelLabel = 'gemini';

export function startProcessingUi(isManualMode) {
  receivedFirstSignal = false;
  currentModelLabel = dom.modelSelector?.value || 'gemini';

  dom.analyzeSubmitBtn.disabled = true;
  dom.processingCard.classList.add('visible');
  dom.processingHeadline.textContent = isManualMode
    ? 'Processando transcrição e estruturando apostila teórica...'
    : `Enviando vídeo para ${currentModelLabel} e indexando quadros/áudio...`;

  if (dom.processingLivePill) {
    dom.processingLivePill.className = 'live-heartbeat-pill';
    dom.processingLivePill.textContent = 'Aguardando 1º sinal...';
  }
  if (dom.processingSubstatus) {
    dom.processingSubstatus.textContent = `Conectando diretamente ao modelo ${currentModelLabel} (sem troca automática de modelo)...`;
  }

  dom.step1.className = 'step-item active';
  dom.step2.className = 'step-item';
  dom.step3.className = 'step-item';

  const t0 = performance.now();
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    const elapsedNum = (performance.now() - t0) / 1000;
    const sec = elapsedNum.toFixed(1);
    dom.elapsedTimer.textContent = `${sec.padStart(4, '0')}s`;

    if (!receivedFirstSignal && elapsedNum > 25 && dom.processingSubstatus) {
      dom.processingSubstatus.textContent = `Aguardando fila/indexação do servidor Google para "${currentModelLabel}" (troca automática desativada — se passar de 60s sem 1º sinal, o modelo pode estar com pico de demanda HTTP 503).`;
      if (elapsedNum > 40 && dom.processingLivePill) {
        dom.processingLivePill.className = 'live-heartbeat-pill warn';
        dom.processingLivePill.textContent = 'Fila lenta no servidor...';
      }
    }
  }, 100);

  state.stepTimeouts.forEach(clearTimeout);
  state.stepTimeouts = [];
}

export function updateProcessingProgress(evt) {
  if (!evt) return;

  if (evt.phase === 'connecting') {
    receivedFirstSignal = false;
    currentModelLabel = evt.model || currentModelLabel;

    dom.step1.className = 'step-item active';
    dom.step2.className = 'step-item';
    dom.step3.className = 'step-item';

    if (dom.processingLivePill) {
      dom.processingLivePill.className = 'live-heartbeat-pill';
      dom.processingLivePill.textContent = 'Lendo vídeo...';
    }
    if (dom.processingSubstatus) {
      dom.processingSubstatus.textContent = `Modelo fixado: ${currentModelLabel} (${evt.variantLabel}) · aguardando resposta do Google...`;
    }
    return;
  }

  if (evt.phase === 'thinking') {
    receivedFirstSignal = true;
    dom.step1.className = 'step-item done';
    dom.step2.className = 'step-item active';
    dom.step3.className = 'step-item';

    dom.processingHeadline.textContent =
      'Vídeo lido! Organizando conceitos, definições e módulos da aula...';
    if (dom.processingLivePill) {
      dom.processingLivePill.className = 'live-heartbeat-pill alive';
      dom.processingLivePill.textContent = '● Sinal ativo (estruturando)';
    }
    if (dom.processingSubstatus) {
      dom.processingSubstatus.textContent = `${evt.model} respondeu · estruturando cobertura teórica sem lacunas...`;
    }
    return;
  }

  if (evt.phase === 'streaming') {
    receivedFirstSignal = true;
    dom.step1.className = 'step-item done';
    dom.step2.className = 'step-item done';
    dom.step3.className = 'step-item active';

    const chars = (evt.receivedChars || 0).toLocaleString('pt-BR');
    dom.processingHeadline.textContent = 'Recebendo resumo teórico ao vivo do Gemini...';

    if (dom.processingLivePill) {
      dom.processingLivePill.className = 'live-heartbeat-pill alive';
      dom.processingLivePill.textContent = `● Ao vivo · ${chars} chars`;
    }
    if (dom.processingSubstatus) {
      const topicInfo = evt.activeTopic ? ` · escrevendo: "${evt.activeTopic}"` : '';
      dom.processingSubstatus.textContent = `${evt.model} (${evt.variantLabel}) transmitindo dados normalmente${topicInfo}`;
    }
    return;
  }

  if (evt.phase === 'retrying') {
    receivedFirstSignal = false;
    if (dom.processingLivePill) {
      dom.processingLivePill.className = 'live-heartbeat-pill warn';
      dom.processingLivePill.textContent = 'Ajustando parâmetros...';
    }
    if (dom.processingSubstatus && evt.reason) {
      dom.processingSubstatus.textContent = evt.reason;
    }
  }
}

export function stopProcessingUi() {
  dom.analyzeSubmitBtn.disabled = false;
  clearInterval(state.timerInterval);
  state.stepTimeouts.forEach(clearTimeout);
  dom.processingCard.classList.remove('visible');
}
