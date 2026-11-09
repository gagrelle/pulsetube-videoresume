/**
 * PulseTube AI — Deterministic Vector SVG Mind Map Layout & High-Res PNG/SVG Exporter
 * Uses pure inline-styled SVG (zero <foreignObject>) so HTML5 Canvas PNG export is
 * 100% immune to CORS/Tainted-Canvas browser security errors at 2.5x Retina DPI.
 */

import { escapeHtml, parseTimestampToSeconds, slugifyFilename } from './formatters.js';

const BRANCH_COLORS_LIGHT = [
  '#e0142a', // Signal Play Red
  '#2563eb', // Academic Cobalt
  '#0d9488', // Pulse Teal
  '#d97706', // Timecode Amber
  '#4f46e5', // Deep Indigo
  '#db2777'  // Crimson Rose
];

const BRANCH_COLORS_DARK = [
  '#ff2638', // Signal Play Red
  '#60a5fa', // Luminous Cobalt
  '#2dd4bf', // Pulse Teal
  '#fbbf24', // Timecode Amber
  '#818cf8', // Soft Indigo
  '#fb7185'  // Coral Rose
];

function getPalette(theme = 'dark') {
  const isDark = theme === 'dark';
  return {
    isDark,
    bg: isDark ? '#0b0b0d' : '#f7f5f5',
    gridDot: isDark ? '#242429' : '#dedcdc',
    card: isDark ? '#141418' : '#ffffff',
    rootCard: isDark ? '#1c1c22' : '#111114',
    rootInk: '#f8f8fa',
    rootSubInk: '#c4c4cc',
    ink: isDark ? '#f5f5f7' : '#141417',
    inkMuted: isDark ? '#a1a1aa' : '#52525b',
    border: isDark ? '#2e2e36' : '#d4d4d8',
    selectedBorder: isDark ? '#ff2638' : '#e0142a',
    selectedRing: isDark ? 'rgba(255, 38, 56, 0.28)' : 'rgba(224, 20, 42, 0.2)',
    shadow: isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(15, 15, 20, 0.1)',
    tsBg: isDark ? 'rgba(255, 38, 56, 0.16)' : 'rgba(224, 20, 42, 0.1)',
    tsInk: isDark ? '#ff5c6a' : '#c81024',
    toggleBg: isDark ? '#24242b' : '#ededf0',
    branchColors: isDark ? BRANCH_COLORS_DARK : BRANCH_COLORS_LIGHT
  };
}

export function wrapSvgLines(text, maxChars = 27, maxLines = 3) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const words = clean.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const slicedWord = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    const candidate = current ? `${current} ${slicedWord}` : slicedWord;

    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = slicedWord;
      if (lines.length >= maxLines - 1) {
        break;
      }
    }
  }

  if (current && lines.length < maxLines) {
    const usedChars = lines.join(' ').length + current.length;
    if (usedChars < clean.length - 2 && !current.endsWith('…')) {
      current =
        current.length >= maxChars
          ? `${current.slice(0, maxChars - 1).trim()}…`
          : `${current}…`;
    }
    lines.push(current);
  }

  return lines;
}

function measureNodeCard(node, depth) {
  const isRoot = depth === 0;
  const width = isRoot ? 264 : depth === 1 ? 242 : 228;
  const titleMaxChars = isRoot ? 26 : depth === 1 ? 26 : 25;
  const titleLines = wrapSvgLines(node.label || 'Tópico', titleMaxChars, isRoot ? 3 : 2);

  // Show compact note preview when it adds information beyond the label
  const showNote =
    Boolean(node.note) &&
    node.note.trim().toLowerCase() !== (node.label || '').trim().toLowerCase();
  const noteLines = showNote ? wrapSvgLines(node.note, isRoot ? 32 : 30, 2) : [];

  const hasTimestamp = Boolean(node.timestamp && parseTimestampToSeconds(node.timestamp) !== null);
  const categoryBadgeHeight = node.category === 'visual' ? 18 : 0;

  const padY = isRoot ? 16 : 12;
  const titleHeight = titleLines.length * (isRoot ? 19 : 16.5);
  const noteHeight = noteLines.length > 0 ? 6 + noteLines.length * 14 : 0;
  const tsHeight = hasTimestamp ? 24 : 0;

  const height = Math.max(
    46,
    padY * 2 + categoryBadgeHeight + titleHeight + noteHeight + tsHeight
  );

  return {
    width,
    height,
    titleLines,
    noteLines,
    hasTimestamp,
    showVisualTag: node.category === 'visual'
  };
}

