/**
 * PulseTube AI — Application Entry Point & Main Controller
 * Integração direta com Google Gemini API (fileData.fileUri Multimodal + Plano B de Transcrição)
 */

import { DEFAULT_API_KEY, THINKING_BUDGET_BY_MODE } from './config/constants.js';
import {
  callGeminiMultimodal,
  discoverGeminiModels,
  probeGeminiModelHealth
} from './services/geminiService.js';
import {
  SUMMARY_RESPONSE_SCHEMA,
  buildQaRequestPlan,
  buildSummaryPrompt,
  normalizeSummaryPayload
} from './services/promptBuilder.js';
import {
  clearSavedApiKey,
  clearSavedHistory,
  getSavedApiKey,
  getSavedModel,
  getSavedTheme,
  saveApiKey,
  saveRecordToHistory,
  saveSelectedModel
} from './services/storageService.js';
import { extractYouTubeId } from './services/youtubeService.js';
import { state } from './state/store.js';
import { dom } from './ui/dom.js';
import { renderHistory } from './ui/historyView.js';
import { initMindMapEvents } from './ui/mindMapView.js';
import {
  hideError,
  setApiStatus,
  setTheme,
  showError,
  showToast
} from './ui/notifications.js';
import { previewDetectedUrl, seekVideoTo } from './ui/playerController.js';
import {
  startProcessingUi,
  stopProcessingUi,
  updateProcessingProgress
} from './ui/processingView.js';
import { appendQaMessage, formatQaMarkdownWithTimestamps } from './ui/qaView.js';
import { renderWorkspaceResult, switchTab } from './ui/summaryView.js';
import { escapeHtml } from './utils/formatters.js';
import {
  copyMarkdownToClipboard,
  downloadMarkdownFile
} from './utils/markdownExporter.js';

