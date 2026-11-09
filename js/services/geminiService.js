/**
 * PulseTube AI — Direct Streaming Google Gemini Multimodal Client
 * - Strictly honors the exact model selected by the user (NO automatic model switching).
 * - Real-time SSE streaming (:streamGenerateContent?alt=sse) for live progress feedback.
 * - Full Gemini 3.x & 2.5+ thinkingConfig support so Gemini 3 models don't stall in HIGH thinking.
 * - Frame-rate optimization (videoMetadata.fps = 0.2) saving ~75% visual tokens while keeping slide sharpness.
 */

import {
  EXCLUDED_MODEL_KEYWORDS,
  PREFERRED_MODEL_ORDER,
  VIDEO_SAMPLING_PROFILES
} from '../config/constants.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function discoverGeminiModels(apiKey) {
  const res = await fetch(`${GEMINI_API_BASE}?key=${encodeURIComponent(apiKey)}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }

  const discovered = (data.models || [])
    .filter((m) => {
      const id = (m.name || '').replace('models/', '');
      const supportsGen = (m.supportedGenerationMethods || []).includes('generateContent');
      const isGemini = id.startsWith('gemini-');
      const isExcluded = EXCLUDED_MODEL_KEYWORDS.some((kw) => id.includes(kw));
      return supportsGen && isGemini && !isExcluded;
    })
    .map((m) => m.name.replace('models/', ''));

  return [
    ...PREFERRED_MODEL_ORDER.filter((id) => discovered.includes(id)),
    ...discovered.filter((id) => !PREFERRED_MODEL_ORDER.includes(id))
  ];
}

function buildVideoPart(canonicalUrl, variant) {
  const part = {
    fileData: variant.includeMime
      ? { fileUri: canonicalUrl, mimeType: 'video/*' }
      : { fileUri: canonicalUrl }
  };

  if (variant.videoMeta) {
    const meta = {};
    if (typeof variant.videoMeta.fps === 'number') {
      meta.fps = variant.videoMeta.fps;
    }
    if (variant.videoMeta.startOffset) {
      meta.startOffset = variant.videoMeta.startOffset;
    }
    if (variant.videoMeta.endOffset) {
      meta.endOffset = variant.videoMeta.endOffset;
    }
    if (Object.keys(meta).length > 0) {
      part.videoMetadata = meta;
    }
  }

  return part;
}

function buildContentsPayload({
  canonicalUrl,
  promptText,
  systemInstruction,
  qaContextText,
  historyTurns,
  variant
}) {
  const inlineSystemPrefix =
    !variant.useSystemInstruction && systemInstruction ? `${systemInstruction}\n\n` : '';

  if (Array.isArray(historyTurns)) {
    const firstTurnParts = [];
    if (canonicalUrl) {
      firstTurnParts.push(buildVideoPart(canonicalUrl, variant));
    }
    firstTurnParts.push({
      text: `${inlineSystemPrefix}${qaContextText || 'Contexto da aula carregado.'}`
    });

    return [
      { role: 'user', parts: firstTurnParts },
      {
        role: 'model',
        parts: [{ text: 'Pronto. Responderei com precisão teórica e timestamps.' }]
      },
      ...historyTurns.map((turn) => ({
        role: turn.role,
        parts: [{ text: turn.text }]
      })),
      { role: 'user', parts: [{ text: promptText }] }
    ];
  }

  const userParts = [];
  if (canonicalUrl) {
    userParts.push(buildVideoPart(canonicalUrl, variant));
  }
  userParts.push({ text: `${inlineSystemPrefix}${promptText}` });

  return [{ role: 'user', parts: userParts }];
}

function modelSupportsThinkingBudget(model) {
  return /^gemini-(2\.5|3|4|flash-latest|pro-latest)/i.test(model || '');
}

function buildVariantsForModel({
  model,
  canonicalUrl,
  videoMetadata,
  expectJson,
  responseSchema,
  systemInstruction,
  thinkingBudget
}) {
  const supportsThinking =
    modelSupportsThinkingBudget(model) && Number.isInteger(thinkingBudget);

  if (!canonicalUrl) {
    return [
      {
        id: 'text_structured',
        includeMime: false,
        videoMeta: null,
        mediaResolution: null,
        jsonMode: expectJson,
        useSchema: Boolean(expectJson && responseSchema),
        useSystemInstruction: Boolean(systemInstruction),
        useThinking: supportsThinking,
        label: 'texto otimizado'
      },
      {
        id: 'text_compat',
        includeMime: false,
        videoMeta: null,
        mediaResolution: null,
        jsonMode: expectJson,
        useSchema: false,
        useSystemInstruction: false,
        useThinking: false,
        label: 'texto compatível'
      }
    ];
  }

  const baseVideoMeta = videoMetadata || { fps: VIDEO_SAMPLING_PROFILES.lecture_standard.fps };

  return [
    {
      id: 'optimal_lecture',
      includeMime: true,
      videoMeta: baseVideoMeta,
      mediaResolution: null,
      jsonMode: expectJson,
      useSchema: Boolean(expectJson && responseSchema),
      useSystemInstruction: Boolean(systemInstruction),
      useThinking: supportsThinking,
      label: baseVideoMeta.startOffset
        ? `recorte (${baseVideoMeta.startOffset}–${baseVideoMeta.endOffset})`
        : `${baseVideoMeta.fps || 0.2} fps`
    },
    {
      id: 'long_video_low_res',
      includeMime: true,
      videoMeta: {
        ...baseVideoMeta,
        fps: VIDEO_SAMPLING_PROFILES.lecture_long_fallback.fps
      },
      mediaResolution: VIDEO_SAMPLING_PROFILES.lecture_long_fallback.mediaResolution,
      jsonMode: expectJson,
      useSchema: Boolean(expectJson && responseSchema),
      useSystemInstruction: Boolean(systemInstruction),
      useThinking: supportsThinking,
      label: '0.1 fps (aula longa)'
    },
    {
      id: 'compat_multimodal',
      includeMime: true,
      videoMeta: null,
      mediaResolution: null,
      jsonMode: expectJson,
      useSchema: false,
      useSystemInstruction: Boolean(systemInstruction),
      useThinking: false,
      label: 'multimodal padrão'
    }
  ];
}

async function extractErrorMessage(res) {
  try {
    if (typeof res.text === 'function') {
      const raw = (await res.text()).trim();
      const cleaned = raw.replace(/^data:\s*/gim, '').trim();
      const parsed = JSON.parse(cleaned);
      const errObj = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
      if (errObj?.message) return errObj.message;
      return raw.slice(0, 240) || `Erro HTTP ${res.status}`;
    }
    if (typeof res.json === 'function') {
      const data = await res.json();
      return data?.error?.message || `Erro HTTP ${res.status}`;
    }
  } catch {
    // Fallback below
  }
  return `Erro HTTP ${res.status}`;
}

function formatModelHttpError(model, status, rawMessage) {
  if (status === 503 || /high demand|overloaded|UNAVAILABLE/i.test(rawMessage)) {
    return `O modelo "${model}" está com sobrecarga temporária nos servidores do Google (HTTP 503 — alta demanda). Tente novamente em instantes ou escolha outro modelo no seletor superior (ex.: gemini-3.6-flash ou gemini-3.5-flash). Detalhe original: ${rawMessage}`;
  }
  if (status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(rawMessage)) {
    return `Limite de requisições/cota atingido no modelo "${model}" (HTTP 429). Aguarde alguns segundos ou selecione outro modelo no topo. Detalhe: ${rawMessage}`;
  }
  if (status === 404 || /no longer available|not found/i.test(rawMessage)) {
    return `O modelo "${model}" não está disponível para esta chave/conta (HTTP 404). Selecione um modelo mais recente no topo (ex.: gemini-3.6-flash). Detalhe: ${rawMessage}`;
  }
  return rawMessage;
}

function detectCurrentJsonTopic(partialJson) {
  const matches = [
    ...partialJson.matchAll(/"(?:title|topic|term)"\s*:\s*"([^"\\]{3,58})/g)
  ];
  if (matches.length === 0) return '';
  return matches[matches.length - 1][1];
}

async function consumeGeminiResponse(res, onProgress, model, variantLabel) {
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedText = '';
    let thoughtChars = 0;
    let finishReason = '';
    let blockReason = '';
    let streamError = null;
    let usage = {};

    const processLine = (rawLine) => {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) return;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]') return;

      let evt;
      try {
        evt = JSON.parse(jsonStr);
      } catch {
        return;
      }

      if (evt?.error) {
        streamError = evt.error;
        return;
      }
      if (evt?.usageMetadata) {
        usage = evt.usageMetadata;
      }
      if (evt?.promptFeedback?.blockReason) {
        blockReason = evt.promptFeedback.blockReason;
      }

      const candidate = evt?.candidates?.[0];
      if (!candidate) return;
      if (candidate.finishReason) {
        finishReason = candidate.finishReason;
      }

      const parts = candidate?.content?.parts;
      if (!Array.isArray(parts)) return;

      for (const p of parts) {
        if (p.thought && typeof p.text === 'string') {
          thoughtChars += p.text.length;
          onProgress?.({
            phase: 'thinking',
            model,
            variantLabel,
            thoughtChars
          });
        } else if (!p.thought && typeof p.text === 'string') {
          accumulatedText += p.text;
          onProgress?.({
            phase: 'streaming',
            model,
            variantLabel,
            receivedChars: accumulatedText.length,
            activeTopic: detectCurrentJsonTopic(accumulatedText)
          });
        }
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const l of lines) {
        processLine(l);
      }
    }

    if (buffer.trim()) {
      processLine(buffer);
    }

    if (streamError && !accumulatedText.trim()) {
      throw new Error(
        formatModelHttpError(
          model,
          streamError.code || 503,
          streamError.message || 'Erro retornado durante o streaming SSE.'
        )
      );
    }

    return {
      finalText: accumulatedText.trim(),
      finishReason,
      blockReason,
      usage
    };
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason || '';
  const blockReason = data?.promptFeedback?.blockReason || '';
  const usage = data?.usageMetadata || {};

  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const finalText = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim();

  return { finalText, finishReason, blockReason, usage };
}

export async function callGeminiMultimodal({
  apiKey,
  selectedModel = 'gemini-3.6-flash',
  canonicalUrl = null,
  videoMetadata = null,
  systemInstruction = '',
  promptText = '',
  qaContextText = '',
  historyTurns = null,
  expectJson = true,
  responseSchema = null,
  thinkingBudget = 512,
  maxOutputTokens = 16384,
  temperature = 0.2,
  signal = null,
  onProgress = null
}) {
  const model = selectedModel || 'gemini-3.6-flash';
  const resolvedBudget =
    model.includes('pro') && Number.isInteger(thinkingBudget)
      ? Math.max(512, thinkingBudget)
      : thinkingBudget;

  const variants = buildVariantsForModel({
    model,
    canonicalUrl,
    videoMetadata,
    expectJson,
    responseSchema,
    systemInstruction,
    thinkingBudget: resolvedBudget
  });

  let lastError = null;

  for (let vIdx = 0; vIdx < variants.length; vIdx += 1) {
    const variant = variants[vIdx];

    if (signal?.aborted) {
      throw new Error('Análise cancelada pelo usuário.');
    }

    try {
      onProgress?.({
        phase: 'connecting',
        attempt: vIdx + 1,
        model,
        variantLabel: variant.label
      });

      const contents = buildContentsPayload({
        canonicalUrl,
        promptText,
        systemInstruction,
        qaContextText,
        historyTurns,
        variant
      });

      const generationConfig = {
        temperature,
        maxOutputTokens
      };

      if (variant.mediaResolution) {
        generationConfig.mediaResolution = variant.mediaResolution;
      }
      if (variant.jsonMode) {
        generationConfig.responseMimeType = 'application/json';
        if (variant.useSchema && responseSchema) {
          generationConfig.responseSchema = responseSchema;
        }
      }
      if (variant.useThinking) {
        generationConfig.thinkingConfig = { thinkingBudget: resolvedBudget };
      }

      const requestBody = {
        contents,
        generationConfig
      };

      if (variant.useSystemInstruction && systemInstruction) {
        requestBody.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(
        model
      )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal
      });

      if (!res.ok) {
        const status = res.status;
        const rawErr = await extractErrorMessage(res);
        const formattedErr = formatModelHttpError(model, status, rawErr);
        lastError = new Error(formattedErr);

        // Only retry payload shape on 400 (e.g. context length overflow -> 0.1 fps, or unsupported parameter on same model).
        // Never switch models automatically on 404/429/503!
        if (
          status === 400 &&
          !/private|unlisted|unavailable|permission|not found|cannot access|video is not available/i.test(
            rawErr
          ) &&
          vIdx < variants.length - 1
        ) {
          const isTokenLimit = /token|too large|exceed|maximum|context|length/i.test(rawErr);
          if (variant.id === 'optimal_lecture' && !isTokenLimit) {
            const compatIdx = variants.findIndex((v) => v.id === 'compat_multimodal');
            if (compatIdx > vIdx) {
              vIdx = compatIdx - 1;
            }
          }
          onProgress?.({
            phase: 'retrying',
            model,
            reason: isTokenLimit
              ? `Vídeo extenso — ajustando amostragem para 0.1 fps em ${model}...`
              : `Ajustando formato de parâmetros para ${model}...`
          });
          continue;
        }

        throw lastError;
      }

      const { finalText, finishReason, blockReason, usage } = await consumeGeminiResponse(
        res,
        onProgress,
        model,
        variant.label
      );

      if (!finalText) {
        throw new Error(
          blockReason || finishReason
            ? `Resposta bloqueada pelo filtro da API (${blockReason || finishReason}).`
            : `O modelo "${model}" retornou uma resposta vazia para este vídeo.`
        );
      }

      return {
        text: finalText,
        modelUsed: model,
        finishReason,
        samplingLabel: variant.label,
        totalTokens: usage.totalTokenCount || null,
        promptTokens: usage.promptTokenCount || null,
        outputTokens: usage.candidatesTokenCount || null,
        thoughtTokens: usage.thoughtsTokenCount || 0
      };
    } catch (err) {
      if (err.name === 'AbortError' || signal?.aborted) {
        throw new Error('Análise cancelada pelo usuário.');
      }
      throw err;
    }
  }

  throw lastError || new Error(`Falha ao consultar o modelo "${model}".`);
}

/**
 * Real-time lightweight SSE health & latency probe for the exact model chosen by the user.
 * Sends a ~7-token ping to verify live availability, quota, TTFT, and server queue state.
 */
export async function probeGeminiModelHealth({
  apiKey,
  model = 'gemini-3.6-flash',
  timeoutMs = 12000,
  signal = null
}) {
  const targetModel = model || 'gemini-3.6-flash';
  const isPro = targetModel.includes('pro');
  const t0 = performance.now();

  const internalAc = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => internalAc.abort();
  if (signal) {
    if (signal.aborted) {
      return { ok: false, state: 'cancelled', model: targetModel };
    }
    signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    internalAc.abort();
  }, timeoutMs);

  const classifyHttpFailure = (status, rawErr, latencyMs) => {
    const secStr = `${(latencyMs / 1000).toFixed(1)}s`;
    if (status === 503 || /high demand|overloaded|UNAVAILABLE/i.test(rawErr)) {
      return {
        ok: false,
        state: 'overloaded',
        model: targetModel,
        httpStatus: status || 503,
        latencyMs,
        badge: 'Sobrecarga · HTTP 503',
        pillLabel: `${targetModel} · 503`,
        detail: `Alta demanda nos servidores do Google para "${targetModel}" agora (HTTP 503 após ${secStr}). Selecione outro modelo ou tente novamente em instantes.`
      };
    }
    if (status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(rawErr)) {
      return {
        ok: false,
        state: 'quota',
        model: targetModel,
        httpStatus: status || 429,
        latencyMs,
        badge: 'Sem cota · HTTP 429',
        pillLabel: `${targetModel} · cota 429`,
        detail: `Limite de requisições atingido ou modelo fora do plano atual desta chave (HTTP 429 em ${secStr}).`
      };
    }
    if (status === 404 || /no longer available|not found/i.test(rawErr)) {
      return {
        ok: false,
        state: 'unavailable',
        model: targetModel,
        httpStatus: status || 404,
        latencyMs,
        badge: 'Indisponível · HTTP 404',
        pillLabel: `${targetModel} · 404`,
        detail: `O modelo "${targetModel}" não está disponível para esta chave/conta (HTTP 404).`
      };
    }
    if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(rawErr)) {
      return {
        ok: false,
        state: 'auth_error',
        model: targetModel,
        httpStatus: status,
        latencyMs,
        badge: 'Chave inválida',
        pillLabel: 'Chave inválida',
        detail: `Falha de autenticação na chave Gemini (${rawErr}).`
      };
    }
    return {
      ok: false,
      state: 'error',
      model: targetModel,
      httpStatus: status,
      latencyMs,
      badge: `Erro · HTTP ${status || '?'}`,
      pillLabel: `${targetModel} · erro`,
      detail: rawErr || `Falha ao testar "${targetModel}".`
    };
  };

  try {
    const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(
      targetModel
    )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

    const attemptConfigs = modelSupportsThinkingBudget(targetModel)
      ? [
          {
            temperature: 0,
            maxOutputTokens: isPro ? 256 : 32,
            thinkingConfig: { thinkingBudget: isPro ? 128 : 0 }
          },
          { temperature: 0, maxOutputTokens: 64 }
        ]
      : [{ temperature: 0, maxOutputTokens: 32 }];

    let res = null;
    for (let i = 0; i < attemptConfigs.length; i += 1) {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }],
          generationConfig: attemptConfigs[i]
        }),
        signal: internalAc.signal
      });

      if (!res.ok && res.status === 400 && i < attemptConfigs.length - 1) {
        continue;
      }
      break;
    }

    if (!res.ok) {
      const rawErr = await extractErrorMessage(res);
      const latencyMs = Math.round(performance.now() - t0);
      return classifyHttpFailure(res.status, rawErr, latencyMs);
    }

    let ttftMs = null;
    const { finalText, usage } = await consumeGeminiResponse(
      res,
      (evt) => {
        if (ttftMs === null && (evt.phase === 'streaming' || evt.phase === 'thinking')) {
          ttftMs = Math.round(performance.now() - t0);
        }
      },
      targetModel,
      'ping'
    );

    const latencyMs = Math.round(performance.now() - t0);
    const effectiveTtft = ttftMs ?? latencyMs;
    const secStr = `${(latencyMs / 1000).toFixed(2)}s`;
    const ttftStr = `${(effectiveTtft / 1000).toFixed(2)}s`;
    const isSlow = latencyMs > 4500;
    const replyClean = (finalText || 'OK').replace(/\s+/g, ' ').trim().slice(0, 24);
    const tokens = usage?.totalTokenCount || null;

    return {
      ok: true,
      state: isSlow ? 'slow' : 'healthy',
      model: targetModel,
      httpStatus: 200,
      ttftMs: effectiveTtft,
      latencyMs,
      totalTokens: tokens,
      reply: replyClean,
      badge: isSlow ? `Online (fila lenta · ${secStr})` : `Online · ${secStr}`,
      pillLabel: `${targetModel} · ${secStr}`,
      detail: isSlow
        ? `Modelo respondeu "${replyClean}", porém levou ${secStr} para concluir — há fila moderada nos servidores do Google.`
        : `Streaming SSE operacional · 1º sinal em ${ttftStr} · resposta "${replyClean}"${
            tokens ? ` (${tokens} tokens)` : ''
          }. Pronto para resumir videoaulas.`
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    if (signal?.aborted && !timedOut) {
      return { ok: false, state: 'cancelled', model: targetModel, latencyMs };
    }
    if (timedOut) {
      const waitedSec = Math.round(timeoutMs / 1000);
      return {
        ok: false,
        state: 'timeout',
        model: targetModel,
        httpStatus: null,
        latencyMs,
        badge: `Sem resposta (>${waitedSec}s)`,
        pillLabel: `${targetModel} · fila >${waitedSec}s`,
        detail: `O servidor Google não enviou resposta em ${waitedSec}s num teste mínimo de texto — "${targetModel}" está com fila travada ou alta demanda (HTTP 503 iminente).`
      };
    }
    if (/HTTP 503|high demand|UNAVAILABLE/i.test(err.message || '')) {
      return classifyHttpFailure(503, err.message, latencyMs);
    }
    return {
      ok: false,
      state: 'error',
      model: targetModel,
      httpStatus: null,
      latencyMs,
      badge: 'Falha de conexão',
      pillLabel: `${targetModel} · erro`,
      detail: err.message || 'Não foi possível alcançar o endpoint do Google Gemini.'
    };
  } finally {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}