/**
 * Computes deterministic left-to-right hierarchical coordinates without overlaps.
 */
export function computeMindMapLayout(rootNode) {
  const H_GAP = 68;
  const V_GAP = 16;
  const BRANCH_GAP = 26;

  const nodes = [];
  const edges = [];

  function buildSubtree(node, depth, branchIdx) {
    const metrics = measureNodeCard(node, depth);
    const visibleChildren =
      node.collapsed || !Array.isArray(node.children) ? [] : node.children;

    const childEntries = visibleChildren.map((child, idx) => {
      const resolvedBranch = depth === 0 ? idx : branchIdx;
      return buildSubtree(child, depth + 1, resolvedBranch);
    });

    let childrenSpan = 0;
    if (childEntries.length > 0) {
      const gap = depth === 0 ? BRANCH_GAP : V_GAP;
      childrenSpan =
        childEntries.reduce((acc, c) => acc + c.subtreeHeight, 0) +
        gap * (childEntries.length - 1);
    }

    const subtreeHeight = Math.max(metrics.height, childrenSpan);

    return {
      node,
      depth,
      branchIdx,
      metrics,
      childEntries,
      childrenSpan,
      subtreeHeight,
      x: 0,
      y: 0
    };
  }

  const rootEntry = buildSubtree(rootNode, 0, 0);

  function assignCoordinates(entry, leftX, centerY) {
    entry.x = leftX;
    entry.y = centerY - entry.metrics.height / 2;
    nodes.push(entry);

    if (entry.childEntries.length === 0) return;

    const gap = entry.depth === 0 ? BRANCH_GAP : V_GAP;
    const childLeftX = leftX + entry.metrics.width + H_GAP;
    let cursorY = centerY - entry.childrenSpan / 2;

    for (const childEntry of entry.childEntries) {
      const childCenterY = cursorY + childEntry.subtreeHeight / 2;
      assignCoordinates(childEntry, childLeftX, childCenterY);

      edges.push({
        from: entry,
        to: childEntry,
        branchIdx: childEntry.branchIdx
      });

      cursorY += childEntry.subtreeHeight + gap;
    }
  }

  assignCoordinates(rootEntry, 0, 0);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of nodes) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.metrics.width + 24);
    maxY = Math.max(maxY, item.y + item.metrics.height + 12);
  }

  return {
    nodes,
    edges,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(400, maxX - minX),
      height: Math.max(260, maxY - minY)
    }
  };
}

/**
 * Renders the Mind Map SVG markup.
 * - interactive = true: returns inner <g> + <svg> attributes for live pan/zoom/selection.
 * - interactive = false: returns a complete, self-contained standalone .svg document string.
 */
