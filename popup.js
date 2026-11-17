'use strict';

/* =========================================================
   Configuration
   ========================================================= */

const STORAGE_KEY = 'promptVault.prompts.v1';
const ALL_CATEGORIES = '__all__';
const TOAST_DURATION_MS = 2200;
const COPY_FEEDBACK_MS = 1200;
const LIMITS = Object.freeze({ title: 100, category: 40, content: 20000 });

const ICONS = Object.freeze({
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>',
  delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>'
});

/* =========================================================
   Internationalization
   ========================================================= */

/**
 * Returns the translated message for `key`, falling back to the key itself
 * so a missing translation is visible instead of rendering an empty string.
 */
function t(key, substitutions) {
  try {
    const message = chrome.i18n.getMessage(key, substitutions);
    return message || key;
  } catch (error) {
    console.error(`[PromptVault] i18n lookup failed for "${key}":`, error);
    return key;
  }
}

// Language and direction come from the locale file actually in use, so the
// layout always matches the text even when Chrome falls back to English.
const LANG = t('languageCode') === 'languageCode' ? 'en' : t('languageCode');
const DIR = t('textDirection') === 'rtl' ? 'rtl' : 'ltr';
// Latin digits keep numbers consistent with the character counter.
const FORMAT_LOCALE = `${LANG}-u-nu-latn`;

const pluralRules = new Intl.PluralRules(LANG);
const relativeTimeFormat = new Intl.RelativeTimeFormat(FORMAT_LOCALE, { numeric: 'auto' });

function applyTranslations(root = document) {
  document.documentElement.lang = LANG;
  document.documentElement.dir = DIR;

  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
}

function formatPromptCount(count) {
  const category = count === 0 ? 'zero' : pluralRules.select(count);
  const message = t(`promptCount_${category}`, [String(count)]);
  return message === `promptCount_${category}`
    ? t('promptCount_other', [String(count)])
    : message;
}

function getDefaultCategory() {
  return t('defaultCategory');
}

/* =========================================================
   DOM references & state
   ========================================================= */

function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: #${id}`);
  }
  return element;
}

const dom = {
  addBtn: getElement('addBtn'),
  countLabel: getElement('countLabel'),
  listView: getElement('listView'),
  searchInput: getElement('searchInput'),
  categoryChips: getElement('categoryChips'),
  promptList: getElement('promptList'),
  emptyState: getElement('emptyState'),
  emptyTitle: getElement('emptyTitle'),
  emptyText: getElement('emptyText'),
  formView: getElement('formView'),
  promptForm: getElement('promptForm'),
  formTitle: getElement('formTitle'),
  titleInput: getElement('titleInput'),
  categoryInput: getElement('categoryInput'),
  categoryList: getElement('categoryList'),
  contentInput: getElement('contentInput'),
  charCount: getElement('charCount'),
  charLimit: getElement('charLimit'),
  formError: getElement('formError'),
  saveBtn: getElement('saveBtn'),
  cancelBtn: getElement('cancelBtn'),
  confirmDialog: getElement('confirmDialog'),
  confirmText: getElement('confirmText'),
  confirmDeleteBtn: getElement('confirmDeleteBtn'),
  cancelDeleteBtn: getElement('cancelDeleteBtn'),
  toast: getElement('toast')
};

const state = {
  prompts: [],
  activeCategory: ALL_CATEGORIES,
  query: '',
  editingId: null,
  pendingDeleteId: null,
  isSaving: false
};

let toastTimer = null;

/* =========================================================
   Storage (chrome.storage.local)
   ========================================================= */

function isValidPrompt(item) {
  return Boolean(item) &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.content === 'string' &&
    typeof item.category === 'string';
}

function normalizePrompt(item) {
  const now = Date.now();
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    category: item.category.trim() || getDefaultCategory(),
    createdAt: Number.isFinite(item.createdAt) ? item.createdAt : now,
    updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : now,
    copyCount: Number.isFinite(item.copyCount) ? item.copyCount : 0
  };
}

