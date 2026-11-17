'use strict';

/*
 * Web demo adapter for Prompt Vault.
 *
 * Provides the small subset of the Chrome extension APIs that popup.js uses,
 * so the unmodified popup can run on a normal web page:
 *   - chrome.i18n.getMessage / getUILanguage  -> translations from locales.js
 *   - chrome.storage.local.get / set / clear  -> browser localStorage
 *
 * URL parameters (set by the demo page):
 *   lang  = en | ar
 *   theme = dark | light   (omitted: follow the system setting)
 */
(function installChromeShim() {
  const params = new URLSearchParams(location.search);
  const LOCALES = window.PROMPT_VAULT_LOCALES || {};
  const lang = Object.prototype.hasOwnProperty.call(LOCALES, params.get('lang')) ? params.get('lang') : 'en';
  const theme = params.get('theme');
  const STORAGE_PREFIX = `promptVaultDemo:${lang}:`;

  /* ---------- i18n ---------- */

  function substitute(message, entry, substitutions) {
    const values = substitutions == null
      ? []
      : (Array.isArray(substitutions) ? substitutions : [substitutions]).map(String);

    let result = message;
    if (entry.placeholders) {
      result = result.replace(/\$([A-Za-z0-9_@]+)\$/g, (match, name) => {
        const placeholder = entry.placeholders[name.toLowerCase()];
        if (!placeholder) return match;
        return placeholder.content.replace(/\$(\d)/g, (m, index) => values[index - 1] ?? '');
      });
    }
    return result.replace(/\$(\d)/g, (m, index) => values[index - 1] ?? '');
  }

  function getMessage(key, substitutions) {
    const entry = (LOCALES[lang] && LOCALES[lang][key]) || (LOCALES.en && LOCALES.en[key]);
    if (!entry || typeof entry.message !== 'string') {
      console.warn(`[PromptVault demo] Missing translation key: ${key}`);
      return '';
    }
    return substitute(entry.message, entry, substitutions);
  }

  /* ---------- storage ---------- */

  const memoryFallback = new Map();
  let useLocalStorage = true;
  try {
    const probe = `${STORAGE_PREFIX}__probe__`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch (error) {
    useLocalStorage = false;
    console.warn('[PromptVault demo] localStorage unavailable, data will not survive a reload:', error);
  }

  function readItem(key) {
    if (!useLocalStorage) {
      return memoryFallback.has(key) ? JSON.parse(memoryFallback.get(key)) : undefined;
    }
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error(`[PromptVault demo] Could not parse stored value for ${key}:`, error);
      return raw;
    }
  }

  function writeItem(key, value) {
    const serialized = JSON.stringify(value);
    if (!useLocalStorage) {
      memoryFallback.set(key, serialized);
      return;
    }
    try {
      localStorage.setItem(STORAGE_PREFIX + key, serialized);
    } catch (error) {
      const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
      throw new Error(quota ? 'QUOTA_BYTES quota exceeded' : `Storage write failed: ${error.message}`);
    }
  }

  function normalizeKeys(keys) {
    if (keys == null) return null;
    if (typeof keys === 'string') return [keys];
    if (Array.isArray(keys)) return keys;
    return Object.keys(keys);
  }

  const local = {
    async get(keys) {
      const wanted = normalizeKeys(keys);
      const result = {};
      const names = wanted || (useLocalStorage
        ? Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX)).map((k) => k.slice(STORAGE_PREFIX.length))
        : [...memoryFallback.keys()]);
      for (const name of names) {
        const value = readItem(name);
        if (value !== undefined) result[name] = value;
        else if (keys && typeof keys === 'object' && !Array.isArray(keys)) result[name] = keys[name];
      }
      return result;
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        writeItem(key, value);
      }
    },
    async clear() {
      if (!useLocalStorage) {
        memoryFallback.clear();
        return;
      }
      Object.keys(localStorage)
        .filter((k) => k.startsWith(STORAGE_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    }
  };

  /* ---------- demo data ---------- */

  const DEMO_DATA = window.PROMPT_VAULT_DEMO_DATA || {};
  const STORAGE_KEY = 'promptVault.prompts.v1';
  if (readItem(STORAGE_KEY) === undefined && Array.isArray(DEMO_DATA[lang])) {
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const prompts = DEMO_DATA[lang].map((item, index) => ({
      id: `demo-${index}`,
      title: item.title,
      category: item.category,
      content: item.content,
      createdAt: now - item.ageHours * hour,
      updatedAt: now - item.ageHours * hour,
      copyCount: item.copyCount
    }));
    try {
      writeItem(STORAGE_KEY, prompts);
    } catch (error) {
      console.error('[PromptVault demo] Could not write demo data:', error);
    }
  }

  /* ---------- theme override ---------- */

  // The popup follows prefers-color-scheme. For the demo's theme switch, the
  // light-theme media rule is either applied unconditionally or removed.
  if (theme === 'dark' || theme === 'light') {
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (error) {
        continue;
      }
      for (let i = rules.length - 1; i >= 0; i -= 1) {
        const rule = rules[i];
        if (rule instanceof CSSMediaRule && rule.conditionText.includes('prefers-color-scheme: light')) {
          const inner = [...rule.cssRules].map((r) => r.cssText);
          sheet.deleteRule(i);
          if (theme === 'light') {
            inner.forEach((text) => sheet.insertRule(text, sheet.cssRules.length));
          }
        }
      }
    }
  }

  window.chrome = window.chrome || {};
  window.chrome.i18n = {
    getMessage,
    getUILanguage: () => lang
  };
  window.chrome.storage = { local };
})();
