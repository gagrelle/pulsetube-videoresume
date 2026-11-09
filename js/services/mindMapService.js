/**
 * PulseTube AI — Hybrid Mind Map Service (0-Token Initial Synthesis + On-Demand AI Node Expansion)
 */

import { THINKING_BUDGET_BY_MODE, VIDEO_SAMPLING_PROFILES } from '../config/constants.js';
import { parseTimestampToSeconds } from '../utils/formatters.js';
import { callGeminiMultimodal } from './geminiService.js';

let idCounter = 0;
export function createNodeId(prefix = 'mm') {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export const MINDMAP_EXPANSION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    children: {
      type: 'ARRAY',
      description:
        '3 a 6 sub-nós teóricos aprofundando o tópico selecionado sem repetir filhos já existentes.',
      items: {
        type: 'OBJECT',
        properties: {
          label: {
            type: 'STRING',
            description: 'Título curto e preciso do subconceito, propriedade, etapa ou fórmula (máx 55 caracteres).'
          },
          note: {
            type: 'STRING',
            description: 'Explicação teórica objetiva, definição formal ou expressão matemática/código (1 a 2 frases densas).'
          },
          timestamp: {
            type: 'STRING',
            description: 'Timestamp MM:SS relacionado no vídeo, ou string vazia se geral.'
          }
        },
        required: ['label', 'note', 'timestamp']
      }
    }
  },
  required: ['children']
};

function stripMarkdownFormatting(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitDetailIntoSubNodes(detailText, parentTimestamp = '') {
  if (!detailText) return [];

  const lines = String(detailText)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const bulletLines = lines
    .filter((l) => /^[-*•]\s+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, '').trim());

  const candidates =
    bulletLines.length > 0
      ? bulletLines
      : stripMarkdownFormatting(detailText)
          .split(/(?<=[.!?;])\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 18);

  return candidates.slice(0, 5).map((rawItem) => {
    const clean = stripMarkdownFormatting(rawItem);
    const tsMatch = clean.match(/[\[\(](\d{1,2}:\d{2}(?::\d{2})?)[\]\)]/);
    const extractedTs = tsMatch ? tsMatch[1] : '';
    const withoutTs = clean.replace(/[\[\(]\d{1,2}:\d{2}(?::\d{2})?[\]\)]/g, '').trim();

    // Split "Termo: explicação" or "Termo — explicação" into short label + detailed note
    const colonMatch = withoutTs.match(/^([^:—–-]{3,48})\s*[:—–-]\s*(.+)$/);
    if (colonMatch) {
      return {
        id: createNodeId('sub'),
        label: colonMatch[1].trim(),
        note: colonMatch[2].trim(),
        timestamp: extractedTs || '',
        category: 'module',
        collapsed: false,
        children: []
      };
    }

    const shortLabel =
      withoutTs.length > 52 ? `${withoutTs.slice(0, 49).trim()}…` : withoutTs;

    return {
      id: createNodeId('sub'),
      label: shortLabel,
      note: withoutTs.length > 52 ? withoutTs : '',
      timestamp: extractedTs || '',
      category: 'module',
      collapsed: false,
      children: []
    };
  });
}

function findMatchingVisualCues(kpTimestamp, timeline = [], usedCueIndexes = new Set()) {
  const kpSec = parseTimestampToSeconds(kpTimestamp);
  if (kpSec === null || !Array.isArray(timeline)) return [];

  const matches = [];
  timeline.forEach((tl, idx) => {
    if (usedCueIndexes.has(idx) || !tl?.visualCue) return;
    const tlSec = parseTimestampToSeconds(tl.timestamp);
    if (tlSec !== null && Math.abs(tlSec - kpSec) <= 75) {
      usedCueIndexes.add(idx);
      const cueText = stripMarkdownFormatting(tl.visualCue);
      matches.push({
        id: createNodeId('vis'),
        label: cueText.length > 48 ? `Slide/Quadro: ${cueText.slice(0, 34)}…` : `Tela: ${cueText}`,
        note: cueText,
        timestamp: tl.timestamp || kpTimestamp,
        category: 'visual',
        collapsed: false,
        children: []
      });
    }
  });
  return matches.slice(0, 2);
}

/**
 * Generates a structured hierarchical Mind Map instantaneously (0 extra API tokens)
 * from the already-extracted theoretical summary and timeline.
 */