// =========================================================================
// Initialization
// =========================================================================
function sanitizeApiKeyInput(raw) {
  return (raw || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
}

function syncClearKeyBtnVisibility() {
  if (dom.clearApiKeyBtn) {
    dom.clearApiKeyBtn.style.display = state.apiKey ? 'inline-flex' : 'none';
  }
}

function setByokUnconfiguredUi() {
  setApiStatus('pending', 'Configurar API Key');
  syncClearKeyBtnVisibility();
  if (dom.modelHealthStrip) dom.modelHealthStrip.dataset.state = 'idle';
  if (dom.modelHealthDot) dom.modelHealthDot.className = 'status-dot';
  if (dom.modelHealthName) {
    dom.modelHealthName.textContent = dom.modelSelector?.value || 'gemini-3.6-flash';
  }
  if (dom.modelHealthBadge) {
    dom.modelHealthBadge.textContent = 'Modo BYOK · Chave não configurada';
  }
  if (dom.modelHealthMetrics) dom.modelHealthMetrics.textContent = '';
  if (dom.modelHealthDetail) {
    dom.modelHealthDetail.textContent =
      'Gere sua chave gratuita no Google AI Studio, cole no campo acima e clique em "Validar e salvar". Sua credencial fica salva apenas neste navegador.';
  }
}

function init() {
  const initialTheme = getSavedTheme();
  setTheme(initialTheme, { persist: false });

  const savedModel = getSavedModel();
  if (savedModel && Array.from(dom.modelSelector.options).some((o) => o.value === savedModel)) {
    dom.modelSelector.value = savedModel;
  }

  const savedKey = sanitizeApiKeyInput(getSavedApiKey());
  state.apiKey = savedKey || sanitizeApiKeyInput(DEFAULT_API_KEY);
  dom.apiKeyInput.value = state.apiKey;
  if (!savedKey && state.apiKey) {
    saveApiKey(state.apiKey);
  }
  syncClearKeyBtnVisibility();

  bindEvents();
  initMindMapEvents();
  selectSummaryMode(state.selectedMode);
  initScrollProgressFallback();
  renderHistory(handleSelectHistoryRecord);
  verifyAndSyncModels(false);
}

function selectSummaryMode(mode) {
  let activeLabel = '';
  dom.modePills.forEach((p) => {
    const isMatch = p.dataset.mode === mode;
    p.classList.toggle('active', isMatch);
    p.setAttribute('aria-pressed', String(isMatch));
    if (isMatch) {
      activeLabel = p.textContent.trim();
    }
  });
  state.selectedMode = mode;
  return activeLabel;
}

function initScrollProgressFallback() {
  if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()')) {
    return;
  }
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    dom.html.style.setProperty('--scroll-progress', ratio.toFixed(4));
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

function bindEvents() {
  // Theme toggle (with progressive View Transitions API)
  dom.themeToggleBtn.addEventListener('click', () => {
    const next = dom.html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduceMotion) {
      document.startViewTransition(() => setTheme(next));
    } else {
      setTheme(next);
    }
  });

  // Auto-dismiss mobile popover nav when an anchor is clicked
  const siteNav = document.getElementById('site-nav');
  siteNav?.addEventListener('click', (e) => {
    if (e.target.closest('a') && siteNav.matches(':popover-open')) {
      siteNav.hidePopover?.();
    }
  });

  // API Drawer (BYOK)
  dom.toggleApiDrawerBtn.addEventListener('click', () => {
    const isOpen = dom.apiDrawer.classList.toggle('open');
    dom.toggleApiDrawerBtn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen && !state.apiKey) {
      setTimeout(() => dom.apiKeyInput.focus(), 80);
    }
  });

  dom.peekApiKeyBtn.addEventListener('click', () => {
    dom.apiKeyInput.type = dom.apiKeyInput.type === 'password' ? 'text' : 'password';
  });

  const handleSaveApiKey = () => {
    const cleaned = sanitizeApiKeyInput(dom.apiKeyInput.value);
    if (!cleaned || cleaned.length < 20) {
      dom.apiKeyInput.focus();
      showToast('Cole uma chave Gemini API válida (ex.: AIzaSy...).');
      return;
    }
    dom.apiKeyInput.value = cleaned;
    state.apiKey = cleaned;
    saveApiKey(cleaned);
    syncClearKeyBtnVisibility();
    hideError();
    verifyAndSyncModels(true);
  };

  dom.saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
  dom.apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveApiKey();
    }
  });

  dom.clearApiKeyBtn?.addEventListener('click', () => {
    cancelActiveModelProbe();
    clearSavedApiKey();
    state.apiKey = '';
    dom.apiKeyInput.value = '';
    dom.apiKeyInput.type = 'password';
    setByokUnconfiguredUi();
    showToast('Chave Gemini removida deste navegador.');
  });

  dom.modelSelector.addEventListener('change', () => {
    const chosen = dom.modelSelector.value;
    saveSelectedModel(chosen);
    if (dom.modelHealthName) dom.modelHealthName.textContent = chosen;
    if (state.apiKey) {
      runModelHealthCheck(chosen, { notifyToast: false });
    }
  });

  dom.testModelBtn?.addEventListener('click', () => {
    if (activeProbeController) {
      cancelActiveModelProbe('Teste cancelado pelo usuário.');
      return;
    }
    const candidateKey = sanitizeApiKeyInput(dom.apiKeyInput.value) || state.apiKey;
    if (!candidateKey) {
      dom.apiKeyInput.focus();
      showToast('Cole sua chave gratuita do Google AI Studio antes de testar.');
      return;
    }
    if (candidateKey !== state.apiKey) {
      state.apiKey = candidateKey;
      saveApiKey(candidateKey);
      syncClearKeyBtnVisibility();
    }
    runModelHealthCheck(dom.modelSelector.value, { notifyToast: true });
  });

  // URL Input & Detection
  let detectDebounce = null;
  dom.urlInput.addEventListener('input', () => {
    const val = dom.urlInput.value.trim();
    dom.clearUrlBtn.style.display = val ? 'inline-flex' : 'none';
    clearTimeout(detectDebounce);
    detectDebounce = setTimeout(() => previewDetectedUrl(val), 220);
  });

  dom.pasteUrlBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        dom.urlInput.value = text.trim();
        dom.clearUrlBtn.style.display = 'inline-flex';
        previewDetectedUrl(text.trim());
      }
    } catch {
      dom.urlInput.focus();
      showToast('Use Ctrl+V ou Cmd+V para colar o link.');
    }
  });

  dom.clearUrlBtn.addEventListener('click', () => {
    dom.urlInput.value = '';
    dom.clearUrlBtn.style.display = 'none';
    dom.detectedStrip.classList.remove('visible');
    dom.urlInput.focus();
  });

  // Mode Selection Pills
  dom.modePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      selectSummaryMode(pill.dataset.mode);
    });
  });

  // Landing Page Mode Switcher Links (§03)
  dom.modeLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetMode = link.dataset.selectMode;
      if (!targetMode) return;
      e.preventDefault();
      const label = selectSummaryMode(targetMode);
      document.getElementById('resumir')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      dom.urlInput.focus({ preventScroll: true });
      if (label) {
        showToast(`Modo selecionado: ${label}`);
      }
    });
  });

  // Closing CTA Focus Link
  dom.focusInputLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('resumir')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      dom.urlInput.focus({ preventScroll: true });
    });
  });

  // Advanced / Fallback Drawer
  dom.toggleAdvancedBtn.addEventListener('click', () => {
    const open = dom.advancedDrawer.classList.toggle('open');
    dom.toggleAdvancedBtn.classList.toggle('active', open);
    dom.toggleAdvancedBtn.setAttribute('aria-expanded', String(open));
  });

  // 1-Click Sample Chips
  dom.sampleChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const sampleUrl = chip.dataset.url;
      dom.urlInput.value = sampleUrl;
      dom.clearUrlBtn.style.display = 'inline-flex';
      previewDetectedUrl(sampleUrl).then(() => {
        handleSummarizeSubmit();
      });
    });
  });

  // Error close & Cancel Active Analysis
  dom.closeErrorBtn.addEventListener('click', hideError);
  dom.cancelAnalyzeBtn?.addEventListener('click', () => {
    if (state.activeAbortController) {
      state.activeAbortController.abort();
      state.activeAbortController = null;
    }
    stopProcessingUi();
    showToast('Análise cancelada.');
  });

  // Main Form Submit
  dom.summarizeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSummarizeSubmit();
  });

  // Tabs (Summary, Mind Map & Q&A)
  dom.tabSummaryBtn.addEventListener('click', () => switchTab('summary'));
  dom.tabMindmapBtn?.addEventListener('click', () => switchTab('mindmap'));
  dom.tabQaBtn.addEventListener('click', () => switchTab('qa'));

  // Markdown Export
  dom.copyMarkdownBtn.addEventListener('click', handleCopyMarkdown);
  dom.downloadMarkdownBtn.addEventListener('click', handleDownloadMarkdown);

  // Q&A Follow-up Chat
  dom.qaSuggestions.forEach((chip) => {
    chip.addEventListener('click', () => {
      dom.qaInput.value = chip.dataset.question;
      handleQaSubmit();
    });
  });

  dom.qaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleQaSubmit();
  });

  // Delegated Click for Timecode Jump Buttons anywhere in Summary or Q&A
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.timecode-btn');
    if (!btn) return;
    const seconds = Number(btn.dataset.seconds || 0);
    seekVideoTo(seconds);
  });

  // Clear History
  dom.clearHistoryBtn.addEventListener('click', () => {
    clearSavedHistory();
    renderHistory(handleSelectHistoryRecord);
    showToast('Histórico local removido.');
  });
}

