require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { nanoid } = require('nanoid');
const db = require('./db');

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-.env';
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const CODE_LENGTH = 7;

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

function signToken(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Сессия истекла, войдите заново' });
  }
}

function isValidUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

app.get('/api/setup/status', async (req, res) => {
  try {
    const admin = await db.getAdmin();
    res.json({ needsSetup: !admin });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/setup', async (req, res) => {
  try {
    const admin = await db.getAdmin();
    if (admin) {
      return res.status(403).json({ error: 'Администратор уже создан, настройка недоступна' });
    }

    const { username, password } = req.body || {};
    if (!username || username.trim().length < 2) {
      return res.status(400).json({ error: 'Логин должен быть не короче 2 символов' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    await db.setAdmin(username.trim(), passwordHash);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const admin = await db.getAdmin();

    if (!admin) {
      return res.status(400).json({
        error: 'Администратор ещё не создан. Откройте главную страницу сервиса.',
      });
    }

    if (username !== admin.username || !bcrypt.compareSync(password || '', admin.passwordHash)) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const token = signToken(username);
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true, username });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

app.get('/api/qrcodes', requireAuth, async (req, res) => {
  try {
    const list = await db.listCodes();
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/qrcodes', requireAuth, async (req, res) => {
  try {
    const { target, label } = req.body || {};
    if (!isValidUrl(target)) {
      return res.status(400).json({ error: 'Укажите корректную ссылку, начинающуюся с http:// или https://' });
    }

    let code;
    let attempts = 0;
    do {
      code = nanoid(CODE_LENGTH);
      attempts++;
    } while ((await db.getCode(code)) && attempts < 5);

    const created = await db.createCode(code, target, label);
    res.status(201).json({ redirectUrl: `${BASE_URL}/r/${code}`, ...created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.put('/api/qrcodes/:code', requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const { target, label } = req.body || {};
    if (!isValidUrl(target)) {
      return res.status(400).json({ error: 'Укажите корректную ссылку, начинающуюся с http:// или https://' });
    }

    const updated = await db.updateCode(code, target, label);
    if (!updated) return res.status(404).json({ error: 'QR-код не найден' });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/api/qrcodes/:code', requireAuth, async (req, res) => {
  try {
    const ok = await db.deleteCode(req.params.code);
    if (!ok) return res.status(404).json({ error: 'QR-код не найден' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/qrcodes/:code/image', requireAuth, async (req, res) => {
  try {
    const entry = await db.getCode(req.params.code);
    if (!entry) return res.status(404).send('Not found');

    const redirectUrl = `${BASE_URL}/r/${entry.code}`;
    res.type('png');
    QRCode.toFileStream(res, redirectUrl, { width: 320, margin: 2 });
  } catch (e) {
    console.error(e);
    res.status(500).send('Не удалось сгенерировать QR-код');
  }
});

app.get('/r/:code', async (req, res) => {
  try {
    const entry = await db.getCode(req.params.code);
    if (!entry) return res.status(404).send('QR-код не найден или был удалён');
    res.redirect(302, entry.target);
  } catch (e) {
    console.error(e);
    res.status(500).send('Ошибка сервера');
  }
});

db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`QR-сервис запущен: http://localhost:${PORT}`);
      console.log(`Публичный BASE_URL для QR-кодов: ${BASE_URL}`);
    });
  })
  .catch((err) => {
    console.error('Не удалось подключиться к базе данных:', err.message);
    process.exit(1);
  });
