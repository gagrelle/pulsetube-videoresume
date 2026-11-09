/**
 * PulseTube AI — Token-Optimized Pedagogical Prompt Engineering & JSON Schema
 * Designed for exhaustive, zero-gap theoretical summaries of video lessons.
 */

import { MODE_DIRECTIVES, VIDEO_SAMPLING_PROFILES } from '../config/constants.js';
import { parseTimestampToSeconds } from '../utils/formatters.js';

export const SUMMARY_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    videoTitle: { type: 'STRING' },
    channelOrSpeaker: { type: 'STRING' },
    category: { type: 'STRING' },
    estimatedDurationMinutes: { type: 'INTEGER' },
    readingTimeMinutes: { type: 'INTEGER' },
    tldr: { type: 'STRING' },
    targetAudience: { type: 'STRING' },
    conceptsGlossary: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          term: { type: 'STRING' },
          definition: { type: 'STRING' }
        },
        required: ['term', 'definition']
      }
    },
    keyPoints: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          detail: { type: 'STRING' },
          timestamp: { type: 'STRING' }
        },
        required: ['title', 'detail', 'timestamp']
      }
    },
    timeline: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          timestamp: { type: 'STRING' },
          topic: { type: 'STRING' },
          summary: { type: 'STRING' },
          visualCue: { type: 'STRING' }
        },
        required: ['timestamp', 'topic', 'summary', 'visualCue']
      }
    },
    practicalTakeaways: {
      type: 'ARRAY',
      items: { type: 'STRING' }
    },
    finalConclusion: { type: 'STRING' }
  },
  required: [
    'videoTitle',
    'channelOrSpeaker',
    'category',
    'estimatedDurationMinutes',
    'readingTimeMinutes',
    'tldr',
    'targetAudience',
    'conceptsGlossary',
    'keyPoints',
    'timeline',
    'practicalTakeaways',
    'finalConclusion'
  ]
};

/**
 * Compacts raw YouTube copied transcripts by collapsing redundant whitespace
 * and merging fragmented 2-second caption lines while preserving periodic timestamps.
 * Saves ~25-35% input tokens and supports up to ~360k chars (~4h lectures).
 */
export function compactManualTranscript(rawTranscript) {
  if (!rawTranscript) return '';

  const lines = rawTranscript
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\[(?:música|music|aplausos|applause)\]/gi, '').trim())
    .filter(Boolean);

  const merged = [];
  let pendingTs = null;
  let lastEmittedTsLine = -10;
  const tsOnlyRegex = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?$/;
  const tsInlineRegex = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.+)$/;

  for (const line of lines) {
    const onlyMatch = line.match(tsOnlyRegex);
    if (onlyMatch) {
      pendingTs = onlyMatch[1];
      continue;
    }

    let textPart = line;
    const inlineMatch = line.match(tsInlineRegex);
    if (inlineMatch) {
      pendingTs = inlineMatch[1];
      textPart = inlineMatch[2].trim();
    }

    if (!textPart) continue;

    if (pendingTs) {
      // Keep roughly 1 timestamp marker every 6 segments to save tokens while retaining timecodes
      if (merged.length - lastEmittedTsLine >= 6) {
        merged.push(`[${pendingTs}] ${textPart}`);
        lastEmittedTsLine = merged.length - 1;
      } else {
        merged.push(textPart);
      }
      pendingTs = null;
    } else {
      merged.push(textPart);
    }
  }

  return merged.join(' ').replace(/\s{2,}/g, ' ').slice(0, 360000);
}