// =========================================================================
// API Key Verification, Model Discovery & Real-Time Model Health Probe
// =========================================================================
let activeProbeController = null;
let activeProbeTimer = null;

function cancelActiveModelProbe(reasonText = '') {
  const wasRunning = Boolean(activeProbeController);
  if (activeProbeController) {
    activeProbeController.abort();
    activeProbeController = null;
  }
  clearInterval(activeProbeTimer);
  activeProbeTimer = null;

  if (dom.testModelBtnLabel) {
    dom.testModelBtnLabel.textContent = 'Testar modelo';
  }
  if (wasRunning && dom.apiStatusLabel?.textContent.startsWith('Testando ')) {
    setApiStatus('connected', dom.modelSelector?.value || 'Gemini API Ativa');
  }
  if (reasonText && dom.modelHealthStrip) {
    dom.modelHealthStrip.dataset.state = 'idle';
    if (dom.modelHealthDot) dom.modelHealthDot.className = 'status-dot';
    if (dom.modelHealthBadge) dom.modelHealthBadge.textContent = 'Teste interrompido';
    if (dom.modelHealthMetrics) dom.modelHealthMetrics.textContent = '';
    if (dom.modelHealthDetail) dom.modelHealthDetail.textContent = reasonText;
  }
}

async function runModelHealthCheck(modelToTest, { notifyToast = false } = {}) {
  const targetModel = modelToTest || dom.modelSelector?.value || 'gemini-3.6-flash';
  if (!state.apiKey) return;

  cancelActiveModelProbe();

  const probeAc = new AbortController();
  activeProbeController = probeAc;
  const startedAt = performance.now();

  if (dom.modelHealthStrip) {
    dom.modelHealthStrip.dataset.state = 'testing';
  }
  if (dom.modelHealthDot) {
    dom.modelHealthDot.className = 'status-dot';
  }
  if (dom.modelHealthName) {
    dom.modelHealthName.textContent = targetModel;
  }
  if (dom.modelHealthBadge) {
    dom.modelHealthBadge.textContent = 'Testando em tempo real...';
  }
  if (dom.modelHealthMetrics) {
    dom.modelHealthMetrics.textContent = '0.0s';
  }
  if (dom.modelHealthDetail) {
    dom.modelHealthDetail.textContent = `Enviando ping SSE ao endpoint oficial de "${targetModel}" para aferir disponibilidade, cota e latência...`;
  }
  if (dom.testModelBtnLabel) {
    dom.testModelBtnLabel.textContent = 'Cancelar (0.0s)';
  }
  setApiStatus('pending', `Testando ${targetModel}...`);

  activeProbeTimer = setInterval(() => {
    const sec = ((performance.now() - startedAt) / 1000).toFixed(1);
    if (dom.modelHealthMetrics) {
      dom.modelHealthMetrics.textContent = `${sec}s decorridos...`;
    }
    if (dom.testModelBtnLabel) {
      dom.testModelBtnLabel.textContent = `Cancelar (${sec}s)`;
    }
    if (Number(sec) >= 4.5 && dom.modelHealthDetail) {
      dom.modelHealthDetail.textContent = `Aguardando 1º sinal do Google para "${targetModel}" (${sec}s) — latência acima do normal, verificando se há fila ou erro 503...`;
    }
  }, 100);

  const res = await probeGeminiModelHealth({
    apiKey: state.apiKey,
    model: targetModel,
    timeoutMs: 12000,
    signal: probeAc.signal
  });

  if (activeProbeController !== probeAc || res.state === 'cancelled') {
    return;
  }

  activeProbeController = null;
  clearInterval(activeProbeTimer);
  activeProbeTimer = null;

  if (dom.testModelBtnLabel) {
    dom.testModelBtnLabel.textContent = 'Testar modelo';
  }

  if (res.ok) {
    const visualState = res.state === 'slow' ? 'slow' : 'healthy';
    if (dom.modelHealthStrip) dom.modelHealthStrip.dataset.state = visualState;
    if (dom.modelHealthDot) {
      dom.modelHealthDot.className =
        visualState === 'healthy' ? 'status-dot connected' : 'status-dot';
    }
    if (dom.modelHealthBadge) dom.modelHealthBadge.textContent = res.badge;
    if (dom.modelHealthMetrics) {
      const ttft = (res.ttftMs / 1000).toFixed(2);
      const total = (res.latencyMs / 1000).toFixed(2);
      dom.modelHealthMetrics.textContent = `1º sinal: ${ttft}s · Total: ${total}s${
        res.totalTokens ? ` · ${res.totalTokens} tokens` : ''
      }`;
    }
    if (dom.modelHealthDetail) dom.modelHealthDetail.textContent = res.detail;

    setApiStatus(visualState === 'healthy' ? 'connected' : 'pending', res.pillLabel);
    if (notifyToast) {
      showToast(`${targetModel} respondeu em ${(res.latencyMs / 1000).toFixed(2)}s!`);
    }
    return;
  }

  if (dom.modelHealthStrip) dom.modelHealthStrip.dataset.state = 'error';
  if (dom.modelHealthDot) dom.modelHealthDot.className = 'status-dot error';
  if (dom.modelHealthBadge) dom.modelHealthBadge.textContent = res.badge;
  if (dom.modelHealthMetrics) {
    dom.modelHealthMetrics.textContent = `Tempo: ${(res.latencyMs / 1000).toFixed(1)}s`;
  }
  if (dom.modelHealthDetail) dom.modelHealthDetail.textContent = res.detail;

  setApiStatus('error', res.pillLabel);
  if (notifyToast) {
    showToast(`${targetModel}: ${res.badge}`);
  }
}

