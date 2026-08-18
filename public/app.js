const setupScreen = document.getElementById('setupScreen');
const setupForm = document.getElementById('setupForm');
const setupError = document.getElementById('setupError');
const loginScreen = document.getElementById('loginScreen');
const dashScreen = document.getElementById('dashScreen');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const whoami = document.getElementById('whoami');
const logoutBtn = document.getElementById('logoutBtn');
const createForm = document.getElementById('createForm');
const createError = document.getElementById('createError');
const cardsEl = document.getElementById('cards');
const emptyState = document.getElementById('emptyState');
const noResults = document.getElementById('noResults');
const cardTemplate = document.getElementById('cardTemplate');
const searchInput = document.getElementById('searchInput');
const resultsCount = document.getElementById('resultsCount');
const loadMoreBtn = document.getElementById('loadMoreBtn');

const tabCodesBtn = document.getElementById('tabCodesBtn');
const tabHistoryBtn = document.getElementById('tabHistoryBtn');
const tabCodes = document.getElementById('tabCodes');
const tabHistory = document.getElementById('tabHistory');

const historySearchInput = document.getElementById('historySearchInput');
const historyResultsCount = document.getElementById('historyResultsCount');
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const historyLoadMoreBtn = document.getElementById('historyLoadMoreBtn');
const historyTemplate = document.getElementById('historyTemplate');

const PAGE_SIZE = 20;
let currentSearch = '';
let currentOffset = 0;

let historySearch = '';
let historyOffset = 0;
let historyLoaded = false;

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

async function init() {
  try {
    const status = await api('/api/setup/status');
    if (status.needsSetup) {
      showSetup();
      return;
    }
  } catch {
    // если проверка не удалась, просто идём дальше к обычному входу
  }

  try {
    const me = await api('/api/me');
    whoami.textContent = me.username;
    showDash();
    await loadCodes();
  } catch {
    showLogin();
  }
}

function showSetup() {
  setupScreen.hidden = false;
  loginScreen.hidden = true;
  dashScreen.hidden = true;
}
function showLogin() {
  setupScreen.hidden = true;
  loginScreen.hidden = false;
  dashScreen.hidden = true;
}
function showDash() {
  setupScreen.hidden = true;
  loginScreen.hidden = true;
  dashScreen.hidden = false;
}

// ---------- Вкладки ----------

tabCodesBtn.addEventListener('click', () => {
  tabCodesBtn.classList.add('active');
  tabHistoryBtn.classList.remove('active');
  tabCodes.hidden = false;
  tabHistory.hidden = true;
});

tabHistoryBtn.addEventListener('click', async () => {
  tabHistoryBtn.classList.add('active');
  tabCodesBtn.classList.remove('active');
  tabCodes.hidden = true;
  tabHistory.hidden = false;
  if (!historyLoaded) {
    historyLoaded = true;
    await loadHistory({ reset: true });
  }
});

setupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setupError.textContent = '';
  const username = document.getElementById('setupUsername').value.trim();
  const password = document.getElementById('setupPassword').value;
  try {
    await api('/api/setup', { method: 'POST', body: JSON.stringify({ username, password }) });
    setupForm.reset();
    showLogin();
  } catch (err) {
    setupError.textContent = err.message;
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  try {
    const me = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    whoami.textContent = me.username;
    showDash();
    await loadCodes();
    loginForm.reset();
  } catch (err) {
    loginError.textContent = err.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  showLogin();
});

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createError.textContent = '';
  const target = document.getElementById('newTarget').value.trim();
  const label = document.getElementById('newLabel').value.trim();
  try {
    await api('/api/qrcodes', { method: 'POST', body: JSON.stringify({ target, label }) });
    createForm.reset();
    await loadCodes({ reset: true });
  } catch (err) {
    createError.textContent = err.message;
  }
});

async function loadCodes({ reset = true } = {}) {
  if (reset) {
    currentOffset = 0;
    cardsEl.innerHTML = '';
  }

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(currentOffset),
  });
  if (currentSearch) params.set('search', currentSearch);

  const { items, total } = await api(`/api/qrcodes?${params.toString()}`);

  for (const item of items) {
    cardsEl.appendChild(renderCard(item));
  }
  currentOffset += items.length;

  emptyState.hidden = currentSearch !== '' || total > 0;
  noResults.hidden = !(currentSearch !== '' && total === 0);
  loadMoreBtn.hidden = currentOffset >= total;

  resultsCount.textContent = total > 0 ? `Показано ${currentOffset} из ${total}` : '';
}

