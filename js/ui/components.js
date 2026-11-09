/**
 * PulseTube AI — Reusable HTML Template & Academic Markdown Components
 */

import { escapeHtml, parseTimestampToSeconds } from '../utils/formatters.js';

export function renderTimecodeChip(timestampStr) {
  const seconds = parseTimestampToSeconds(timestampStr);
  if (seconds === null) return '';
  const cleanLabel = timestampStr.replace(/[\[\]()]/g, '').trim();

  return `
    <button type="button" class="timecode-btn" data-seconds="${seconds}" title="Saltar player para ${escapeHtml(cleanLabel)}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
      <span>${escapeHtml(cleanLabel)}</span>
    </button>
  `;
}

function formatInlineStudyTokens(escapedLine) {
  let html = escapedLine;

  // Inline code / mathematical formulas in backticks
  html = html.replace(/`([^`]+)`/g, '<code class="study-inline-code">$1</code>');

  // Bold emphasis
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Clickable timestamps [MM:SS] or (MM:SS) or [HH:MM:SS]
  html = html.replace(/[\[\(](\d{1,2}:\d{2}(?::\d{2})?)[\]\)]/g, (match, ts) => {
    return renderTimecodeChip(ts) || match;
  });

  return html;
}

/**
 * Safely renders lightweight academic Markdown (fenced code blocks, inline code/formulas,
 * bold definitions, bullet lists, and interactive timecodes) without external dependencies.
 */
export function renderRichStudyText(rawText) {
  if (!rawText) return '';

  const codeBlocks = [];
  const withPlaceholders = String(rawText).replace(
    /```(?:[a-zA-Z0-9_+-]+)?\n?([\s\S]*?)```/g,
    (_, code) => {
      const token = `@@STUDY_CODE_${codeBlocks.length}@@`;
      codeBlocks.push(`<pre class="study-code"><code>${escapeHtml(code.trim())}</code></pre>`);
      return token;
    }
  );

  const lines = withPlaceholders.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let currentList = [];

  const flushList = () => {
    if (currentList.length > 0) {
      blocks.push(`<ul class="study-sublist">${currentList.join('')}</ul>`);
      currentList = [];
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    const codeMatch = trimmed.match(/^@@STUDY_CODE_(\d+)@@$/);
    if (codeMatch) {
      flushList();
      blocks.push(codeBlocks[Number(codeMatch[1])] || '');
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      currentList.push(`<li>${formatInlineStudyTokens(escapeHtml(bulletMatch[1]))}</li>`);
      continue;
    }

    flushList();
    blocks.push(`<p class="study-para">${formatInlineStudyTokens(escapeHtml(trimmed))}</p>`);
  }

  flushList();

  return blocks
    .join('')
    .replace(/@@STUDY_CODE_(\d+)@@/g, (_, idx) => codeBlocks[Number(idx)] || '');
}
