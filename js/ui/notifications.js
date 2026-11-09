/**
 * PulseTube AI — Theme, API Status, Alert Banner & Toast Notifications
 */

import { saveTheme } from '../services/storageService.js';
import { dom } from './dom.js';

let toastTimer = null;

export function setTheme(theme, { persist = true } = {}) {
  dom.html.setAttribute('data-theme', theme);
  if (persist) {
    saveTheme(theme);
  }
}

export function setApiStatus(status, label) {
  dom.apiStatusDot.className = 'status-dot';
  if (status === 'connected') dom.apiStatusDot.classList.add('connected');
  if (status === 'error') dom.apiStatusDot.classList.add('error');
  dom.apiStatusLabel.textContent = label;
}

export function showError(title, message) {
  dom.errorTitle.textContent = title;
  dom.errorMessage.textContent = message;
  dom.errorBanner.classList.add('visible');
}

export function hideError() {
  dom.errorBanner.classList.remove('visible');
}

export function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 2800);
}