function createSeedPrompts() {
  const now = Date.now();
  return [
    {
      id: crypto.randomUUID(),
      title: t('seedCodeReviewTitle'),
      category: t('seedCodeReviewCategory'),
      content: t('seedCodeReviewContent'),
      createdAt: now,
      updatedAt: now,
      copyCount: 0
    },
    {
      id: crypto.randomUUID(),
      title: t('seedSummaryTitle'),
      category: t('seedSummaryCategory'),
      content: t('seedSummaryContent'),
      createdAt: now - 1,
      updatedAt: now - 1,
      copyCount: 0
    }
  ];
}

async function backupCorruptedData(data) {
  try {
    await chrome.storage.local.set({ [`${STORAGE_KEY}.corrupted.${Date.now()}`]: data });
  } catch (error) {
    console.error('[PromptVault] Failed to back up corrupted data:', error);
  }
}

async function persist(prompts) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: prompts });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PromptVault] Failed to save prompts:', error);
    showToast(message.includes('QUOTA_BYTES') ? t('errorQuota') : t('errorSaveFailed'), 'error');
    return false;
  }
}

async function loadPrompts() {
  let stored;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    stored = result[STORAGE_KEY];
  } catch (error) {
    console.error('[PromptVault] chrome.storage is not accessible:', error);
    showToast(t('errorStorageUnavailable'), 'error');
    return [];
  }

  if (stored === undefined) {
    const seed = createSeedPrompts();
    await persist(seed);
    return seed;
  }

  if (!Array.isArray(stored)) {
    console.error('[PromptVault] Stored data is corrupted: expected an array, got', typeof stored);
    await backupCorruptedData(stored);
    showToast(t('errorCorruptedData'), 'error');
    return [];
  }

  return stored.filter(isValidPrompt).map(normalizePrompt);
}

async function commit(nextPrompts) {
  if (!(await persist(nextPrompts))) {
    return false;
  }
  state.prompts = nextPrompts;
  return true;
}

async function addPrompt({ title, category, content }) {
  const now = Date.now();
  const prompt = {
    id: crypto.randomUUID(),
    title,
    category,
    content,
    createdAt: now,
    updatedAt: now,
    copyCount: 0
  };
  return commit([prompt, ...state.prompts]);
}

async function updatePrompt(id, changes) {
  const exists = state.prompts.some((p) => p.id === id);
  if (!exists) {
    showToast(t('errorNotFound'), 'error');
    return false;
  }
  const next = state.prompts.map((p) =>
    p.id === id ? { ...p, ...changes, updatedAt: Date.now() } : p
  );
  return commit(next);
}

async function deletePrompt(id) {
  const next = state.prompts.filter((p) => p.id !== id);
  if (next.length === state.prompts.length) {
    showToast(t('errorNotFound'), 'error');
    return false;
  }
  return commit(next);
}

async function incrementCopyCount(id) {
  const next = state.prompts.map((p) =>
    p.id === id ? { ...p, copyCount: p.copyCount + 1 } : p
  );
  await commit(next);
}

/* =========================================================
   Search & filtering
   ========================================================= */

/**
 * Lower-cases text and folds common Arabic letter variants and diacritics,
 * so searches match regardless of spelling variations. Harmless for other
 * languages.
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

function getCategories() {
  const counts = new Map();
  for (const prompt of state.prompts) {
    counts.set(prompt.category, (counts.get(prompt.category) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b, LANG))
    .map(([name, count]) => ({ name, count }));
}

function getFilteredPrompts() {
  const terms = normalizeText(state.query).split(/\s+/).filter(Boolean);

  return state.prompts
    .filter((prompt) => {
      if (state.activeCategory !== ALL_CATEGORIES && prompt.category !== state.activeCategory) {
        return false;
      }
      if (terms.length === 0) {
        return true;
      }
      const haystack = normalizeText(`${prompt.title} ${prompt.content} ${prompt.category}`);
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/* =========================================================
   Rendering
   ========================================================= */

