/**
 * PulseTube AI — Split Workspace & Structured Theoretical Summary Renderer
 */

import { escapeHtml } from '../utils/formatters.js';
import { renderRichStudyText, renderTimecodeChip } from './components.js';
import { dom } from './dom.js';
import { loadResultMindMap, renderMindMapCanvas } from './mindMapView.js';
import { syncResultPlayer } from './playerController.js';
import { renderQaWelcome } from './qaView.js';

export function switchTab(tab) {
  const isSummary = tab === 'summary';
  const isMindmap = tab === 'mindmap';
  const isQa = tab === 'qa';

  dom.tabSummaryBtn.classList.toggle('active', isSummary);
  dom.tabSummaryBtn.setAttribute('aria-selected', String(isSummary));

  if (dom.tabMindmapBtn) {
    dom.tabMindmapBtn.classList.toggle('active', isMindmap);
    dom.tabMindmapBtn.setAttribute('aria-selected', String(isMindmap));
  }

  dom.tabQaBtn.classList.toggle('active', isQa);
  dom.tabQaBtn.setAttribute('aria-selected', String(isQa));

  dom.summaryPane.classList.toggle('hidden', !isSummary);
  dom.mindmapPane?.classList.toggle('hidden', !isMindmap);
  dom.qaPane.classList.toggle('hidden', !isQa);

  if (isMindmap) {
    renderMindMapCanvas({ autoFit: true });
  } else if (isQa) {
    dom.qaInput.focus();
  }
}

export function renderWorkspaceResult(record) {
  const { summary, video, telemetry } = record;

  dom.workspaceGrid.classList.add('visible');
  switchTab('summary');

  // Setup Synchronized YouTube Player
  syncResultPlayer(video);

  dom.resultCategoryTag.textContent = summary.category || 'Estudo & Teoria';
  dom.resultVideoTitle.textContent = video.title || summary.videoTitle;
  dom.resultVideoChannel.textContent = video.channel || summary.channelOrSpeaker;

  // Time Economy Calculation
  const vidMin = Math.max(2, Number(summary.estimatedDurationMinutes) || 15);
  const readMin = Math.max(1, Math.min(vidMin - 1, Number(summary.readingTimeMinutes) || 4));
  const savedPct = Math.max(15, Math.min(96, Math.round(((vidMin - readMin) / vidMin) * 100)));

  dom.timeSavedPercent.textContent = `${savedPct}% economizado`;
  dom.timeSavedBar.style.width = `${Math.max(8, 100 - savedPct)}%`;
  dom.videoDurationLabel.textContent = `Vídeo: ~${vidMin} min`;
  dom.readingDurationLabel.textContent = `Estudo: ~${readMin} min`;

  // Telemetry & Token Economy Breakdown
  dom.telemetryModel.textContent = (telemetry.model || 'gemini').replace('gemini-', '');
  dom.telemetryLatency.textContent = `${telemetry.latencySeconds}s`;
  dom.telemetryTokens.textContent = telemetry.totalTokens
    ? telemetry.totalTokens.toLocaleString('pt-BR')
    : 'Auto';

  if (telemetry.totalTokens) {
    const details = [
      telemetry.promptTokens
        ? `Entrada: ${telemetry.promptTokens.toLocaleString('pt-BR')}`
        : '',
      telemetry.outputTokens
        ? `Saída: ${telemetry.outputTokens.toLocaleString('pt-BR')}`
        : '',
      telemetry.samplingLabel ? `Modo: ${telemetry.samplingLabel}` : ''
    ]
      .filter(Boolean)
      .join(' · ');
    dom.telemetryTokens.title = details;
  }

  // A. Theoretical Overview & Prerequisites
  dom.summaryTldr.innerHTML = renderRichStudyText(summary.tldr);
  dom.summaryAudience.innerHTML = summary.targetAudience
    ? `<strong>Pré-requisitos &amp; contexto:</strong> <span>${escapeHtml(summary.targetAudience)}</span>`
    : '';

  // B. Concepts & Formulas Glossary
  const glossary = Array.isArray(summary.conceptsGlossary) ? summary.conceptsGlossary : [];
  if (dom.summaryGlossaryBlock && dom.summaryGlossary) {
    if (glossary.length > 0) {
      dom.summaryGlossaryBlock.style.display = '';
      dom.summaryGlossary.innerHTML = glossary
        .map(
          (item) => `
            <div class="glossary-card">
              <div class="glossary-term">${escapeHtml(item.term || '')}</div>
              <div class="glossary-def">${renderRichStudyText(item.definition || '')}</div>
            </div>
          `
        )
        .join('');
    } else {
      dom.summaryGlossaryBlock.style.display = 'none';
      dom.summaryGlossary.innerHTML = '';
    }
  }

  // C. Complete Theoretical Modules (Key Points)
  if (summary.keyPoints.length > 0) {
    dom.summaryKeypoints.innerHTML = summary.keyPoints
      .map((kp, idx) => {
        const tsBadge = renderTimecodeChip(kp.timestamp);
        return `
          <div class="keypoint-item">
            <div class="kp-index">${String(idx + 1).padStart(2, '0')}</div>
            <div class="kp-content">
              <div class="kp-header">
                <span class="kp-title">${escapeHtml(kp.title || `Módulo ${idx + 1}`)}</span>
                ${tsBadge}
              </div>
              <div class="kp-detail">${renderRichStudyText(kp.detail || '')}</div>
            </div>
          </div>
        `;
      })
      .join('');
  } else {
    dom.summaryKeypoints.innerHTML =
      '<div class="kp-detail">Os módulos teóricos estão consolidados na fundamentação acima.</div>';
  }

  // D. Chronological Timeline & Slide/Board Cues
  if (summary.timeline.length > 0) {
    dom.summaryTimeline.innerHTML = summary.timeline
      .map((node) => {
        const tsBadge = renderTimecodeChip(node.timestamp);
        const visualHtml = node.visualCue
          ? `<div class="tl-visual">
               <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                 <line x1="8" y1="21" x2="16" y2="21"></line>
                 <line x1="12" y1="17" x2="12" y2="21"></line>
               </svg>
               <span>Quadro/Slide: ${escapeHtml(node.visualCue)}</span>
             </div>`
          : '';

        return `
          <div class="timeline-node">
            <div class="tl-top">
              ${tsBadge}
              <span class="tl-topic">${escapeHtml(node.topic || 'Trecho')}</span>
            </div>
            <div class="tl-summary">${renderRichStudyText(node.summary || '')}</div>
            ${visualHtml}
          </div>
        `;
      })
      .join('');
  } else {
    dom.summaryTimeline.innerHTML =
      '<p class="tl-summary">Sem capítulos temporais adicionais para exibir.</p>';
  }

  // E. Applications, Review Pitfalls & Integrative Conclusion
  dom.summaryTakeaways.innerHTML = (summary.practicalTakeaways || [])
    .map(
      (item) => `
      <li>
        <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <div>${renderRichStudyText(item)}</div>
      </li>`
    )
    .join('');

  if (summary.finalConclusion) {
    dom.summaryConclusion.style.display = 'block';
    dom.summaryConclusion.innerHTML = `<strong>Síntese Integradora:</strong> ${escapeHtml(
      summary.finalConclusion
    )}`;
  } else {
    dom.summaryConclusion.style.display = 'none';
  }

  // Reset Q&A Pane Welcome Message & Initialize Zero-Token Mind Map
  if (dom.qaForceVideoToggle) {
    dom.qaForceVideoToggle.checked = false;
  }
  renderQaWelcome(video.title || summary.videoTitle);
  loadResultMindMap(record);

  dom.workspaceGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
