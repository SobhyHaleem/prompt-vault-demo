'use strict';

(function initDemoPage() {
  const SETTINGS_KEY = 'promptVaultDemo:settings';
  const STORAGE_PREFIX = 'promptVaultDemo:';
  const POPUP_WIDTH = 400;
  const POPUP_HEIGHT = 580;

  const frame = document.getElementById('popupFrame');
  const frameWrap = document.getElementById('frameWrap');
  const sizer = document.getElementById('popupSizer');
  const resetBtn = document.getElementById('resetBtn');
  const langButtons = document.querySelectorAll('[data-lang]');
  const themeButtons = document.querySelectorAll('[data-theme]');

  if (!frame || !frameWrap || !sizer || !resetBtn) {
    console.error('[PromptVault demo] Required demo elements are missing.');
    return;
  }

  function loadSettings() {
    const defaults = { lang: 'en', theme: 'dark' };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return {
        lang: parsed.lang === 'ar' ? 'ar' : 'en',
        theme: parsed.theme === 'light' ? 'light' : 'dark'
      };
    } catch (error) {
      console.warn('[PromptVault demo] Could not read saved settings:', error);
      return defaults;
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('[PromptVault demo] Could not save settings:', error);
    }
  }

  const settings = loadSettings();

  function updateButtons() {
    langButtons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.lang === settings.lang)));
    themeButtons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.theme === settings.theme)));
  }

  function loadPopup() {
    const params = new URLSearchParams({ lang: settings.lang, theme: settings.theme });
    frame.src = `popup.html?${params.toString()}`;
    updateButtons();
  }

  // On narrow screens the popup is scaled down; the sizer takes the scaled
  // dimensions so the page layout never becomes wider than the screen.
  function fitPopup() {
    const area = sizer.parentElement;
    const style = getComputedStyle(area);
    const available = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const scale = Math.min(1, available / POPUP_WIDTH);
    frameWrap.style.transform = scale < 1 ? `scale(${scale})` : '';
    sizer.style.width = `${POPUP_WIDTH * scale}px`;
    sizer.style.height = `${POPUP_HEIGHT * scale}px`;
  }

  function resetDemoData() {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(STORAGE_PREFIX) && key !== SETTINGS_KEY)
        .forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      console.error('[PromptVault demo] Could not reset demo data:', error);
    }
    loadPopup();
  }

  langButtons.forEach((btn) => btn.addEventListener('click', () => {
    if (settings.lang === btn.dataset.lang) return;
    settings.lang = btn.dataset.lang;
    saveSettings(settings);
    loadPopup();
  }));

  themeButtons.forEach((btn) => btn.addEventListener('click', () => {
    if (settings.theme === btn.dataset.theme) return;
    settings.theme = btn.dataset.theme;
    saveSettings(settings);
    loadPopup();
  }));

  resetBtn.addEventListener('click', resetDemoData);
  window.addEventListener('resize', fitPopup);

  fitPopup();
  loadPopup();
})();
