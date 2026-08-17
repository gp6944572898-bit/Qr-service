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
const cardTemplate = document.getElementById('cardTemplate');

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

// ---------- Инициализация ----------

async function init() {
  try {
    const me = await api('/api/me');
    whoami.textContent = me.username;
    showDash();
    await loadCodes();
  } catch {
    showLogin();
  }
}

function showLogin() {
  loginScreen.hidden = false;
  dashScreen.hidden = true;
}
function showDash() {
  loginScreen.hidden = true;
  dashScreen.hidden = false;
}

// ---------- Вход / выход ----------

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

// ---------- Создание QR-кода ----------

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createError.textContent = '';
  const target = document.getElementById('newTarget').value.trim();
  const label = document.getElementById('newLabel').value.trim();
  try {
    await api('/api/qrcodes', { method: 'POST', body: JSON.stringify({ target, label }) });
    createForm.reset();
    await loadCodes();
  } catch (err) {
    createError.textContent = err.message;
  }
});

// ---------- Список QR-кодов ----------

async function loadCodes() {
  const list = await api('/api/qrcodes');
  cardsEl.innerHTML = '';
  emptyState.hidden = list.length > 0;

  for (const item of list) {
    cardsEl.appendChild(renderCard(item));
  }
}

function renderCard(item) {
  const node = cardTemplate.content.cloneNode(true);
  const card = node.querySelector('.card');
  const img = node.querySelector('.card-qr');
  const codeEl = node.querySelector('.card-code');
  const targetInput = node.querySelector('.card-target');
  const labelInput = node.querySelector('.card-label');
  const msg = node.querySelector('.card-msg');

  card.dataset.code = item.code;
  img.src = `/api/qrcodes/${item.code}/image`;
  codeEl.textContent = `/r/${item.code}`;
  targetInput.value = item.target;
  labelInput.value = item.label || '';
  labelInput.placeholder = 'Название (необязательно)';

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
      await loadCodes();
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('error');
    }
  });

  return node;
}

init();
