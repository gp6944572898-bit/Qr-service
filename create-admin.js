// Создаёт (или перезаписывает) единственного администратора сервиса.
// Запуск: npm run create-admin
// Использует DATABASE_URL из .env — можно запускать локально,
// подключаясь к удалённой (Neon) базе.

require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.openStdin();
    process.stdout.write(question);
    process.stdin.setRawMode?.(true);

    let password = '';
    const onData = (char) => {
      char = char + '';
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdin.setRawMode?.(false);
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          process.exit(1);
          break;
        case '\u007f':
          password = password.slice(0, -1);
          break;
        default:
          password += char;
          break;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  console.log('=== Создание администратора сервиса QR-кодов ===\n');

  if (!process.env.DATABASE_URL) {
    console.log('В .env не задан DATABASE_URL — сначала укажите строку подключения к Neon.');
    process.exit(1);
  }

  await db.init();

  const username = (await ask('Логин: ')).trim();
  if (!username) {
    console.log('Логин не может быть пустым.');
    process.exit(1);
  }

  const password = await askHidden('Пароль: ');
  if (!password || password.length < 6) {
    console.log('Пароль должен быть не короче 6 символов.');
    process.exit(1);
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  await db.setAdmin(username, passwordHash);

  console.log(`\nГотово! Пользователь "${username}" сохранён в базе.`);
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
