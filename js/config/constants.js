/**
 * PulseTube AI — Application Configuration & Constants
 */

const ENV_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || '';

/**
 * Arquitetura BYOK (Bring Your Own Key):
 * Em produção pública, deixe VITE_GEMINI_API_KEY vazio para que cada usuário informe
 * sua própria chave gratuita do Google AI Studio (salva apenas no localStorage dele).
 */
export const DEFAULT_API_KEY = ENV_API_KEY || '';

export const STORAGE_KEYS = {
  API_KEY: 'pulsetube_gemini_api_key_v1',
  THEME: 'pulsetube_theme_v1',
  HISTORY: 'pulsetube_history_v1',
  MODEL: 'pulsetube_selected_model_v1'
};

export const DEFAULT_AVAILABLE_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3-flash-preview'
];

export const PREFERRED_MODEL_ORDER = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash-lite'
];

export const EXCLUDED_MODEL_KEYWORDS = [
  'embedding',
  'imagen',
  'veo',
  'tts',
  'audio',
  'image',
  'aqa',
  'robotics',
  'computer-use',
  'gemma',
  'bisheng',
  'transcribe',
  'nano-banana',
  'customtools'
];

/**
 * Multimodal token-saving profiles for video lessons:
 * - lecture_standard: 0.2 FPS (1 frame every 5s) preserves full slide/code/board sharpness
 *   and 100% of continuous audio while cutting ~75% of redundant static-slide frame tokens.
 * - lecture_long_fallback: 0.1 FPS + MEDIA_RESOLUTION_LOW for 2h-3h+ classes that exceed context.
 * - qa_clip: targeted temporal window around a cited timestamp in follow-up Q&A.
 */
export const VIDEO_SAMPLING_PROFILES = {
  lecture_standard: {
    fps: 0.2,
    mediaResolution: null
  },
  lecture_long_fallback: {
    fps: 0.1,
    mediaResolution: 'MEDIA_RESOLUTION_LOW'
  },
  qa_clip: {
    fps: 0.5,
    padBeforeSec: 45,
    padAfterSec: 90
  }
};

export const MODE_DIRECTIVES = {
  deep_study:
    'MODO RESUMO TEÓRICO INTEGRAL (VIDEOAULA): Atue como professor catedrático redigindo uma apostila completa e rigorosa sobre o tema da aula. Cubra 100% dos tópicos do início ao fim SEM LACUNAS. Formalize todas as definições, mecanismos teóricos (como e por que funcionam), propriedades, classificações, relações de causa/efeito, fórmulas, trechos de código, esquemas mostrados nos slides/quadro e exemplos resolvidos.',
  executive:
    'MODO SÍNTESE CONCEITUAL DIRETA: Extraia a espinha dorsal teórica e a tese central do vídeo com alta densidade informacional, cobrindo os pilares essenciais, conceitos-chave e conclusões sem omitir elos lógicos importantes.',
  actionable:
    'MODO PRÁTICO & RESOLUÇÃO: Foque em métodos passo a passo, aplicação de fórmulas/técnicas, frameworks, ferramentas demonstradas, resolução de exercícios e recomendações diretamente aplicáveis.',
  chronological:
    'MODO ROTEIRO SEQUENCIAL DE AULA: Mapeie minuciosamente cada bloco cronológico da aula do início ao fim, detalhando a evolução teórica em cada timestamp e transcrevendo o que aparece nos slides/tela.'
};

export const THINKING_BUDGET_BY_MODE = {
  deep_study: 512,
  chronological: 384,
  actionable: 256,
  executive: 256,
  qa: 256
};

export const MAX_HISTORY_ITEMS = 12;