export function renderMindMapSvgMarkup(
  rootNode,
  { theme = 'light', interactive = true, selectedNodeId = null, exportTitle = '' } = {}
) {
  const pal = getPalette(theme);
  const layout = computeMindMapLayout(rootNode);
  const fontSans = "'Geist', 'Segoe UI', system-ui, -apple-system, sans-serif";
  const fontMono = "'Geist Mono', ui-monospace, Consolas, monospace";

  const edgesSvg = layout.edges
    .map(({ from, to, branchIdx }) => {
      const color = pal.branchColors[branchIdx % pal.branchColors.length];
      const x1 = from.x + from.metrics.width;
      const y1 = from.y + from.metrics.height / 2;
      const x2 = to.x;
      const y2 = to.y + to.metrics.height / 2;
      const dx = Math.max(28, (x2 - x1) * 0.52);

      return `<path d="M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${
        from.depth === 0 ? 2.4 : 1.75
      }" stroke-opacity="0.82" stroke-linecap="round" />`;
    })
    .join('');

  const nodesSvg = layout.nodes
    .map((entry) => {
      const { node, depth, branchIdx, metrics, x, y } = entry;
      const isRoot = depth === 0;
      const isSelected = interactive && selectedNodeId === node.id;
      const accent = isRoot
        ? pal.selectedBorder
        : pal.branchColors[branchIdx % pal.branchColors.length];

      const cardBg = isRoot ? pal.rootCard : pal.card;
      const titleFill = isRoot ? pal.rootInk : pal.ink;
      const noteFill = isRoot ? pal.rootSubInk : pal.inkMuted;
      const strokeColor = isSelected ? pal.selectedBorder : isRoot ? pal.rootCard : pal.border;
      const strokeWidth = isSelected ? 2.4 : 1.3;

      let cursorY = y + (isRoot ? 16 : 12);
      const parts = [];

      // Selection halo
      if (isSelected) {
        parts.push(
          `<rect x="${x - 4}" y="${y - 4}" width="${metrics.width + 8}" height="${
            metrics.height + 8
          }" rx="10" fill="none" stroke="${pal.selectedRing}" stroke-width="5" />`
        );
      }

      // Crisp offset shadow
      parts.push(
        `<rect x="${x + 3}" y="${y + 3}" width="${metrics.width}" height="${
          metrics.height
        }" rx="7" fill="${pal.shadow}" />`
      );

      // Card surface
      parts.push(
        `<rect x="${x}" y="${y}" width="${metrics.width}" height="${
          metrics.height
        }" rx="7" fill="${cardBg}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`
      );

      // Left branch color bar (non-root) or top accent bar (root)
      if (isRoot) {
        parts.push(
          `<rect x="${x}" y="${y}" width="${metrics.width}" height="5" rx="3" fill="${accent}" />`
        );
      } else {
        parts.push(
          `<rect x="${x}" y="${y}" width="5" height="${metrics.height}" rx="2.5" fill="${accent}" />`
        );
      }

      const textX = x + (isRoot ? 15 : 15);

      // Optional visual slide tag
      if (metrics.showVisualTag) {
        parts.push(
          `<text x="${textX}" y="${
            cursorY + 10
          }" font-family="${fontMono}" font-size="9.5" font-weight="700" fill="${accent}" letter-spacing="0.5">SLIDE / QUADRO</text>`
        );
        cursorY += 17;
      }

      // Title lines
      const titleLineStep = isRoot ? 19 : 16.5;
      const titleFontSize = isRoot ? 14.2 : depth === 1 ? 13 : 12.3;
      metrics.titleLines.forEach((line, idx) => {
        parts.push(
          `<text x="${textX}" y="${
            cursorY + 13 + idx * titleLineStep
          }" font-family="${fontSans}" font-size="${titleFontSize}" font-weight="${
            isRoot || depth === 1 ? '700' : '600'
          }" fill="${titleFill}">${escapeHtml(line)}</text>`
        );
      });
      cursorY += metrics.titleLines.length * titleLineStep;

      // Note preview lines
      if (metrics.noteLines.length > 0) {
        cursorY += 5;
        metrics.noteLines.forEach((line, idx) => {
          parts.push(
            `<text x="${textX}" y="${
              cursorY + 11 + idx * 14
            }" font-family="${fontSans}" font-size="11" fill="${noteFill}">${escapeHtml(line)}</text>`
          );
        });
        cursorY += metrics.noteLines.length * 14;
      }

      // Clickable Timestamp Pill
      if (metrics.hasTimestamp) {
        const cleanTs = node.timestamp.replace(/[\[\]()]/g, '').trim();
        const sec = parseTimestampToSeconds(cleanTs);
        const pillW = Math.max(54, cleanTs.length * 7 + 22);
        const pillY = y + metrics.height - 26;

        parts.push(
          `<g class="mm-ts-chip" ${
            interactive && sec !== null ? `data-mm-seek="${sec}"` : ''
          } style="cursor: pointer;">
            <rect x="${textX}" y="${pillY}" width="${pillW}" height="18" rx="4" fill="${pal.tsBg}" />
            <text x="${textX + 8}" y="${
              pillY + 12.5
            }" font-family="${fontMono}" font-size="10.2" font-weight="700" fill="${
              pal.tsInk
            }">▶ ${escapeHtml(cleanTs)}</text>
          </g>`
        );
      }

      // Collapse / Expand pill when node has children
      const totalChildren = Array.isArray(node.children) ? node.children.length : 0;
      if (totalChildren > 0 && !isRoot) {
        const toggleLabel = node.collapsed ? `+${totalChildren}` : '−';
        const pillW = node.collapsed ? 26 : 20;
        const pillX = x + metrics.width - pillW / 2;
        const pillY = y + metrics.height / 2 - 10;

        parts.push(
          `<g class="mm-collapse-btn" ${
            interactive ? `data-mm-toggle="${escapeHtml(node.id)}"` : ''
          } style="cursor: pointer;">
            <rect x="${pillX}" y="${pillY}" width="${pillW}" height="20" rx="10" fill="${
              node.collapsed ? accent : pal.toggleBg
            }" stroke="${pal.border}" stroke-width="1" />
            <text x="${pillX + pillW / 2}" y="${
              pillY + 13.5
            }" text-anchor="middle" font-family="${fontMono}" font-size="10.5" font-weight="700" fill="${
              node.collapsed ? '#ffffff' : pal.ink
            }">${toggleLabel}</text>
          </g>`
        );
      }

      return `<g class="mm-node" ${
        interactive ? `data-node-id="${escapeHtml(node.id)}"` : ''
      } style="cursor: pointer;">${parts.join('')}</g>`;
    })
    .join('');

  if (interactive) {
    return {
      innerMarkup: `<g class="mm-edges">${edgesSvg}</g><g class="mm-nodes">${nodesSvg}</g>`,
      bounds: layout.bounds
    };
  }

  // Standalone Export Document (.svg / .png)
  const pad = 48;
  const headerH = exportTitle ? 48 : 0;
  const vbX = Math.floor(layout.bounds.minX - pad);
  const vbY = Math.floor(layout.bounds.minY - pad - headerH);
  const vbW = Math.ceil(layout.bounds.width + pad * 2);
  const vbH = Math.ceil(layout.bounds.height + pad * 2 + headerH);

  const headerMarkup = exportTitle
    ? `<g>
        <text x="${vbX + pad}" y="${
          vbY + 34
        }" font-family="${fontMono}" font-size="12" font-weight="700" fill="${
          pal.selectedBorder
        }" letter-spacing="1.2">PULSETUBE AI · MAPA MENTAL TEÓRICO</text>
        <text x="${vbX + pad}" y="${
          vbY + 54
        }" font-family="${fontSans}" font-size="15" font-weight="700" fill="${
          pal.ink
        }">${escapeHtml(exportTitle)}</text>
      </g>`
    : '';

  const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${pal.bg}" />
  ${headerMarkup}
  <g class="mm-edges">${edgesSvg}</g>
  <g class="mm-nodes">${nodesSvg}</g>
</svg>`;

  return {
    svgString,
    width: vbW,
    height: vbH
  };
}

export function downloadMindMapSvg(rootNode, record, theme = 'light') {
  const title = record?.video?.title || record?.summary?.videoTitle || 'Mapa Mental';
  const { svgString } = renderMindMapSvgMarkup(rootNode, {
    theme,
    interactive: false,
    exportTitle: title
  });

  const slug = slugifyFilename(title, 'mapa-mental');
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-mapa-mental.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadMindMapPng(rootNode, record, theme = 'light') {
  const title = record?.video?.title || record?.summary?.videoTitle || 'Mapa Mental';
  const { svgString, width, height } = renderMindMapSvgMarkup(rootNode, {
    theme,
    interactive: false,
    exportTitle: title
  });

  // Cap scale so huge mind maps stay well within browser max canvas dimensions (~16384px)
  const maxDim = Math.max(width, height);
  const scale = maxDim * 2.5 > 12000 ? Math.max(1.2, 12000 / maxDim) : 2.5;

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const blobUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Falha ao renderizar imagem do mapa mental.'));
      image.src = blobUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Não foi possível gerar o arquivo PNG.'));
      }, 'image/png');
    });

    const slug = slugifyFilename(title, 'mapa-mental');
    const pngUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `${slug}-mapa-mental.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(pngUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
