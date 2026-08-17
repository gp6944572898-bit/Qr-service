// Скрипт для создания администратора — заглушка
// Здесь реализуйте логику создания admin пользователя (прим. API-запрос и т.д.)

function createAdmin(username, password) {
  if (!username || !password) {
    console.error('username and password required');
    return;
  }
  // Пример: отправка запроса на API (заглушка)
  console.log(`Создаём администратора: ${username}`);
  // TODO: заменить на реальную реализацию
}

// Экспорт для использования в Node/модульной среде
if (typeof module !== 'undefined') module.exports = { createAdmin };
