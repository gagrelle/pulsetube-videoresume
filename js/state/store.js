/**
 * PulseTube AI — Centralized Application State
 */

import { DEFAULT_API_KEY, DEFAULT_AVAILABLE_MODELS } from '../config/constants.js';

export const state = {
  apiKey: DEFAULT_API_KEY,
  availableModels: [...DEFAULT_AVAILABLE_MODELS],
  selectedMode: 'deep_study',
  currentVideo: null, // { videoId, canonicalUrl, title, channel, thumbnail }
  currentResult: null, // structured summary object + metadata
  qaHistory: [], // { role: 'user' | 'model', text: string }
  activeAbortController: null,
  timerInterval: null,
  stepTimeouts: [],
  playerReadyWithJsApi: false
};
