/**
 * PulseTube AI — Interactive Mind Map Canvas & Builder Controller
 * Supports pan/zoom, active-recall branch collapsing, video timecode seeking,
 * manual node editing/creation/deletion, on-demand AI node expansion, and PNG/SVG export.
 */

import {
  addChildNode,
  buildInitialMindMapFromSummary,
  deleteNodeById,
  expandMindMapNodeWithAi,
  findNodeById,
  setAllCollapsed
} from '../services/mindMapService.js';
import { saveRecordToHistory } from '../services/storageService.js';
import { state } from '../state/store.js';
import { parseTimestampToSeconds } from '../utils/formatters.js';
import {
  downloadMindMapPng,
  downloadMindMapSvg,
  renderMindMapSvgMarkup
} from '../utils/mindMapExporter.js';
import { dom } from './dom.js';
import { showToast } from './notifications.js';
import { seekVideoTo } from './playerController.js';

const view = {
  scale: 1,
  tx: 36,
  ty: 180,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  originTx: 0,
  originTy: 0,
  selectedNodeId: 'mm-root',
  lastBounds: null,
  allCollapsed: false,
  aiExpanding: false
};

function getCurrentTheme() {
  return dom.html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function getActiveMindMapRoot() {
  const rec = state.currentResult;
  if (!rec) return null;
  if (!rec.mindMap || !rec.mindMap.id) {
    rec.mindMap = buildInitialMindMapFromSummary(rec);
  }
  return rec.mindMap;
}

function persistMindMapChanges() {
  if (state.currentResult) {
    saveRecordToHistory(state.currentResult);
  }
}

function applyViewportTransform() {
  if (!dom.mmTransformGroup) return;
  dom.mmTransformGroup.setAttribute(
    'transform',
    `translate(${view.tx.toFixed(1)}, ${view.ty.toFixed(1)}) scale(${view.scale.toFixed(3)})`
  );
  if (dom.mmZoomLabel) {
    dom.mmZoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
  }
}

export function fitMindMapToViewport() {
  if (!dom.mmCanvasWrap || !view.lastBounds) return;
  const rect = dom.mmCanvasWrap.getBoundingClientRect();
  const vw = rect.width || 720;
  const vh = rect.height || 480;

  const pad = 44;
  const { minX, minY, width, height } = view.lastBounds;
  const scaleX = (vw - pad * 2) / width;
  const scaleY = (vh - pad * 2) / height;
  const nextScale = Math.max(0.38, Math.min(1.12, Math.min(scaleX, scaleY)));

  view.scale = nextScale;
  view.tx = (vw - width * nextScale) / 2 - minX * nextScale;
  view.ty = (vh - height * nextScale) / 2 - minY * nextScale;
  applyViewportTransform();
}

function syncInspectorPanel() {
  const root = getActiveMindMapRoot();
  if (!root || !dom.mmInspector) return;

  const selected = findNodeById(root, view.selectedNodeId) || root;
  view.selectedNodeId = selected.id;

  const isRoot = selected.id === root.id;
  dom.mmEditLabel.value = selected.label || '';
  dom.mmEditTs.value = selected.timestamp || '';
  dom.mmEditNote.value = selected.note || '';

  const sec = parseTimestampToSeconds(selected.timestamp);
  dom.mmSeekNodeBtn.disabled = sec === null || !state.currentResult?.video?.videoId;
  dom.mmDeleteNodeBtn.disabled = isRoot;
  dom.mmAiExpandBtn.disabled = view.aiExpanding;
}

export function renderMindMapCanvas({ autoFit = false } = {}) {
  const root = getActiveMindMapRoot();
  if (!root || !dom.mmTransformGroup) return;

  const { innerMarkup, bounds } = renderMindMapSvgMarkup(root, {
    theme: getCurrentTheme(),
    interactive: true,
    selectedNodeId: view.selectedNodeId
  });

  dom.mmTransformGroup.innerHTML = innerMarkup;
  view.lastBounds = bounds;

  if (autoFit) {
    requestAnimationFrame(() => fitMindMapToViewport());
  } else {
    applyViewportTransform();
  }

  syncInspectorPanel();
}

export function loadResultMindMap(record) {
  if (!record) return;
  if (!record.mindMap || !record.mindMap.id) {
    record.mindMap = buildInitialMindMapFromSummary(record);
  }
  view.selectedNodeId = record.mindMap.id;
  view.allCollapsed = false;
  if (dom.mmCollapseAllBtn) {
    dom.mmCollapseAllBtn.textContent = 'Recolher ramos';
  }
  renderMindMapCanvas({ autoFit: true });
}

function zoomByFactor(factor, centerClientX = null, centerClientY = null) {
  if (!dom.mmCanvasWrap) return;
  const rect = dom.mmCanvasWrap.getBoundingClientRect();
  const cx = centerClientX !== null ? centerClientX - rect.left : rect.width / 2;
  const cy = centerClientY !== null ? centerClientY - rect.top : rect.height / 2;

  const prevScale = view.scale;
  const nextScale = Math.max(0.28, Math.min(2.4, prevScale * factor));
  const ratio = nextScale / prevScale;

  view.tx = cx - (cx - view.tx) * ratio;
  view.ty = cy - (cy - view.ty) * ratio;
  view.scale = nextScale;
  applyViewportTransform();
}

async function handleAiExpandSelectedNode() {
  const root = getActiveMindMapRoot();
  if (!root || !state.currentResult || view.aiExpanding) return;

  if (!state.apiKey) {
    showToast('Configure sua API Key Gemini antes de expandir com IA.');
    return;
  }

  view.aiExpanding = true;
  const originalBtnHtml = dom.mmAiExpandBtn.innerHTML;
  dom.mmAiExpandBtn.disabled = true;
  dom.mmAiExpandBtn.textContent = 'Expandindo c/ IA...';

  try {
    const result = await expandMindMapNodeWithAi({
      rootNode: root,
      targetNodeId: view.selectedNodeId,
      record: state.currentResult,
      apiKey: state.apiKey,
      selectedModel: dom.modelSelector.value || 'gemini-3.6-flash',
      outputLanguage: dom.outputLangSelect.value
    });

    persistMindMapChanges();
    renderMindMapCanvas({ autoFit: false });

    const sourceHint = result.usedVideoClip
      ? ` (inspecionando vídeo ${result.clipRange})`
      : ' (via dossiê teórico)';
    showToast(`+${result.addedNodes.length} sub-nós adicionados${sourceHint}!`);
  } catch (err) {
    showToast(err.message || 'Falha ao expandir nó com IA.');
  } finally {
    view.aiExpanding = false;
    dom.mmAiExpandBtn.disabled = false;
    dom.mmAiExpandBtn.innerHTML = originalBtnHtml;
  }
}

export function initMindMapEvents() {
  if (!dom.mmCanvasWrap || !dom.mmSvg) return;

  // Click delegation inside SVG (Seek badge, Collapse toggle, or Node selection)
  dom.mmSvg.addEventListener('click', (e) => {
    const seekEl = e.target.closest('[data-mm-seek]');
    if (seekEl) {
      e.stopPropagation();
      const sec = Number(seekEl.getAttribute('data-mm-seek') || 0);
      seekVideoTo(sec);
      return;
    }

    const toggleEl = e.target.closest('[data-mm-toggle]');
    if (toggleEl) {
      e.stopPropagation();
      const targetId = toggleEl.getAttribute('data-mm-toggle');
      const root = getActiveMindMapRoot();
      const node = findNodeById(root, targetId);
      if (node) {
        node.collapsed = !node.collapsed;
        view.selectedNodeId = node.id;
        persistMindMapChanges();
        renderMindMapCanvas({ autoFit: false });
      }
      return;
    }

    const nodeEl = e.target.closest('[data-node-id]');
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-node-id');
      if (nodeId && nodeId !== view.selectedNodeId) {
        view.selectedNodeId = nodeId;
        renderMindMapCanvas({ autoFit: false });
      } else {
        syncInspectorPanel();
      }
    }
  });

  // Double-click node -> jump focus straight to label editor
  dom.mmSvg.addEventListener('dblclick', (e) => {
    const nodeEl = e.target.closest('[data-node-id]');
    if (!nodeEl) return;
    const nodeId = nodeEl.getAttribute('data-node-id');
    if (nodeId) {
      view.selectedNodeId = nodeId;
      renderMindMapCanvas({ autoFit: false });
      dom.mmEditLabel?.focus();
      dom.mmEditLabel?.select();
    }
  });

  // Canvas Drag-to-Pan
  dom.mmCanvasWrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('[data-mm-seek], [data-mm-toggle]')) return;
    // Allow clicking nodes without starting pan unless dragged > 4px
    view.isPanning = true;
    view.panStartX = e.clientX;
    view.panStartY = e.clientY;
    view.originTx = view.tx;
    view.originTy = view.ty;
  });

  window.addEventListener('pointermove', (e) => {
    if (!view.isPanning) return;
    const dx = e.clientX - view.panStartX;
    const dy = e.clientY - view.panStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dom.mmCanvasWrap.classList.add('grabbing');
      view.tx = view.originTx + dx;
      view.ty = view.originTy + dy;
      applyViewportTransform();
    }
  });

  window.addEventListener('pointerup', () => {
    if (!view.isPanning) return;
    view.isPanning = false;
    dom.mmCanvasWrap.classList.remove('grabbing');
  });

  // Smooth Wheel Zoom around cursor
  dom.mmCanvasWrap.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.91;
      zoomByFactor(factor, e.clientX, e.clientY);
    },
    { passive: false }
  );

  // Toolbar Zoom & Active-Recall Controls
  dom.mmZoomInBtn?.addEventListener('click', () => zoomByFactor(1.2));
  dom.mmZoomOutBtn?.addEventListener('click', () => zoomByFactor(0.84));
  dom.mmFitBtn?.addEventListener('click', () => fitMindMapToViewport());

  dom.mmCollapseAllBtn?.addEventListener('click', () => {
    const root = getActiveMindMapRoot();
    if (!root) return;
    view.allCollapsed = !view.allCollapsed;
    setAllCollapsed(root, view.allCollapsed);
    dom.mmCollapseAllBtn.textContent = view.allCollapsed ? 'Expandir ramos' : 'Recolher ramos';
    renderMindMapCanvas({ autoFit: true });
  });

  dom.mmResetBtn?.addEventListener('click', () => {
    if (!state.currentResult) return;
    state.currentResult.mindMap = buildInitialMindMapFromSummary(state.currentResult);
    view.selectedNodeId = state.currentResult.mindMap.id;
    view.allCollapsed = false;
    if (dom.mmCollapseAllBtn) {
      dom.mmCollapseAllBtn.textContent = 'Recolher ramos';
    }
    persistMindMapChanges();
    renderMindMapCanvas({ autoFit: true });
    showToast('Mapa mental restaurado a partir do resumo teórico.');
  });

  // Export Actions (SVG + High-Res PNG)
  dom.mmExportSvgBtn?.addEventListener('click', () => {
    const root = getActiveMindMapRoot();
    if (!root || !state.currentResult) return;
    downloadMindMapSvg(root, state.currentResult, getCurrentTheme());
    showToast('Mapa mental exportado em SVG vetorial!');
  });

  dom.mmExportPngBtn?.addEventListener('click', async () => {
    const root = getActiveMindMapRoot();
    if (!root || !state.currentResult) return;
    try {
      dom.mmExportPngBtn.disabled = true;
      await downloadMindMapPng(root, state.currentResult, getCurrentTheme());
      showToast('Imagem PNG em alta resolução baixada!');
    } catch (err) {
      showToast(err.message || 'Erro ao exportar PNG.');
    } finally {
      dom.mmExportPngBtn.disabled = false;
    }
  });

  // Inspector Live Node Editing
  const commitNodeEdits = () => {
    const root = getActiveMindMapRoot();
    const node = findNodeById(root, view.selectedNodeId);
    if (!node) return;

    const nextLabel = dom.mmEditLabel.value.trim() || 'Tópico';
    const nextTs = dom.mmEditTs.value.trim();
    const nextNote = dom.mmEditNote.value.trim();

    if (
      node.label !== nextLabel ||
      node.timestamp !== nextTs ||
      node.note !== nextNote
    ) {
      node.label = nextLabel;
      node.timestamp = nextTs;
      node.note = nextNote;
      persistMindMapChanges();
      renderMindMapCanvas({ autoFit: false });
    }
  };

  dom.mmEditLabel?.addEventListener('change', commitNodeEdits);
  dom.mmEditTs?.addEventListener('change', commitNodeEdits);
  dom.mmEditNote?.addEventListener('change', commitNodeEdits);

  dom.mmInspectorForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    commitNodeEdits();
    showToast('Nó atualizado no mapa mental.');
  });

  dom.mmSeekNodeBtn?.addEventListener('click', () => {
    const sec = parseTimestampToSeconds(dom.mmEditTs.value);
    if (sec !== null) {
      seekVideoTo(sec);
    }
  });

  dom.mmAddChildBtn?.addEventListener('click', () => {
    const root = getActiveMindMapRoot();
    if (!root) return;
    const created = addChildNode(root, view.selectedNodeId, {
      label: 'Novo conceito',
      note: '',
      timestamp: ''
    });
    if (created) {
      view.selectedNodeId = created.id;
      persistMindMapChanges();
      renderMindMapCanvas({ autoFit: false });
      dom.mmEditLabel?.focus();
      dom.mmEditLabel?.select();
    }
  });

  dom.mmDeleteNodeBtn?.addEventListener('click', () => {
    const root = getActiveMindMapRoot();
    if (!root || view.selectedNodeId === root.id) return;
    if (deleteNodeById(root, view.selectedNodeId)) {
      view.selectedNodeId = root.id;
      persistMindMapChanges();
      renderMindMapCanvas({ autoFit: false });
      showToast('Nó removido.');
    }
  });

  dom.mmAiExpandBtn?.addEventListener('click', handleAiExpandSelectedNode);

  // Re-render colors seamlessly when Light/Dark theme switches
  const themeObserver = new MutationObserver(() => {
    if (state.currentResult && !dom.mindmapPane?.classList.contains('hidden')) {
      renderMindMapCanvas({ autoFit: false });
    }
  });
  themeObserver.observe(dom.html, { attributes: true, attributeFilter: ['data-theme'] });
}