function createChip(label, count, value) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.dataset.category = value;
  if (state.activeCategory === value) {
    chip.classList.add('active');
  }

  const text = document.createElement('span');
  text.textContent = label;

  const counter = document.createElement('span');
  counter.className = 'chip-count';
  counter.textContent = String(count);

  chip.append(text, counter);
  return chip;
}

function renderChips() {
  const categories = getCategories();

  const activeStillExists = state.activeCategory === ALL_CATEGORIES ||
    categories.some((c) => c.name === state.activeCategory);
  if (!activeStillExists) {
    state.activeCategory = ALL_CATEGORIES;
  }

  const chips = [createChip(t('allCategories'), state.prompts.length, ALL_CATEGORIES)];
  for (const { name, count } of categories) {
    chips.push(createChip(name, count, name));
  }
  dom.categoryChips.replaceChildren(...chips);
}

function formatRelativeDate(timestamp) {
  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return relativeTimeFormat.format(0, 'second');
  if (diffMs < hour) return relativeTimeFormat.format(-Math.floor(diffMs / minute), 'minute');
  if (diffMs < day) return relativeTimeFormat.format(-Math.floor(diffMs / hour), 'hour');
  if (diffMs < 30 * day) return relativeTimeFormat.format(-Math.floor(diffMs / day), 'day');
  return new Date(timestamp).toLocaleDateString(FORMAT_LOCALE);
}

function createIconButton(action, title, iconSvg, extraClass) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = extraClass ? `icon-btn ${extraClass}` : 'icon-btn';
  button.dataset.action = action;
  button.title = title;
  button.setAttribute('aria-label', title);
  // Static, trusted SVG markup only — user content always goes through textContent.
  button.innerHTML = iconSvg;
  return button;
}

function createCard(prompt) {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.id = prompt.id;

  const head = document.createElement('div');
  head.className = 'card-head';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.dir = 'auto';
  title.textContent = prompt.title;
  title.title = prompt.title;

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.dir = 'auto';
  badge.textContent = prompt.category;

  head.append(title, badge);

  const content = document.createElement('p');
  content.className = 'card-content';
  content.textContent = prompt.content;

  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const meta = document.createElement('span');
  meta.className = 'card-meta';
  const dateText = formatRelativeDate(prompt.updatedAt);
  meta.textContent = prompt.copyCount > 0
    ? `${dateText} · ${t('copyCountMeta', [String(prompt.copyCount)])}`
    : dateText;

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn-primary btn-copy';
  copyBtn.dataset.action = 'copy';
  copyBtn.textContent = t('copyButton');

  actions.append(
    copyBtn,
    createIconButton('edit', t('editButton'), ICONS.edit),
    createIconButton('delete', t('deleteButton'), ICONS.delete, 'danger')
  );

  footer.append(meta, actions);
  card.append(head, content, footer);
  return card;
}

function renderList() {
  const filtered = getFilteredPrompts();
  dom.promptList.replaceChildren(...filtered.map(createCard));

  const isEmpty = filtered.length === 0;
  dom.emptyState.hidden = !isEmpty;
  dom.promptList.hidden = isEmpty;

  if (isEmpty) {
    const hasPrompts = state.prompts.length > 0;
    dom.emptyTitle.textContent = t(hasPrompts ? 'emptyNoResultsTitle' : 'emptyNoPromptsTitle');
    dom.emptyText.textContent = t(hasPrompts ? 'emptyNoResultsText' : 'emptyNoPromptsText');
  }
}

function renderCount() {
  dom.countLabel.textContent = formatPromptCount(state.prompts.length);
}

function render() {
  renderChips();
  renderList();
  renderCount();
}

/* =========================================================
   Clipboard
   ========================================================= */

async function copyToClipboard(text) {
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    console.error('[PromptVault] Clipboard API is not available');
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('[PromptVault] Clipboard write failed:', error);
    return false;
  }
}

/* =========================================================
   Actions
   ========================================================= */

