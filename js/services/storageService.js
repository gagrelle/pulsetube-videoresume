/**
 * PulseTube AI — Browser LocalStorage Persistence Service (Resilient BYOK Storage)
 */

import { MAX_HISTORY_ITEMS, STORAGE_KEYS } from '../config/constants.js';

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage access errors in strict privacy modes
  }
}

export function getSavedApiKey() {
  return safeGet(STORAGE_KEYS.API_KEY);
}

export function saveApiKey(apiKey) {
  return safeSet(STORAGE_KEYS.API_KEY, apiKey);
}

export function clearSavedApiKey() {
  safeRemove(STORAGE_KEYS.API_KEY);
}

export function getSavedTheme() {
  const stored = safeGet(STORAGE_KEYS.THEME);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

export function saveTheme(theme) {
  safeSet(STORAGE_KEYS.THEME, theme);
}

export function getSavedModel() {
  return safeGet(STORAGE_KEYS.MODEL);
}

export function saveSelectedModel(model) {
  safeSet(STORAGE_KEYS.MODEL, model);
}

export function getSavedHistory() {
  try {
    const parsed = JSON.parse(safeGet(STORAGE_KEYS.HISTORY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecordToHistory(record) {
  try {
    const list = getSavedHistory();
    const deduped = list.filter(
      (item) => !(record.video.videoId && item.video?.videoId === record.video.videoId)
    );
    deduped.unshift(record);
    safeSet(STORAGE_KEYS.HISTORY, JSON.stringify(deduped.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // Ignore storage quota issues
  }
}

export function clearSavedHistory() {
  safeRemove(STORAGE_KEYS.HISTORY);
}