let searchDebounce;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    currentSearch = searchInput.value.trim();
    loadCodes({ reset: true });
  }, 300);
});

loadMoreBtn.addEventListener('click', () => loadCodes({ reset: false }));

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderCard(item) {
  const node = cardTemplate.content.cloneNode(true);
  const card = node.querySelector('.card');
  const img = node.querySelector('.card-qr');
  const idEl = node.querySelector('.card-id');
  const codeEl = node.querySelector('.card-code');
  const targetInput = node.querySelector('.card-target');
  const labelInput = node.querySelector('.card-label');
  const msg = node.querySelector('.card-msg');
  const downloadPanel = node.querySelector('.download-panel');
  const toggleDownloadBtn = node.querySelector('.toggle-download');
  const dlFormat = node.querySelector('.dl-format');
  const dlSize = node.querySelector('.dl-size');
  const dlCustomSize = node.querySelector('.dl-custom-size');
  const dlGoBtn = node.querySelector('.dl-go');

  card.dataset.code = item.code;
  img.src = `/api/qrcodes/${item.code}/image`;
  idEl.textContent = `ID ${item.numericId || '—'}`;
  codeEl.textContent = `/r/${item.code}`;
  targetInput.value = item.target;
  labelInput.value = item.label || '';

  node.querySelector('.save').addEventListener('click', async () => {
    msg.textContent = '';
    msg.classList.remove('error');
    try {
      await api(`/api/qrcodes/${item.code}`, {
        method: 'PUT',
        body: JSON.stringify({ target: targetInput.value.trim(), label: labelInput.value.trim() }),
      });
      msg.textContent = 'Сохранено — QR-картинка не изменилась, ссылка внутри обновлена.';
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('error');
    }
  });

  node.querySelector('.copy').addEventListener('click', async () => {
    const url = `${window.location.origin}/r/${item.code}`;
    await navigator.clipboard.writeText(url);
    msg.textContent = 'Ссылка скопирована: ' + url;
    msg.classList.remove('error');
  });

  node.querySelector('.delete').addEventListener('click', async () => {
    if (!confirm('Удалить этот QR-код? Напечатанная картинка перестанет работать.')) return;
    try {
      await api(`/api/qrcodes/${item.code}`, { method: 'DELETE' });
      await loadCodes({ reset: true });
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('error');
    }
  });

  toggleDownloadBtn.addEventListener('click', () => {
    downloadPanel.hidden = !downloadPanel.hidden;
  });

  dlSize.addEventListener('change', () => {
    dlCustomSize.hidden = dlSize.value !== 'custom';
  });

  dlGoBtn.addEventListener('click', () => {
    const format = dlFormat.value;
    let size = dlSize.value;
    if (size === 'custom') {
      size = dlCustomSize.value || '500';
    }
    const url = `/api/qrcodes/${item.code}/download?format=${format}&size=${encodeURIComponent(size)}`;
    const a = document.createElement('a');
    a.href = url;
    a.click();
  });

  return node;
}

async function loadHistory({ reset = true } = {}) {
  if (reset) {
    historyOffset = 0;
    historyList.innerHTML = '';
  }

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(historyOffset),
  });
  if (historySearch) params.set('search', historySearch);

  const { items, total } = await api(`/api/history?${params.toString()}`);

  for (const item of items) {
    historyList.appendChild(renderHistoryItem(item));
  }
  historyOffset += items.length;

  historyEmpty.hidden = total > 0;
  historyLoadMoreBtn.hidden = historyOffset >= total;
  historyResultsCount.textContent = total > 0 ? `Показано ${historyOffset} из ${total}` : '';
}

let historySearchDebounce;
historySearchInput.addEventListener('input', () => {
  clearTimeout(historySearchDebounce);
  historySearchDebounce = setTimeout(() => {
    historySearch = historySearchInput.value.trim();
    loadHistory({ reset: true });
  }, 300);
});

historyLoadMoreBtn.addEventListener('click', () => loadHistory({ reset: false }));

function renderHistoryItem(item) {
  const node = historyTemplate.content.cloneNode(true);
  node.querySelector('.history-id').textContent = `ID ${item.numericId || '—'} · ${item.label || 'без названия'}`;
  node.querySelector('.history-time').textContent = formatDate(item.changedAt);
  node.querySelector('.history-old').textContent = item.oldTarget;
  node.querySelector('.history-new').textContent = item.newTarget;
  return node;
}

init();