export function buildSummaryPrompt({
  mode = 'deep_study',
  language = 'Português do Brasil',
  customFocus = '',
  knownTitle = '',
  knownChannel = '',
  manualTranscript = ''
}) {
  const systemInstruction = [
    'Você é o PulseTube AI, Professor Catedrático e Especialista em Sistematização Teórica de Videoaulas.',
    `Idioma obrigatório de saída: ${language}.`,
    MODE_DIRECTIVES[mode] || MODE_DIRECTIVES.deep_study,
    '',
    'PROTOCOLO DE QUALIDADE E ECONOMIA DE TOKENS:',
    '1. ZERO LACUNAS (COBERTURA 100%): Analise a aula integralmente do minuto 00:00 até o encerramento. Todos os conceitos, subtópicos, propriedades, classificações, demonstrações, fórmulas, códigos em tela e exemplos devem constar estruturados em conceptsGlossary e keyPoints. Escale a quantidade de módulos em keyPoints conforme a extensão real da aula (nunca omita a parte final).',
    '2. ZERO META-LINGUAGEM (ALTA DENSIDADE): Nunca gaste palavras com frases vazias como "O professor comenta sobre...", "Neste trecho o vídeo aborda..." ou "É destacada a importância de...". Escreva DIRETAMENTE a explicação teórica como em um livro-texto/apostila definitiva.',
    '3. SISTEMATIZAÇÃO FIEL: Mantenha-se estritamente dentro dos temas tratados na aula (jamais invente fatos externos), mas formalize com precisão acadêmica conceitos explicados de modo coloquial na fala ou distribuídos entre fala e slides/lousa.',
    '4. LEITURA VISUAL DE SLIDES/QUADRO: Extraia equações, trechos de código, tabelas e esquemas exibidos visualmente na tela, incorporando-os na explicação teórica e em visualCue.',
    '5. FORMATAÇÃO DIDÁTICA: Em tldr e keyPoints[].detail, use **negrito** nos conceitos centrais, `crases` para fórmulas/sintaxe/termos técnicos e quebras de linha com "- " para detalhar propriedades, etapas ou comparações. Use timestamps reais MM:SS (ou HH:MM:SS).'
  ].join('\n');

  const metaLines = [
    knownTitle ? `Título identificado: "${knownTitle}"` : '',
    knownChannel ? `Canal/Professor: "${knownChannel}"` : '',
    customFocus ? `FOCO PRIORITÁRIO DO ESTUDANTE: "${customFocus}"` : ''
  ].filter(Boolean);

  const cleanedTranscript = manualTranscript ? compactManualTranscript(manualTranscript) : '';

  const sourceBlock = cleanedTranscript
    ? `Analise integralmente a transcrição compactada da aula abaixo:\n"""\n${cleanedTranscript}\n"""`
    : 'Analise integralmente o áudio falado e os elementos visuais (slides, lousa, diagramas, código) desta videoaula.';

  // Compact JSON reminder serves as safety net if a fallback variant runs without responseSchema
  const userPrompt = [
    ...metaLines,
    sourceBlock,
    'Retorne EXCLUSIVAMENTE um objeto JSON válido com as chaves exatas: videoTitle, channelOrSpeaker, category, estimatedDurationMinutes, readingTimeMinutes, tldr, targetAudience, conceptsGlossary ([{term, definition}]), keyPoints ([{title, detail, timestamp}]), timeline ([{timestamp, topic, summary, visualCue}]), practicalTakeaways ([string]), finalConclusion.'
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    systemInstruction,
    userPrompt
  };
}

