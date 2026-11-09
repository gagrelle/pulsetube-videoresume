/**
 * PulseTube AI — Markdown Study Note Builder & Export Actions
 */

import { slugifyFilename } from './formatters.js';

export function buildMarkdownDocument(record) {
  const { summary, video } = record;
  const glossaryLines =
    Array.isArray(summary.conceptsGlossary) && summary.conceptsGlossary.length > 0
      ? [
          '## Conceitos Fundamentais & Definições',
          ...summary.conceptsGlossary.map((g) => `- **${g.term}:** ${g.definition}`),
          ''
        ]
      : [];

  const lines = [
    `# ${video.title || summary.videoTitle}`,
    `- **Canal / Professor:** ${video.channel || summary.channelOrSpeaker}`,
    video.canonicalUrl ? `- **Link Original:** ${video.canonicalUrl}` : '',
    `- **Disciplina / Categoria:** ${summary.category}`,
    `- **Tempo de Estudo:** ~${summary.readingTimeMinutes} min de leitura vs. ~${summary.estimatedDurationMinutes} min de videoaula`,
    '',
    '## Fundamentação & Visão Geral',
    summary.tldr,
    '',
    summary.targetAudience ? `**Pré-requisitos & Contexto:** ${summary.targetAudience}` : '',
    '',
    ...glossaryLines,
    '## Desenvolvimento Teórico Completo',
    ...(summary.keyPoints || []).map(
      (kp, i) => `### ${i + 1}. [${kp.timestamp || '00:00'}] ${kp.title}\n${kp.detail}\n`
    ),
    '## Linha do Tempo & Slides',
    ...(summary.timeline || []).map(
      (tl) =>
        `- **[${tl.timestamp || '00:00'}] ${tl.topic}:** ${tl.summary}${
          tl.visualCue ? ` *(Tela/Slide: ${tl.visualCue})*` : ''
        }`
    ),
    '',
    '## Aplicações, Pontos de Atenção & Revisão',
    ...(summary.practicalTakeaways || []).map((t) => `- ${t}`),
    '',
    summary.finalConclusion ? `> **Síntese Integradora:** ${summary.finalConclusion}` : ''
  ];

  return lines.filter((l) => l !== null && l !== undefined).join('\n');
}

export async function copyMarkdownToClipboard(record) {
  const md = buildMarkdownDocument(record);
  await navigator.clipboard.writeText(md);
}

export function downloadMarkdownFile(record) {
  const md = buildMarkdownDocument(record);
  const slug = slugifyFilename(record.video?.title);

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
