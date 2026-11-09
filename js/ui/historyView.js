/**
 * PulseTube AI — Local History Grid Renderer
 */

import { getSavedHistory } from '../services/storageService.js';
import { getFallbackThumbnailUrl } from '../services/youtubeService.js';
import { escapeHtml } from '../utils/formatters.js';
import { dom } from './dom.js';

export function renderHistory(onSelectRecord) {
  const list = getSavedHistory();

  if (list.length === 0) {
    dom.historySection.classList.remove('visible');
    dom.historyGrid.innerHTML = '';
    return;
  }

  dom.historySection.classList.add('visible');
  dom.historyGrid.innerHTML = list
    .map((item, idx) => {
      const thumb =
        item.video?.thumbnail ||
        (item.video?.videoId ? getFallbackThumbnailUrl(item.video.videoId) : '');
      const dateLabel = item.createdAt
        ? new Date(item.createdAt).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '';

      return `
        <button type="button" class="history-card" data-history-idx="${idx}">
          ${thumb ? `<img class="history-thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" />` : ''}
          <div class="history-meta">
            <div class="history-title">${escapeHtml(item.video?.title || 'Vídeo Resumido')}</div>
            <div class="history-date">${escapeHtml(item.video?.channel || 'YouTube')} · ${escapeHtml(dateLabel)}</div>
          </div>
        </button>
      `;
    })
    .join('');

  dom.historyGrid.querySelectorAll('.history-card').forEach((card) => {
    card.addEventListener('click', () => {
      const idx = Number(card.dataset.historyIdx);
      const target = list[idx];
      if (target && typeof onSelectRecord === 'function') {
        onSelectRecord(target);
      }
    });
  });
}