export function buildInitialMindMapFromSummary(record) {
  const summary = record?.summary || {};
  const video = record?.video || {};
  const usedCueIndexes = new Set();

  const rootChildren = [];

  // 1. Theoretical Modules (from keyPoints)
  const keyPoints = Array.isArray(summary.keyPoints) ? summary.keyPoints : [];
  keyPoints.forEach((kp, idx) => {
    const subNodes = splitDetailIntoSubNodes(kp.detail, kp.timestamp);
    const visualNodes = findMatchingVisualCues(kp.timestamp, summary.timeline, usedCueIndexes);

    rootChildren.push({
      id: createNodeId('mod'),
      label: stripMarkdownFormatting(kp.title || `Módulo ${idx + 1}`),
      note: stripMarkdownFormatting(kp.detail || ''),
      timestamp: kp.timestamp || '',
      category: 'module',
      collapsed: idx >= 5 && subNodes.length > 2, // Keep initial viewport tidy on very large classes
      children: [...subNodes, ...visualNodes]
    });
  });

  // 2. Formal Concepts & Formulas Glossary
  const glossary = Array.isArray(summary.conceptsGlossary) ? summary.conceptsGlossary : [];
  if (glossary.length > 0) {
    rootChildren.push({
      id: createNodeId('glo-root'),
      label: 'Conceitos & Fórmulas',
      note: `${glossary.length} definições formais extraídas da aula.`,
      timestamp: '',
      category: 'concept',
      collapsed: glossary.length > 6,
      children: glossary.map((item) => ({
        id: createNodeId('glo'),
        label: stripMarkdownFormatting(item.term || 'Conceito'),
        note: stripMarkdownFormatting(item.definition || ''),
        timestamp: '',
        category: 'concept',
        collapsed: false,
        children: []
      }))
    });
  }

  // 3. Fallback to Timeline if keyPoints was empty
  if (keyPoints.length === 0 && Array.isArray(summary.timeline) && summary.timeline.length > 0) {
    summary.timeline.forEach((tl) => {
      rootChildren.push({
        id: createNodeId('tl'),
        label: stripMarkdownFormatting(tl.topic || 'Tópico'),
        note: stripMarkdownFormatting(tl.summary || ''),
        timestamp: tl.timestamp || '',
        category: 'module',
        collapsed: false,
        children: tl.visualCue
          ? [
              {
                id: createNodeId('vis'),
                label: `Tela: ${stripMarkdownFormatting(tl.visualCue).slice(0, 42)}`,
                note: stripMarkdownFormatting(tl.visualCue),
                timestamp: tl.timestamp || '',
                category: 'visual',
                collapsed: false,
                children: []
              }
            ]
          : []
      });
    });
  }

  // 4. Practical Takeaways & Exam/Review Alerts
  const takeaways = Array.isArray(summary.practicalTakeaways) ? summary.practicalTakeaways : [];
  if (takeaways.length > 0) {
    rootChildren.push({
      id: createNodeId('rev-root'),
      label: 'Revisão & Aplicações',
      note: stripMarkdownFormatting(summary.finalConclusion || 'Pontos críticos de revisão e prática.'),
      timestamp: '',
      category: 'takeaway',
      collapsed: takeaways.length > 4,
      children: takeaways.map((t) => {
        const clean = stripMarkdownFormatting(t);
        return {
          id: createNodeId('rev'),
          label: clean.length > 52 ? `${clean.slice(0, 49).trim()}…` : clean,
          note: clean.length > 52 ? clean : '',
          timestamp: '',
          category: 'takeaway',
          collapsed: false,
          children: []
        };
      })
    });
  }

  const rootTitle = stripMarkdownFormatting(video.title || summary.videoTitle || 'Mapa Mental da Aula');
  return {
    id: 'mm-root',
    label: rootTitle.length > 64 ? `${rootTitle.slice(0, 61).trim()}…` : rootTitle,
    note: stripMarkdownFormatting(summary.tldr || ''),
    timestamp: '',
    category: 'root',
    collapsed: false,
    children: rootChildren
  };
}

// =========================================================================
// Pure Tree Manipulation Helpers
// =========================================================================
export function findNodeById(node, targetId) {
  if (!node) return null;
  if (node.id === targetId) return node;
  for (const child of node.children || []) {
    const found = findNodeById(child, targetId);
    if (found) return found;
  }
  return null;
}

export function findNodePath(node, targetId, path = []) {
  if (!node) return null;
  const nextPath = [...path, node];
  if (node.id === targetId) return nextPath;
  for (const child of node.children || []) {
    const found = findNodePath(child, targetId, nextPath);
    if (found) return found;
  }
  return null;
}

export function addChildNode(root, parentId, childData) {
  const parent = findNodeById(root, parentId);
  if (!parent) return null;
  parent.collapsed = false;
  if (!Array.isArray(parent.children)) {
    parent.children = [];
  }
  const newNode = {
    id: createNodeId('custom'),
    label: childData.label || 'Novo subtópico',
    note: childData.note || '',
    timestamp: childData.timestamp || '',
    category: parent.category === 'root' ? 'custom' : parent.category,
    collapsed: false,
    children: []
  };
  parent.children.push(newNode);
  return newNode;
}

export function deleteNodeById(root, targetId) {
  if (!root || root.id === targetId) return false;
  if (!Array.isArray(root.children)) return false;

  const idx = root.children.findIndex((c) => c.id === targetId);
  if (idx !== -1) {
    root.children.splice(idx, 1);
    return true;
  }
  return root.children.some((child) => deleteNodeById(child, targetId));
}

export function setAllCollapsed(node, collapsed, depth = 0) {
  if (!node) return;
  if (depth >= 1 && Array.isArray(node.children) && node.children.length > 0) {
    node.collapsed = collapsed;
  }
  (node.children || []).forEach((c) => setAllCollapsed(c, collapsed, depth + 1));
}