async function handleCopy(id, button) {
  const prompt = state.prompts.find((p) => p.id === id);
  if (!prompt) {
    showToast(t('errorNotFound'), 'error');
    return;
  }

  const success = await copyToClipboard(prompt.content);
  if (!success) {
    showToast(t('errorCopyFailed'), 'error');
    return;
  }

  button.textContent = t('copiedButton');
  button.classList.add('copied');
  button.disabled = true;
  showToast(t('toastCopied'), 'success');

  setTimeout(async () => {
    try {
      await incrementCopyCount(id);
    } finally {
      renderList();
    }
  }, COPY_FEEDBACK_MS);
}

function requestDelete(id) {
  const prompt = state.prompts.find((p) => p.id === id);
  if (!prompt) {
    showToast(t('errorNotFound'), 'error');
    return;
  }
  state.pendingDeleteId = id;
  dom.confirmText.textContent = t('deleteDialogText', [prompt.title]);
  dom.confirmDialog.showModal();
  dom.cancelDeleteBtn.focus();
}

async function confirmDelete() {
  const id = state.pendingDeleteId;
  dom.confirmDialog.close();
  if (id && (await deletePrompt(id))) {
    render();
    showToast(t('toastDeleted'), 'success');
  }
}

/* =========================================================
   Form
   ========================================================= */

function populateCategoryDatalist() {
  const options = getCategories().map(({ name }) => {
    const option = document.createElement('option');
    option.value = name;
    return option;
  });
  dom.categoryList.replaceChildren(...options);
}

function updateCharCount() {
  dom.charCount.textContent = String(dom.contentInput.value.length);
}

function showFormError(message) {
  dom.formError.textContent = message;
  dom.formError.hidden = false;
}

function clearFormError() {
  dom.formError.textContent = '';
  dom.formError.hidden = true;
}

function openForm(prompt = null) {
  state.editingId = prompt ? prompt.id : null;
  dom.formTitle.textContent = t(prompt ? 'formTitleEdit' : 'formTitleNew');
  dom.titleInput.value = prompt ? prompt.title : '';
  dom.categoryInput.value = prompt
    ? prompt.category
    : (state.activeCategory !== ALL_CATEGORIES ? state.activeCategory : '');
  dom.contentInput.value = prompt ? prompt.content : '';

  populateCategoryDatalist();
  updateCharCount();
  clearFormError();

  dom.listView.hidden = true;
  dom.addBtn.hidden = true;
  dom.formView.hidden = false;
  dom.titleInput.focus();
}

function closeForm() {
  state.editingId = null;
  dom.promptForm.reset();
  clearFormError();

  dom.formView.hidden = true;
  dom.listView.hidden = false;
  dom.addBtn.hidden = false;
  render();
  dom.searchInput.focus();
}

function readFormValues() {
  return {
    title: dom.titleInput.value.trim(),
    category: dom.categoryInput.value.trim().replace(/\s+/g, ' ') || getDefaultCategory(),
    content: dom.contentInput.value.trim()
  };
}

function validateForm({ title, category, content }) {
  if (!title) {
    return { field: dom.titleInput, message: t('errorTitleRequired') };
  }
  if (title.length > LIMITS.title) {
    return { field: dom.titleInput, message: t('errorTitleTooLong', [String(LIMITS.title)]) };
  }
  if (category.length > LIMITS.category) {
    return { field: dom.categoryInput, message: t('errorCategoryTooLong', [String(LIMITS.category)]) };
  }
  if (!content) {
    return { field: dom.contentInput, message: t('errorContentRequired') };
  }
  if (content.length > LIMITS.content) {
    return { field: dom.contentInput, message: t('errorContentTooLong', [String(LIMITS.content)]) };
  }
  return null;
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.isSaving) return;

  const values = readFormValues();
  const error = validateForm(values);

  if (error) {
    showFormError(error.message);
    error.field.focus();
    return;
  }

  state.isSaving = true;
  dom.saveBtn.disabled = true;

  try {
    const isEdit = state.editingId !== null;
    const success = isEdit
      ? await updatePrompt(state.editingId, values)
      : await addPrompt(values);

    if (success) {
      showToast(t(isEdit ? 'toastUpdated' : 'toastAdded'), 'success');
      closeForm();
    }
  } finally {
    state.isSaving = false;
    dom.saveBtn.disabled = false;
  }
}