async function verifyAndSyncModels(notifyUser = false) {
  if (!state.apiKey) {
    setByokUnconfiguredUi();
    return;
  }

  setApiStatus('pending', 'Conectando API...');

  try {
    const sorted = await discoverGeminiModels(state.apiKey);
    let activeModel = dom.modelSelector.value || 'gemini-3.6-flash';

    if (sorted.length > 0) {
      state.availableModels = sorted;
      const savedModel = getSavedModel();
      activeModel =
        savedModel && sorted.includes(savedModel)
          ? savedModel
          : sorted.includes('gemini-3.6-flash')
            ? 'gemini-3.6-flash'
            : sorted[0];

      dom.modelSelector.innerHTML = sorted
        .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`)
        .join('');
      dom.modelSelector.value = activeModel;
    }

    if (notifyUser) {
      showToast('Chave validada! Testando modelo selecionado...');
    }
    await runModelHealthCheck(activeModel, { notifyToast: notifyUser });
  } catch (err) {
    setApiStatus('error', 'Erro na API Key');
    if (dom.modelHealthStrip) dom.modelHealthStrip.dataset.state = 'error';
    if (dom.modelHealthDot) dom.modelHealthDot.className = 'status-dot error';
    if (dom.modelHealthBadge) dom.modelHealthBadge.textContent = 'Erro na API Key';
    if (dom.modelHealthDetail) dom.modelHealthDetail.textContent = err.message;
    if (notifyUser) {
      showError('Falha ao validar a API Key', err.message);
    }
  }
}

// =========================================================================
// Core Summarization Workflow
// =========================================================================
async function handleSummarizeSubmit() {
  hideError();

  const rawUrl = dom.urlInput.value.trim();
  const manualTranscript = dom.manualTranscriptInput.value.trim();
  const videoId = extractYouTubeId(rawUrl);

  if (!videoId && !manualTranscript) {
    showError(
      'Link do YouTube inválido',
      'Cole uma URL válida do YouTube (ex: youtube.com/watch?v=... ou youtu.be/...) para iniciar a análise.'
    );
    dom.urlInput.focus();
    return;
  }

  if (!state.apiKey) {
    const typedKey = sanitizeApiKeyInput(dom.apiKeyInput.value);
    if (typedKey.length >= 20) {
      state.apiKey = typedKey;
      saveApiKey(typedKey);
      syncClearKeyBtnVisibility();
    } else {
      dom.apiDrawer.classList.add('open');
      dom.toggleApiDrawerBtn.setAttribute('aria-expanded', 'true');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => dom.apiKeyInput.focus(), 120);
      showError(
        'Configure sua chave Gemini gratuita (BYOK)',
        'Clique em "Gerar chave gratuita no Google AI Studio" no painel aberto no topo, cole sua API Key e clique em Resumir vídeo.'
      );
      return;
    }
  }

  let videoInfo = state.currentVideo;
  if (!videoInfo || videoInfo.videoId !== videoId) {
    videoInfo = videoId
      ? await previewDetectedUrl(rawUrl)
      : {
          videoId: null,
          canonicalUrl: '',
          title: 'Análise via Transcrição Manual',
          channel: 'Modo Contingência (Plano B)',
          thumbnail: ''
        };
  }

  cancelActiveModelProbe();
  if (state.activeAbortController) {
    state.activeAbortController.abort();
  }
  const abortController = new AbortController();
  state.activeAbortController = abortController;

  startProcessingUi(Boolean(manualTranscript));
  const startedAt = performance.now();

  try {
    const { systemInstruction, userPrompt } = buildSummaryPrompt({
      mode: state.selectedMode,
      language: dom.outputLangSelect.value,
      customFocus: dom.customFocusInput.value.trim(),
      knownTitle: videoInfo?.title,
      knownChannel: videoInfo?.channel,
      manualTranscript
    });

    const response = await callGeminiMultimodal({
      apiKey: state.apiKey,
      selectedModel: dom.modelSelector.value || 'gemini-3.6-flash',
      canonicalUrl: manualTranscript ? null : videoInfo.canonicalUrl,
      systemInstruction,
      promptText: userPrompt,
      expectJson: true,
      responseSchema: SUMMARY_RESPONSE_SCHEMA,
      thinkingBudget: THINKING_BUDGET_BY_MODE[state.selectedMode] || 512,
      maxOutputTokens: 16384,
      temperature: 0.2,
      signal: abortController.signal,
      onProgress: updateProcessingProgress
    });

    const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    const parsedSummary = normalizeSummaryPayload(response.text, videoInfo);

    state.currentResult = {
      summary: parsedSummary,
      video: {
        ...videoInfo,
        title:
          videoInfo.title && !videoInfo.title.startsWith('Vídeo')
            ? videoInfo.title
            : parsedSummary.videoTitle || 'Videoaula Analisada',
        channel:
          videoInfo.channel && !videoInfo.channel.startsWith('YouTube')
            ? videoInfo.channel
            : parsedSummary.channelOrSpeaker || 'YouTube'
      },
      telemetry: {
        model: response.modelUsed,
        latencySeconds: elapsedSeconds,
        totalTokens: response.totalTokens,
        promptTokens: response.promptTokens,
        outputTokens: response.outputTokens,
        samplingLabel: response.samplingLabel,
        usedFallbackTranscript: Boolean(manualTranscript)
      },
      createdAt: new Date().toISOString()
    };

    state.qaHistory = [];
    delete dom.ytIframe.dataset.hasPlayed;
    stopProcessingUi();
    setApiStatus('connected', `${response.modelUsed} · ativo`);
    renderWorkspaceResult(state.currentResult);
    saveRecordToHistory(state.currentResult);
    renderHistory(handleSelectHistoryRecord);
  } catch (err) {
    if (abortController.signal.aborted) {
      return;
    }
    stopProcessingUi();
    const msg = err.message || 'Falha inesperada na comunicação com o Gemini.';
    const isModelServerIssue = /HTTP 503|HTTP 429|HTTP 404|sobrecarga|alta demanda|cota/i.test(msg);
    const isPrivateOrBlocked =
      !isModelServerIssue &&
      /private|unlisted|video is not available|cannot access|permission/i.test(msg);

    if (isPrivateOrBlocked) {
      dom.advancedDrawer.classList.add('open');
      dom.toggleAdvancedBtn.classList.add('active');
      dom.toggleAdvancedBtn.setAttribute('aria-expanded', 'true');
      showError(
        'Vídeo restrito, privado ou não listado no YouTube',
        `${msg} — Abrimos o Plano B abaixo: copie "Mostrar transcrição" no YouTube e cole no campo de contingência para resumir imediatamente.`
      );
    } else if (isModelServerIssue) {
      showError('Modelo Gemini indisponível ou sobrecarregado no momento', msg);
    } else {
      showError('Não foi possível resumir este vídeo', msg);
    }
  } finally {
    if (state.activeAbortController === abortController) {
      state.activeAbortController = null;
    }
  }
}

// =========================================================================
// Interactive Q&A With the Active Video
// =========================================================================
async function handleQaSubmit() {
  const question = dom.qaInput.value.trim();
  if (!question || !state.currentResult) return;

  dom.qaInput.value = '';
  dom.qaSubmitBtn.disabled = true;

  appendQaMessage('user', escapeHtml(question));
  const loadingEl = appendQaMessage('assistant', 'Consultando dossiê da aula...');

  try {
    const { video, summary } = state.currentResult;
    const manualTranscript = dom.manualTranscriptInput.value.trim();
    const forceVideoInspection = Boolean(dom.qaForceVideoToggle?.checked);

    const qaPlan = buildQaRequestPlan({
      video,
      summary,
      manualTranscript,
      outputLanguage: dom.outputLangSelect.value,
      qaHistory: state.qaHistory,
      question,
      forceVideoInspection
    });

    if (qaPlan.videoMetadata?.startOffset) {
      loadingEl.textContent = `Inspecionando trecho ${qaPlan.videoMetadata.startOffset}–${qaPlan.videoMetadata.endOffset} do vídeo...`;
    } else if (qaPlan.canonicalUrl) {
      loadingEl.textContent = 'Reinspecionando quadros e áudio do vídeo...';
    }

    const res = await callGeminiMultimodal({
      apiKey: state.apiKey,
      selectedModel: dom.modelSelector.value || 'gemini-3.6-flash',
      canonicalUrl: qaPlan.canonicalUrl,
      videoMetadata: qaPlan.videoMetadata,
      systemInstruction: qaPlan.systemInstruction,
      qaContextText: qaPlan.qaContextText,
      historyTurns: qaPlan.historyTurns,
      promptText: question,
      expectJson: false,
      thinkingBudget: THINKING_BUDGET_BY_MODE.qa,
      maxOutputTokens: 4096,
      temperature: 0.25
    });

    state.qaHistory.push({ role: 'user', text: question });
    state.qaHistory.push({ role: 'model', text: res.text });

    loadingEl.innerHTML = formatQaMarkdownWithTimestamps(res.text);
  } catch (err) {
    loadingEl.textContent = `Erro ao consultar a aula: ${err.message}`;
  } finally {
    dom.qaSubmitBtn.disabled = false;
    dom.qaMessages.scrollTop = dom.qaMessages.scrollHeight;
  }
}

// =========================================================================
// Markdown Export & History Selection Handlers
// =========================================================================
async function handleCopyMarkdown() {
  if (!state.currentResult) return;
  try {
    await copyMarkdownToClipboard(state.currentResult);
    showToast('Resumo copiado em Markdown!');
  } catch {
    showToast('Não foi possível copiar automaticamente.');
  }
}

function handleDownloadMarkdown() {
  if (!state.currentResult) return;
  downloadMarkdownFile(state.currentResult);
  showToast('Arquivo .md baixado!');
}

function handleSelectHistoryRecord(target) {
  state.currentResult = target;
  state.qaHistory = [];
  if (target.video?.canonicalUrl) {
    dom.urlInput.value = target.video.canonicalUrl;
    dom.clearUrlBtn.style.display = 'inline-flex';
  }
  delete dom.ytIframe.dataset.hasPlayed;
  renderWorkspaceResult(target);
}

// Boot Application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