function serializeStudyDossierForQa(summary) {
  const glossaryBlock = (summary.conceptsGlossary || [])
    .map((g) => `- ${g.term}: ${g.definition}`)
    .join('\n');

  const modulesBlock = (summary.keyPoints || [])
    .map((kp) => `[${kp.timestamp || '00:00'}] ${kp.title}:\n${kp.detail}`)
    .join('\n\n');

  const timelineBlock = (summary.timeline || [])
    .map(
      (tl) =>
        `[${tl.timestamp || '00:00'}] ${tl.topic}: ${tl.summary}${
          tl.visualCue ? ` (Tela/Slide: ${tl.visualCue})` : ''
        }`
    )
    .join('\n');

  const takeawaysBlock = (summary.practicalTakeaways || []).map((t) => `- ${t}`).join('\n');

  return [
    `AULA: "${summary.videoTitle}" (${summary.channelOrSpeaker})`,
    `SÍNTESE TEÓRICA:\n${summary.tldr}`,
    glossaryBlock ? `GLOSSÁRIO & FÓRMULAS:\n${glossaryBlock}` : '',
    modulesBlock ? `MÓDULOS TEÓRICOS EXTRAÍDOS:\n${modulesBlock}` : '',
    timelineBlock ? `LINHA DO TEMPO & SLIDES:\n${timelineBlock}` : '',
    takeawaysBlock ? `PONTOS DE ATENÇÃO & APLICAÇÃO:\n${takeawaysBlock}` : '',
    summary.finalConclusion ? `CONCLUSÃO:\n${summary.finalConclusion}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
}

function extractTargetClipMetadata(question) {
  const matches = [...question.matchAll(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g)];
  if (matches.length === 0) return null;

  const secondsList = matches
    .map((m) => parseTimestampToSeconds(m[1]))
    .filter((s) => s !== null);

  if (secondsList.length === 0) return null;

  const minSec = Math.min(...secondsList);
  const maxSec = Math.max(...secondsList);
  const { fps, padBeforeSec, padAfterSec } = VIDEO_SAMPLING_PROFILES.qa_clip;

  const start = Math.max(0, minSec - padBeforeSec);
  // Cap maximum clip window to 6 minutes so token usage stays tiny
  const end = Math.min(maxSec + padAfterSec, start + 360);

  return {
    fps,
    startOffset: `${start}s`,
    endOffset: `${end}s`
  };
}

/**
 * Builds a token-optimized Q&A plan:
 * - Default: uses the rich extracted theoretical dossier (~2k-4k tokens, saving ~98% vs re-sending full video).
 * - Timestamp cited in question: attaches ONLY the targeted video clip [t-45s, t+90s] via videoMetadata!
 * - forceVideoInspection = true: attaches full video at 0.2 fps when raw visual re-inspection is explicitly requested.
 */
export function buildQaRequestPlan({
  video,
  summary,
  manualTranscript,
  outputLanguage,
  qaHistory,
  question,
  forceVideoInspection = false
}) {
  const dossier = serializeStudyDossierForQa(summary);
  const clipMeta = extractTargetClipMetadata(question);

  const canUseVideoUrl = Boolean(video?.canonicalUrl && !manualTranscript);
  const attachVideoClip = canUseVideoUrl && Boolean(clipMeta);
  const attachFullVideo = canUseVideoUrl && !attachVideoClip && forceVideoInspection;

  const canonicalUrl = attachVideoClip || attachFullVideo ? video.canonicalUrl : null;
  const videoMetadata = attachVideoClip
    ? clipMeta
    : attachFullVideo
      ? { fps: VIDEO_SAMPLING_PROFILES.lecture_standard.fps }
      : null;

  const systemInstruction = [
    `Você é um Tutor Acadêmico Especialista respondendo dúvidas sobre a aula "${video?.title || summary.videoTitle}".`,
    `Responda em ${outputLanguage} com rigor didático, clareza teórica, exemplos e cite timestamps no formato [MM:SS] sempre que aplicável.`,
    !canonicalUrl && canUseVideoUrl
      ? 'Você está operando no modo econômico de alta velocidade baseado no Dossiê Teórico Completo da aula. Se o estudante perguntar sobre um detalhe visual minúsculo não registrado no dossiê, indique o timestamp mais próximo [MM:SS] para que ele mencione o minuto ou marque "Inspecionar vídeo bruto".'
      : ''
  ]
    .filter(Boolean)
    .join('\n');

  const transcriptSnippet = manualTranscript
    ? `\n\nTRANSCRIÇÃO DA AULA:\n${compactManualTranscript(manualTranscript).slice(0, 180000)}`
    : '';

  const qaContextText = `${dossier}${transcriptSnippet}`;
  // Keep recent 12 messages (6 turns) to prevent unbounded history token growth
  const trimmedHistory = (qaHistory || []).slice(-12);

  return {
    canonicalUrl,
    videoMetadata,
    systemInstruction,
    qaContextText,
    historyTurns: trimmedHistory
  };
}

function repairMalformedJson(jsonCandidate) {
  // Escape stray backslashes common in LaTeX formulas (e.g., \alpha, \sigma, \lambda) that are invalid JSON escapes
  return jsonCandidate.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
}

export function normalizeSummaryPayload(rawText, videoInfo) {
  let cleaned = (rawText || '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    try {
      parsed = JSON.parse(repairMalformedJson(cleaned));
    } catch {
      parsed = null;
    }
  }

  if (parsed && typeof parsed === 'object') {
    return {
      videoTitle: parsed.videoTitle || videoInfo?.title || 'Videoaula do YouTube',
      channelOrSpeaker: parsed.channelOrSpeaker || videoInfo?.channel || 'YouTube',
      category: parsed.category || 'Estudo & Teoria',
      estimatedDurationMinutes: Number(parsed.estimatedDurationMinutes) || 15,
      readingTimeMinutes: Math.max(1, Number(parsed.readingTimeMinutes) || 4),
      tldr: parsed.tldr || 'Síntese teórica gerada com sucesso.',
      targetAudience:
        parsed.targetAudience || 'Estudantes e profissionais aprofundando o domínio teórico.',
      conceptsGlossary: Array.isArray(parsed.conceptsGlossary)
        ? parsed.conceptsGlossary.filter((c) => c && (c.term || c.definition))
        : [],
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
      practicalTakeaways: Array.isArray(parsed.practicalTakeaways)
        ? parsed.practicalTakeaways
        : [],
      finalConclusion: parsed.finalConclusion || ''
    };
  }

  return {
    videoTitle: videoInfo?.title || 'Videoaula do YouTube',
    channelOrSpeaker: videoInfo?.channel || 'YouTube',
    category: 'Síntese Teórica',
    estimatedDurationMinutes: 15,
    readingTimeMinutes: 4,
    tldr: rawText,
    targetAudience: 'Estudo Geral',
    conceptsGlossary: [],
    keyPoints: [],
    timeline: [],
    practicalTakeaways: [],
    finalConclusion: ''
  };
}