/* =========================================================
   UI helpers
   ========================================================= */

function showToast(message, type = 'success') {
  dom.toast.textContent = message;
  dom.toast.className = `toast toast-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, TOAST_DURATION_MS);
}

function isTypingTarget(element) {
  return element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable);
}

/* =========================================================
   Events
   ========================================================= */

function handleListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const card = button.closest('.card');
  const id = card ? card.dataset.id : null;
  if (!id) return;

  switch (button.dataset.action) {
    case 'copy':
      handleCopy(id, button).catch((error) => {
        console.error('[PromptVault] Copy handler failed:', error);
        showToast(t('errorCopyFailed'), 'error');
      });
      break;
    case 'edit': {
      const prompt = state.prompts.find((p) => p.id === id);
      if (prompt) {
        openForm(prompt);
      } else {
        showToast(t('errorNotFound'), 'error');
      }
      break;
    }
    case 'delete':
      requestDelete(id);
      break;
    default:
      break;
  }
}

function handleChipClick(event) {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  state.activeCategory = chip.dataset.category;
  renderChips();
  renderList();
}

function handleGlobalKeydown(event) {
  if (dom.confirmDialog.open) return;

  const formOpen = !dom.formView.hidden;

  if (formOpen) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeForm();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      dom.promptForm.requestSubmit();
    }
    return;
  }

  if (event.key === '/' && !isTypingTarget(document.activeElement)) {
    event.preventDefault();
    dom.searchInput.focus();
    dom.searchInput.select();
  }
}

function bindEvents() {
  dom.addBtn.addEventListener('click', () => openForm());
  dom.cancelBtn.addEventListener('click', closeForm);
  dom.promptForm.addEventListener('submit', (event) => {
    handleSubmit(event).catch((error) => {
      console.error('[PromptVault] Save failed:', error);
      showToast(t('errorSaveFailed'), 'error');
    });
  });
  dom.contentInput.addEventListener('input', updateCharCount);
  [dom.titleInput, dom.categoryInput, dom.contentInput].forEach((input) => {
    input.addEventListener('input', clearFormError);
  });

  dom.searchInput.addEventListener('input', () => {
    state.query = dom.searchInput.value;
    renderList();
  });
  dom.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.searchInput.value) {
      event.preventDefault();
      dom.searchInput.value = '';
      state.query = '';
      renderList();
    }
  });

  dom.categoryChips.addEventListener('click', handleChipClick);
  dom.promptList.addEventListener('click', handleListClick);

  dom.confirmDeleteBtn.addEventListener('click', () => {
    confirmDelete().catch((error) => {
      console.error('[PromptVault] Delete failed:', error);
      showToast(t('errorSaveFailed'), 'error');
    });
  });
  dom.cancelDeleteBtn.addEventListener('click', () => dom.confirmDialog.close());
  dom.confirmDialog.addEventListener('close', () => {
    state.pendingDeleteId = null;
  });

  document.addEventListener('keydown', handleGlobalKeydown);

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[PromptVault] Unhandled promise rejection:', event.reason);
    showToast(t('errorUnexpected'), 'error');
  });
}

/* =========================================================
   Init
   ========================================================= */

async function init() {
  try {
    applyTranslations();
    dom.charLimit.textContent = String(LIMITS.content);
    dom.titleInput.maxLength = LIMITS.title;
    dom.categoryInput.maxLength = LIMITS.category;
    dom.contentInput.maxLength = LIMITS.content;

    bindEvents();
    state.prompts = await loadPrompts();
    render();
    dom.searchInput.focus();
  } catch (error) {
    console.error('[PromptVault] Initialization failed:', error);
    showToast(t('errorInit'), 'error');
  }
}

init();