// =========================================================================
// On-Demand AI Subtree Expansion (Dossier + Surgical Video Clip)
// =========================================================================
function resolveEffectiveTimestamp(nodePath) {
  for (let i = nodePath.length - 1; i >= 0; i -= 1) {
    const ts = nodePath[i]?.timestamp;
    if (ts && parseTimestampToSeconds(ts) !== null) {
      return ts;
    }
  }
  return null;
}

export async function expandMindMapNodeWithAi({
  rootNode,
  targetNodeId,
  record,
  apiKey,
  selectedModel,
  outputLanguage = 'Português do Brasil'
}) {
  const path = findNodePath(rootNode, targetNodeId);
  if (!path || path.length === 0) {
    throw new Error('Nó não encontrado no mapa mental.');
  }

  const targetNode = path[path.length - 1];
  const breadcrumb = path.map((n) => n.label).join(' > ');
  const existingChildrenLabels = (targetNode.children || []).map((c) => c.label).join('; ');

  // Check if node or ancestor has a timestamp so we can inspect ONLY that 2m15s clip of the video!
  const effectiveTs = resolveEffectiveTimestamp(path);
  const sec = effectiveTs ? parseTimestampToSeconds(effectiveTs) : null;
  const canClipVideo = Boolean(record?.video?.canonicalUrl && sec !== null);

  let videoMetadata = null;
  if (canClipVideo) {
    const { padBeforeSec, padAfterSec } = VIDEO_SAMPLING_PROFILES.qa_clip;
    const start = Math.max(0, sec - padBeforeSec);
    const end = start + padBeforeSec + padAfterSec;
    videoMetadata = {
      fps: 0.4,
      startOffset: `${start}s`,
      endOffset: `${end}s`
    };
  }

  const summary = record?.summary || {};
  const compactContext = [
    `Aula: "${record?.video?.title || summary.videoTitle}"`,
    `Síntese geral: ${summary.tldr || ''}`,
    (summary.conceptsGlossary || []).length > 0
      ? `Conceitos: ${summary.conceptsGlossary.map((g) => `${g.term}: ${g.definition}`).join(' | ')}`
      : '',
    (summary.keyPoints || []).length > 0
      ? `Módulos: ${summary.keyPoints.map((k) => `[${k.timestamp}] ${k.title}: ${k.detail}`).join('\n')}`
      : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  const systemInstruction = [
    'Você é um Professor Especialista em Mapas Mentais Acadêmicos de Alta Densidade.',
    `Idioma obrigatório: ${outputLanguage}.`,
    'Decomponha o nó selecionado em 3 a 5 sub-nós teóricos enxutos (definições, mecanismos, propriedades, fórmulas, exemplos ou detalhes mostrados no slide/quadro).',
    'Proibido meta-linguagem ("O professor fala..."). Escreva conceitos diretos e precisos.'
  ].join('\n');

  const promptText = [
    `CONTEXTO TEÓRICO DA AULA:\n${compactContext}`,
    `CAMINHO DO NÓ A EXPANDIR: ${breadcrumb}`,
    targetNode.note ? `NOTA ATUAL DO NÓ: ${targetNode.note}` : '',
    existingChildrenLabels
      ? `SUB-NÓS JÁ EXISTENTES (NÃO REPITA): ${existingChildrenLabels}`
      : '',
    'Retorne EXCLUSIVAMENTE JSON válido no formato {"children": [{"label": "...", "note": "...", "timestamp": "MM:SS"}]}.'
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await callGeminiMultimodal({
    apiKey,
    selectedModel: selectedModel || 'gemini-3.6-flash',
    canonicalUrl: canClipVideo ? record.video.canonicalUrl : null,
    videoMetadata,
    systemInstruction,
    promptText,
    expectJson: true,
    responseSchema: MINDMAP_EXPANSION_SCHEMA,
    thinkingBudget: THINKING_BUDGET_BY_MODE.qa,
    maxOutputTokens: 2048,
    temperature: 0.2
  });

  let cleaned = (res.text || '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  const rawChildren = Array.isArray(parsed?.children) ? parsed.children : [];

  if (rawChildren.length === 0) {
    throw new Error('A IA não encontrou novos subtópicos adicionais para este ramo.');
  }

  targetNode.collapsed = false;
  if (!Array.isArray(targetNode.children)) {
    targetNode.children = [];
  }

  const addedNodes = rawChildren.map((item) => {
    const newNode = {
      id: createNodeId('ai'),
      label: stripMarkdownFormatting(item.label || 'Subconceito').slice(0, 65),
      note: stripMarkdownFormatting(item.note || ''),
      timestamp: item.timestamp || effectiveTs || '',
      category: targetNode.category === 'root' ? 'module' : targetNode.category,
      collapsed: false,
      children: []
    };
    targetNode.children.push(newNode);
    return newNode;
  });

  return {
    addedNodes,
    usedVideoClip: canClipVideo,
    clipRange: videoMetadata ? `${videoMetadata.startOffset}–${videoMetadata.endOffset}` : null
  };
}
