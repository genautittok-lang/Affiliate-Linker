import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { db } from "../../db";
import { users, searchHistory, favorites, referrals, coupons, broadcasts, clickAnalytics, achievements, hotDeals, productCache as productCacheTable } from "../../db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { searchProductsTool, getTopProductsTool } from "../tools/aliexpressSearchTool";

const ADMIN_IDS = ["7820995179"];

// Product cache for favorites - stores product data in DB for persistence across restarts
interface CachedProduct {
  title: string;
  url: string;
  image: string;
  price: number;
  currency: string;
}

// In-memory cache for faster reads (backed by DB)
const memoryCache = new Map<string, CachedProduct>();

async function cacheProduct(id: string, title: string, url: string, image: string, price: number, currency: string) {
  try {
    // Store in memory for quick access
    memoryCache.set(id, { title, url, image, price, currency });
    
    // Persist to DB (upsert)
    await db.insert(productCacheTable).values({
      productId: id,
      title,
      url,
      image: image || "",
      price,
      currency,
    }).onConflictDoUpdate({
      target: productCacheTable.productId,
      set: { title, url, image: image || "", price, currency }
    });
  } catch (e) {
    console.log("⚠️ [ProductCache] Error caching product:", e);
  }
}

async function getCachedProduct(id: string): Promise<CachedProduct | undefined> {
  // Check memory cache first
  if (memoryCache.has(id)) {
    return memoryCache.get(id);
  }
  
  // Fallback to DB
  try {
    const [cached] = await db.select().from(productCacheTable).where(eq(productCacheTable.productId, id)).limit(1);
    if (cached) {
      const product = { title: cached.title, url: cached.url, image: cached.image || "", price: cached.price, currency: cached.currency };
      memoryCache.set(id, product);
      return product;
    }
  } catch (e) {
    console.log("⚠️ [ProductCache] Error fetching cached product:", e);
  }
  return undefined;
}

// Generate unique referral code with retry on collision
async function generateUniqueReferralCode(telegramId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    const idPart = telegramId.slice(-4);
    const code = `BW${idPart}${timestamp.slice(-4)}${random}`.toUpperCase();
    
    // Check if code exists
    const [existing] = await db.select().from(users).where(eq(users.referralCode, code)).limit(1);
    if (!existing) {
      return code;
    }
  }
  // Fallback with more randomness
  return `BW${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`.toUpperCase();
}

function isAdmin(telegramId: string): boolean {
  return ADMIN_IDS.includes(telegramId);
}

const LANG_TEXTS: Record<string, any> = {
  uk: {
    welcome: `🎯 <b>Вітаю, {name}!</b> 🎯

━━━━━━━━━━━━━━━━━
🛍️ <b>BuyWise</b> — твій розумний шопінг-асистент!
━━━━━━━━━━━━━━━━━

🔥 <b>Знаходжу найкращі товари з AliExpress</b>
💰 <b>Реальні ціни • Швидка доставка • Знижки</b>

✨ <b>Мої суперсили:</b>
┣ 🔍 Швидкий пошук товарів
┣ 🏆 ТОП-10 хітів продажів
┣ 📦 7 категорій товарів
┣ ❤️ Збереження в обране
┣ 🎁 <b>Запроси 5 друзів = КУПОН!</b>
┗ 📸 Фото кожного товару

🌍 <b>Обери свою країну:</b>`,
    welcomeBack: `🎉 <b>Привіт, {name}!</b> 🎉

━━━━━━━━━━━━━━━━━
Радий бачити тебе знову! 
━━━━━━━━━━━━━━━━━

💡 Напиши назву товару або обери з меню:
🔥 ТОП-10 • 📦 Категорії • ❤️ Обране`,
    mainMenu: `🏠 <b>Головне меню</b>

━━━━━━━━━━━━━━
Обери що цікавить:
━━━━━━━━━━━━━━`,
    search: "🔍 Пошук", top10: "🔥 ТОП-10", categories: "📂 Категорії", favorites: "❤️ Обране",
    profile: "👤 Профіль", support: "💬 Підтримка", back: "🔙 Меню",
    searchPrompt: "Що шукаємо? Напиши назву товару:",
    resultsFor: "🔍 Результати для",
    noResults: "😔 Нічого не знайдено. Спробуй інший запит.",
    buy: "🛒 Купити",
    catElectronics: "📱 Електроніка", catClothing: "👗 Одяг", catHome: "🏠 Дім",
    catBeauty: "💄 Краса", catGadgets: "🔌 Гаджети", catGifts: "🎁 Подарунки", catUnder10: "💰 До $10",
    favEmpty: "❤️ У тебе поки немає обраних товарів",
    favAdded: "✅ Додано в обране!",
    favRemoved: "❌ Видалено з обраного",
    profileTitle: "👤 Твій профіль",
    country: "🌍 Країна", language: "🌐 Мова", notifications: "🔔 Сповіщення",
    changeCountry: "🌍 Змінити країну", changeLang: "🌐 Змінити мову",
    notifOn: "🔔 Увімкнено", notifOff: "🔕 Вимкнено",
    enableNotif: "🔔 Увімкнути", disableNotif: "🔕 Вимкнути",
    referral: "🎁 Запросити друзів",
    referralTitle: `🎁 <b>РЕФЕРАЛЬНА ПРОГРАМА</b> 🎁

━━━━━━━━━━━━━━━━━
💰 <b>Запрошуй друзів — отримуй КУПОНИ!</b>
━━━━━━━━━━━━━━━━━

📊 <b>Нагороди:</b>
┣ 1 друг = 🎟️ <b>3%</b>
┣ 3 друзі = 🎟️ <b>5%</b>
┣ 5 друзів = 🎟️ <b>10%</b>
┗ 10 друзів = 🎟️ <b>15%</b> VIP

📲 <b>Твоє посилання:</b>`,
    referralStats: `
━━━━━━━━━━━━━━━━━
👥 <b>Запрошено:</b> {count} друзів`,
    couponEarned: `🎊 <b>ВІТАЄМО!</b> 🎊

Ти запросив 5 друзів і отримав купон!`,
    couponProgress: `
📊 <b>Прогрес:</b> {left} друзів до купона`,
    yourCoupon: `
🏷️ <b>ТВІЙ КУПОН:</b>
<code>{code}</code>`,
    supportMsg: "💬 Зв'яжись з підтримкою:",
    recentSearches: "🕐 Нещодавні пошуки:",
    noSearchHistory: "Історія пошуку порожня",
    topTitle: "🔥 ТОП-10 товарів сьогодні:",
    countrySelected: "✅ Країну обрано! Тепер можна шукати.",
    langSelected: "✅ Мову змінено!",
    error: "❌ Помилка. Спробуй ще раз.",
    adminPanel: "🔐 Адмін-панель",
    adminStats: "📊 Статистика",
    adminBroadcast: "📢 Розсилка",
    adminUsers: "👥 Користувачі",
    totalUsers: "👥 Всього: {count}",
    activeToday: "📅 Сьогодні: {count}",
    withNotif: "🔔 З сповіщеннями: {count}",
    broadcastSent: "✅ Розсилку надіслано {count} користувачам",
    broadcastPrompt: "Напиши текст для розсилки:",
    history: "🕐 Історія",
    addFav: "❤️ В обране",
    favAddedShort: "❤️",
    discount: "ЗНИЖКА",
    sold: "продано",
    freeShip: "Безкоштовна доставка",
    priceDrop: "Ціна впала!",
    was: "Було",
    myCoupons: "🎟️ Купони",
    hotDeals: "🔥 Знижки",
    leaderboard: "🏆 Топ",
    achievements: "🏅 Досягнення",
    myStats: "📊 Статистика",
    leaderboardTitle: `🏆 <b>ТОП КОРИСТУВАЧІВ</b> 🏆

━━━━━━━━━━━━━━━━━`,
    achievementsTitle: `🏅 <b>ТВОЇ ДОСЯГНЕННЯ</b> 🏅

━━━━━━━━━━━━━━━━━`,
    noAchievements: `😔 У тебе поки немає досягнень

📊 <b>Як отримати:</b>
┣ 🔍 Перший пошук (+10 pts)
┣ ❤️ Перше обране (+15 pts)
┣ 👥 Перший реферал (+25 pts)
┣ 🔥 10 пошуків (+50 pts)
┗ 🌟 5 рефералів (+100 pts)`,
    statsTitle: `📊 <b>ТВОЯ СТАТИСТИКА</b> 📊

━━━━━━━━━━━━━━━━━`,
    statsSearches: "🔍 <b>Пошуків:</b>",
    statsFavorites: "❤️ <b>В обраному:</b>",
    statsReferrals: "👥 <b>Рефералів:</b>",
    statsClicks: "👆 <b>Кліків:</b>",
    statsPoints: "🏆 <b>Очки:</b>",
    statsStreak: "🔥 <b>Streak:</b>",
    statsDays: "днів",
    leaderboardYourRank: "👤 Твоє місце:",
    hotDealsTitle: `🔥 <b>ГАРЯЧІ ЗНИЖКИ</b> 🔥

━━━━━━━━━━━━━━━━━
Товари зі знижкою від 30%!`,
    more: "➕ Ще",
    couponsTitle: `🎟️ <b>ТВОЇ КУПОНИ</b> 🎟️

━━━━━━━━━━━━━━━━━`,
    noCoupons: `😔 У тебе ще немає купонів

📊 <b>Як отримати:</b>
┣ 1 друг = 🎟️ <b>3%</b> купон
┣ 3 друзі = 🎟️ <b>5%</b> купон
┣ 5 друзів = 🎟️ <b>10%</b> купон
┗ 10 друзів = 🎟️ <b>15%</b> VIP купон`,
    couponItem: "🎟️ <b>{name}</b> — {percent}% знижка\n<code>{code}</code>",
    nextMilestone: "\n\n📊 <b>До наступного купона:</b> {left} друзів",
    allMilestonesReached: "\n\n🏆 <b>Вітаємо!</b> Ти отримав усі купони!",
    newCouponEarned: "🎉 <b>НОВИЙ КУПОН!</b> 🎉\n\nТи запросив {refs} друзів і отримав купон на <b>{percent}%</b>!\n\n🎟️ <code>{code}</code>",
  },
  ru: {
    welcome: `🎯 <b>Привет, {name}!</b> 🎯

━━━━━━━━━━━━━━━━━
🛍️ <b>BuyWise</b> — твой умный шопинг-ассистент!
━━━━━━━━━━━━━━━━━

🔥 <b>Нахожу лучшие товары с AliExpress</b>
💰 <b>Реальные цены • Быстрая доставка • Скидки</b>

✨ <b>Мои суперспособности:</b>
┣ 🔍 Быстрый поиск товаров
┣ 🏆 ТОП-10 хитов продаж
┣ 📦 7 категорий товаров
┣ ❤️ Сохранение в избранное
┣ 🎁 <b>Пригласи 5 друзей = КУПОН!</b>
┗ 📸 Фото каждого товара

🌍 <b>Выбери свою страну:</b>`,
    welcomeBack: `🎉 <b>Привет, {name}!</b> 🎉

━━━━━━━━━━━━━━━━━
Рад видеть тебя снова!
━━━━━━━━━━━━━━━━━

💡 Напиши название товара или выбери из меню:
🔥 ТОП-10 • 📦 Категории • ❤️ Избранное`,
    mainMenu: `🏠 <b>Главное меню</b>

━━━━━━━━━━━━━━
Выбери что интересует:
━━━━━━━━━━━━━━`,
    search: "🔍 Поиск", top10: "🔥 ТОП-10", categories: "📂 Категории", favorites: "❤️ Избранное",
    profile: "👤 Профиль", support: "💬 Поддержка", back: "🔙 Меню",
    searchPrompt: "Что ищем? Напиши название товара:",
    resultsFor: "🔍 Результаты для",
    noResults: "😔 Ничего не найдено. Попробуй другой запрос.",
    buy: "🛒 Купить",
    catElectronics: "📱 Электроника", catClothing: "👗 Одежда", catHome: "🏠 Дом",
    catBeauty: "💄 Красота", catGadgets: "🔌 Гаджеты", catGifts: "🎁 Подарки", catUnder10: "💰 До $10",
    favEmpty: "❤️ У тебя пока нет избранных товаров",
    favAdded: "✅ Добавлено в избранное!",
    favRemoved: "❌ Удалено из избранного",
    profileTitle: "👤 Твой профиль",
    country: "🌍 Страна", language: "🌐 Язык", notifications: "🔔 Уведомления",
    changeCountry: "🌍 Изменить страну", changeLang: "🌐 Изменить язык",
    notifOn: "🔔 Включено", notifOff: "🔕 Выключено",
    enableNotif: "🔔 Включить", disableNotif: "🔕 Выключить",
    referral: "🎁 Пригласить друзей",
    referralTitle: `🎁 <b>РЕФЕРАЛЬНАЯ ПРОГРАММА</b> 🎁

━━━━━━━━━━━━━━━━━
💰 <b>Приглашай друзей — получай КУПОНЫ!</b>
━━━━━━━━━━━━━━━━━

📊 <b>Награды:</b>
┣ 1 друг = 🎟️ <b>3%</b>
┣ 3 друга = 🎟️ <b>5%</b>
┣ 5 друзей = 🎟️ <b>10%</b>
┗ 10 друзей = 🎟️ <b>15%</b> VIP

📲 <b>Твоя ссылка:</b>`,
    referralStats: `
━━━━━━━━━━━━━━━━━
👥 <b>Приглашено:</b> {count} друзей`,
    couponEarned: `🎊 <b>ПОЗДРАВЛЯЕМ!</b> 🎊

Ты пригласил 5 друзей и получил купон!`,
    couponProgress: `
📊 <b>Прогресс:</b> {left} друзей до купона`,
    yourCoupon: `
🏷️ <b>ТВОЙ КУПОН:</b>
<code>{code}</code>`,
    supportMsg: "💬 Свяжись с поддержкой:",
    recentSearches: "🕐 Недавние поиски:",
    noSearchHistory: "История поиска пуста",
    topTitle: "🔥 ТОП-10 товаров сегодня:",
    countrySelected: "✅ Страна выбрана! Теперь можно искать.",
    langSelected: "✅ Язык изменён!",
    error: "❌ Ошибка. Попробуй ещё раз.",
    discount: "СКИДКА",
    sold: "продано",
    freeShip: "Бесплатная доставка",
    priceDrop: "Цена упала!",
    was: "Было",
    myCoupons: "🎟️ Купоны",
    hotDeals: "🔥 Скидки",
    leaderboard: "🏆 Топ",
    achievements: "🏅 Достижения",
    myStats: "📊 Статистика",
    leaderboardTitle: `🏆 <b>ТОП ПОЛЬЗОВАТЕЛЕЙ</b> 🏆

━━━━━━━━━━━━━━━━━`,
    achievementsTitle: `🏅 <b>ТВОИ ДОСТИЖЕНИЯ</b> 🏅

━━━━━━━━━━━━━━━━━`,
    noAchievements: `😔 У тебя пока нет достижений

📊 <b>Как получить:</b>
┣ 🔍 Первый поиск (+10 pts)
┣ ❤️ Первое избранное (+15 pts)
┣ 👥 Первый реферал (+25 pts)
┣ 🔥 10 поисков (+50 pts)
┗ 🌟 5 рефералов (+100 pts)`,
    statsTitle: `📊 <b>ТВОЯ СТАТИСТИКА</b> 📊

━━━━━━━━━━━━━━━━━`,
    statsSearches: "🔍 <b>Поисков:</b>",
    statsFavorites: "❤️ <b>В избранном:</b>",
    statsReferrals: "👥 <b>Рефералов:</b>",
    statsClicks: "👆 <b>Кликов:</b>",
    statsPoints: "🏆 <b>Очки:</b>",
    statsStreak: "🔥 <b>Streak:</b>",
    statsDays: "дней",
    leaderboardYourRank: "👤 Твоё место:",
    hotDealsTitle: `🔥 <b>ГОРЯЧИЕ СКИДКИ</b> 🔥

━━━━━━━━━━━━━━━━━
Товары со скидкой от 30%!`,
    more: "➕ Ещё",
    couponsTitle: `🎟️ <b>ТВОИ КУПОНЫ</b> 🎟️

━━━━━━━━━━━━━━━━━`,
    noCoupons: `😔 У тебя ещё нет купонов

📊 <b>Как получить:</b>
┣ 1 друг = 🎟️ <b>3%</b> купон
┣ 3 друга = 🎟️ <b>5%</b> купон
┣ 5 друзей = 🎟️ <b>10%</b> купон
┗ 10 друзей = 🎟️ <b>15%</b> VIP купон`,
    couponItem: "🎟️ <b>{name}</b> — {percent}% скидка\n<code>{code}</code>",
    nextMilestone: "\n\n📊 <b>До следующего купона:</b> {left} друзей",
    allMilestonesReached: "\n\n🏆 <b>Поздравляем!</b> Ты получил все купоны!",
    newCouponEarned: "🎉 <b>НОВЫЙ КУПОН!</b> 🎉\n\nТы пригласил {refs} друзей и получил купон на <b>{percent}%</b>!\n\n🎟️ <code>{code}</code>",
  },
  en: {
    welcome: `🎯 <b>Hey {name}!</b> 🎯

━━━━━━━━━━━━━━━━━
🛍️ <b>BuyWise</b> — your smart shopping assistant!
━━━━━━━━━━━━━━━━━

🔥 <b>Finding the best AliExpress deals</b>
💰 <b>Real prices • Fast shipping • Discounts</b>

✨ <b>My superpowers:</b>
┣ 🔍 Fast product search
┣ 🏆 TOP-10 bestsellers
┣ 📦 7 product categories
┣ ❤️ Save to favorites
┣ 🎁 <b>Invite 5 friends = COUPON!</b>
┗ 📸 Photos of every product

🌍 <b>Choose your country:</b>`,
    welcomeBack: `🎉 <b>Hey {name}!</b> 🎉

━━━━━━━━━━━━━━━━━
Great to see you again!
━━━━━━━━━━━━━━━━━

💡 Type what you're looking for or choose from menu:
🔥 TOP-10 • 📦 Categories • ❤️ Favorites`,
    mainMenu: `🏠 <b>Main Menu</b>

━━━━━━━━━━━━━━
Choose what interests you:
━━━━━━━━━━━━━━`,
    search: "🔍 Search", top10: "🔥 TOP-10", categories: "📂 Categories", favorites: "❤️ Favorites",
    profile: "👤 Profile", support: "💬 Support", back: "🔙 Menu",
    searchPrompt: "What are you looking for?",
    resultsFor: "🔍 Results for",
    noResults: "😔 Nothing found. Try another query.",
    buy: "🛒 Buy",
    catElectronics: "📱 Electronics", catClothing: "👗 Clothing", catHome: "🏠 Home",
    catBeauty: "💄 Beauty", catGadgets: "🔌 Gadgets", catGifts: "🎁 Gifts", catUnder10: "💰 Under $10",
    favEmpty: "❤️ No favorites yet",
    favAdded: "✅ Added to favorites!",
    favRemoved: "❌ Removed from favorites",
    profileTitle: "👤 Your Profile",
    country: "🌍 Country", language: "🌐 Language", notifications: "🔔 Notifications",
    changeCountry: "🌍 Change Country", changeLang: "🌐 Change Language",
    notifOn: "🔔 On", notifOff: "🔕 Off",
    enableNotif: "🔔 Enable", disableNotif: "🔕 Disable",
    referral: "🎁 Invite Friends",
    referralTitle: `🎁 <b>REFERRAL PROGRAM</b> 🎁

━━━━━━━━━━━━━━━━━
💰 <b>Invite friends — earn COUPONS!</b>
━━━━━━━━━━━━━━━━━

📊 <b>Rewards:</b>
┣ 1 friend = 🎟️ <b>3%</b>
┣ 3 friends = 🎟️ <b>5%</b>
┣ 5 friends = 🎟️ <b>10%</b>
┗ 10 friends = 🎟️ <b>15%</b> VIP

📲 <b>Your link:</b>`,
    referralStats: `
━━━━━━━━━━━━━━━━━
👥 <b>Invited:</b> {count} friends`,
    couponEarned: `🎊 <b>CONGRATULATIONS!</b> 🎊

You invited 5 friends and earned a coupon!`,
    couponProgress: `
📊 <b>Progress:</b> {left} more friends for coupon`,
    yourCoupon: `
🏷️ <b>YOUR COUPON:</b>
<code>{code}</code>`,
    supportMsg: "💬 Contact support:",
    recentSearches: "🕐 Recent searches:",
    noSearchHistory: "No search history",
    topTitle: "🔥 TOP-10 deals today:",
    countrySelected: "✅ Country selected! Ready to search.",
    langSelected: "✅ Language changed!",
    error: "❌ Error. Please try again.",
    adminPanel: "🔐 Admin Panel",
    adminStats: "📊 Statistics",
    adminBroadcast: "📢 Broadcast",
    adminUsers: "👥 Users",
    totalUsers: "👥 Total: {count}",
    activeToday: "📅 Today: {count}",
    withNotif: "🔔 With notifications: {count}",
    broadcastSent: "✅ Broadcast sent to {count} users",
    broadcastPrompt: "Write broadcast message:",
    history: "🕐 History",
    addFav: "❤️ Add to favorites",
    favAddedShort: "❤️",
    discount: "OFF",
    sold: "sold",
    freeShip: "Free shipping",
    priceDrop: "Price dropped!",
    was: "Was",
    myCoupons: "🎟️ Coupons",
    hotDeals: "🔥 Hot Deals",
    leaderboard: "🏆 Top",
    achievements: "🏅 Achievements",
    myStats: "📊 Stats",
    leaderboardTitle: `🏆 <b>TOP USERS</b> 🏆

━━━━━━━━━━━━━━━━━`,
    achievementsTitle: `🏅 <b>YOUR ACHIEVEMENTS</b> 🏅

━━━━━━━━━━━━━━━━━`,
    noAchievements: `😔 No achievements yet

📊 <b>How to earn:</b>
┣ 🔍 First search (+10 pts)
┣ ❤️ First favorite (+15 pts)
┣ 👥 First referral (+25 pts)
┣ 🔥 10 searches (+50 pts)
┗ 🌟 5 referrals (+100 pts)`,
    statsTitle: `📊 <b>YOUR STATISTICS</b> 📊

━━━━━━━━━━━━━━━━━`,
    statsSearches: "🔍 <b>Searches:</b>",
    statsFavorites: "❤️ <b>Favorites:</b>",
    statsReferrals: "👥 <b>Referrals:</b>",
    statsClicks: "👆 <b>Clicks:</b>",
    statsPoints: "🏆 <b>Points:</b>",
    statsStreak: "🔥 <b>Streak:</b>",
    statsDays: "days",
    leaderboardYourRank: "👤 Your rank:",
    hotDealsTitle: `🔥 <b>HOT DEALS</b> 🔥

━━━━━━━━━━━━━━━━━
Products with 30%+ discount!`,
    more: "➕ More",
    couponsTitle: `🎟️ <b>YOUR COUPONS</b> 🎟️

━━━━━━━━━━━━━━━━━`,
    noCoupons: `😔 You don't have any coupons yet

📊 <b>How to earn:</b>
┣ 1 friend = 🎟️ <b>3%</b> coupon
┣ 3 friends = 🎟️ <b>5%</b> coupon
┣ 5 friends = 🎟️ <b>10%</b> coupon
┗ 10 friends = 🎟️ <b>15%</b> VIP coupon`,
    couponItem: "🎟️ <b>{name}</b> — {percent}% discount\n<code>{code}</code>",
    nextMilestone: "\n\n📊 <b>To next coupon:</b> {left} more friends",
    allMilestonesReached: "\n\n🏆 <b>Congrats!</b> You've earned all coupons!",
    newCouponEarned: "🎉 <b>NEW COUPON!</b> 🎉\n\nYou invited {refs} friends and earned a <b>{percent}%</b> coupon!\n\n🎟️ <code>{code}</code>",
  },
  de: {
    welcome: "Hallo {name}! 🛍️ Ich helfe dir, die besten AliExpress-Angebote zu finden. Wähle dein Land:",
    welcomeBack: "Willkommen zurück, {name}! 🎉",
    mainMenu: "📱 Hauptmenü",
    search: "🔍 Suche", top10: "🔥 TOP-10", categories: "📂 Kategorien", favorites: "❤️ Favoriten",
    profile: "👤 Profil", support: "💬 Support", back: "🔙 Menü",
    searchPrompt: "Was suchst du?",
    resultsFor: "🔍 Ergebnisse für",
    noResults: "😔 Nichts gefunden.",
    buy: "🛒 Kaufen",
    catElectronics: "📱 Elektronik", catClothing: "👗 Kleidung", catHome: "🏠 Zuhause",
    catBeauty: "💄 Schönheit", catGadgets: "🔌 Gadgets", catGifts: "🎁 Geschenke", catUnder10: "💰 Unter $10",
    favEmpty: "❤️ Noch keine Favoriten",
    favAdded: "✅ Zu Favoriten hinzugefügt!",
    favRemoved: "❌ Aus Favoriten entfernt",
    profileTitle: "👤 Dein Profil",
    country: "🌍 Land", language: "🌐 Sprache", notifications: "🔔 Benachrichtigungen",
    changeCountry: "🌍 Land ändern", changeLang: "🌐 Sprache ändern",
    notifOn: "🔔 An", notifOff: "🔕 Aus",
    enableNotif: "🔔 Aktivieren", disableNotif: "🔕 Deaktivieren",
    referral: "👥 Freunde einladen",
    referralTitle: "🎁 Dein Empfehlungslink:",
    referralStats: "👥 Eingeladen: {count} Freunde",
    couponEarned: "🎉 Du hast einen Rabattcoupon erhalten!",
    couponProgress: "Noch {left} Freunde bis zum Coupon",
    yourCoupon: "🏷️ Dein Coupon: {code}",
    supportMsg: "💬 Kontaktiere Support:",
    recentSearches: "🕐 Letzte Suchen:",
    noSearchHistory: "Kein Suchverlauf",
    topTitle: "🔥 TOP-10 Angebote heute:",
    countrySelected: "✅ Land ausgewählt!",
    langSelected: "✅ Sprache geändert!",
    error: "❌ Fehler. Bitte erneut versuchen.",
    discount: "RABATT",
    sold: "verkauft",
    freeShip: "Kostenloser Versand",
    priceDrop: "Preis gefallen!",
    was: "War",
    hotDeals: "🔥 Angebote",
    leaderboard: "🏆 Top",
    achievements: "🏅 Erfolge",
    myStats: "📊 Statistik",
    leaderboardTitle: "🏆 <b>TOP BENUTZER</b> 🏆\n\n━━━━━━━━━━━━━━━━━",
    achievementsTitle: "🏅 <b>DEINE ERFOLGE</b> 🏅\n\n━━━━━━━━━━━━━━━━━",
    noAchievements: "😔 Noch keine Erfolge\n\n📊 <b>Wie verdienen:</b>\n┣ 🔍 Erste Suche (+10 pts)\n┣ ❤️ Erster Favorit (+15 pts)\n┣ 👥 Erster Referral (+25 pts)\n┣ 🔥 10 Suchen (+50 pts)\n┗ 🌟 5 Referrals (+100 pts)",
    statsTitle: "📊 <b>DEINE STATISTIK</b> 📊\n\n━━━━━━━━━━━━━━━━━",
    statsSearches: "🔍 <b>Suchen:</b>",
    statsFavorites: "❤️ <b>Favoriten:</b>",
    statsReferrals: "👥 <b>Referrals:</b>",
    statsClicks: "👆 <b>Klicks:</b>",
    statsPoints: "🏆 <b>Punkte:</b>",
    statsStreak: "🔥 <b>Streak:</b>",
    statsDays: "Tage",
    leaderboardYourRank: "👤 Dein Rang:",
    hotDealsTitle: "🔥 <b>HOT DEALS</b> 🔥\n\n━━━━━━━━━━━━━━━━━\nProdukte mit 30%+ Rabatt!",
    more: "➕ Mehr",
  },
  pl: {
    welcome: "Cześć {name}! 🛍️ Pomogę Ci znaleźć najlepsze oferty. Wybierz kraj:",
    welcomeBack: "Witaj ponownie, {name}! 🎉",
    mainMenu: "📱 Menu główne",
    search: "🔍 Szukaj", top10: "🔥 TOP-10", categories: "📂 Kategorie", favorites: "❤️ Ulubione",
    profile: "👤 Profil", support: "💬 Wsparcie", back: "🔙 Menu",
    searchPrompt: "Czego szukasz?",
    resultsFor: "🔍 Wyniki dla",
    noResults: "😔 Nic nie znaleziono.",
    buy: "🛒 Kup",
    catElectronics: "📱 Elektronika", catClothing: "👗 Odzież", catHome: "🏠 Dom",
    catBeauty: "💄 Uroda", catGadgets: "🔌 Gadżety", catGifts: "🎁 Prezenty", catUnder10: "💰 Do $10",
    favEmpty: "❤️ Brak ulubionych",
    favAdded: "✅ Dodano do ulubionych!",
    favRemoved: "❌ Usunięto z ulubionych",
    profileTitle: "👤 Twój profil",
    country: "🌍 Kraj", language: "🌐 Język", notifications: "🔔 Powiadomienia",
    changeCountry: "🌍 Zmień kraj", changeLang: "🌐 Zmień język",
    notifOn: "🔔 Wł.", notifOff: "🔕 Wył.",
    enableNotif: "🔔 Włącz", disableNotif: "🔕 Wyłącz",
    referral: "👥 Zaproś znajomych",
    referralTitle: "🎁 Twój link polecający:",
    referralStats: "👥 Zaproszono: {count} znajomych",
    couponEarned: "🎉 Otrzymałeś kupon rabatowy!",
    couponProgress: "Jeszcze {left} znajomych do kuponu",
    yourCoupon: "🏷️ Twój kupon: {code}",
    supportMsg: "💬 Skontaktuj się z pomocą:",
    recentSearches: "🕐 Ostatnie wyszukiwania:",
    noSearchHistory: "Brak historii wyszukiwania",
    topTitle: "🔥 TOP-10 ofert dzisiaj:",
    countrySelected: "✅ Kraj wybrany!",
    langSelected: "✅ Język zmieniony!",
    error: "❌ Błąd. Spróbuj ponownie.",
    discount: "ZNIŻKA",
    sold: "sprzedano",
    freeShip: "Darmowa dostawa",
    priceDrop: "Cena spadła!",
    was: "Było",
    hotDeals: "🔥 Promocje",
    leaderboard: "🏆 Top",
    achievements: "🏅 Osiągnięcia",
    myStats: "📊 Statystyki",
    leaderboardTitle: "🏆 <b>TOP UŻYTKOWNICY</b> 🏆\n\n━━━━━━━━━━━━━━━━━",
    achievementsTitle: "🏅 <b>TWOJE OSIĄGNIĘCIA</b> 🏅\n\n━━━━━━━━━━━━━━━━━",
    noAchievements: "😔 Brak osiągnięć\n\n📊 <b>Jak zdobyć:</b>\n┣ 🔍 Pierwsze wyszukiwanie (+10 pts)\n┣ ❤️ Pierwszy ulubiony (+15 pts)\n┣ 👥 Pierwszy polecony (+25 pts)\n┣ 🔥 10 wyszukiwań (+50 pts)\n┗ 🌟 5 poleconych (+100 pts)",
    statsTitle: "📊 <b>TWOJA STATYSTYKA</b> 📊\n\n━━━━━━━━━━━━━━━━━",
    statsSearches: "🔍 <b>Wyszukiwań:</b>",
    statsFavorites: "❤️ <b>Ulubionych:</b>",
    statsReferrals: "👥 <b>Poleconych:</b>",
    statsClicks: "👆 <b>Kliknięć:</b>",
    statsPoints: "🏆 <b>Punkty:</b>",
    statsStreak: "🔥 <b>Streak:</b>",
    statsDays: "dni",
    leaderboardYourRank: "👤 Twoja pozycja:",
    hotDealsTitle: "🔥 <b>GORĄCE OFERTY</b> 🔥\n\n━━━━━━━━━━━━━━━━━\nProdukty z 30%+ rabatem!",
    more: "➕ Więcej",
  },
  fr: {
    welcome: "Salut {name}! 🛍️ Je t'aide à trouver les meilleures offres. Choisis ton pays:",
    welcomeBack: "Content de te revoir, {name}! 🎉",
    mainMenu: "📱 Menu principal",
    search: "🔍 Rechercher", top10: "🔥 TOP-10", categories: "📂 Catégories", favorites: "❤️ Favoris",
    profile: "👤 Profil", support: "💬 Support", back: "🔙 Menu",
    searchPrompt: "Que cherches-tu?",
    resultsFor: "🔍 Résultats pour",
    noResults: "😔 Rien trouvé.",
    buy: "🛒 Acheter",
    catElectronics: "📱 Électronique", catClothing: "👗 Vêtements", catHome: "🏠 Maison",
    catBeauty: "💄 Beauté", catGadgets: "🔌 Gadgets", catGifts: "🎁 Cadeaux", catUnder10: "💰 Moins de $10",
    favEmpty: "❤️ Pas de favoris",
    favAdded: "✅ Ajouté aux favoris!",
    favRemoved: "❌ Supprimé des favoris",
    profileTitle: "👤 Ton profil",
    country: "🌍 Pays", language: "🌐 Langue", notifications: "🔔 Notifications",
    changeCountry: "🌍 Changer de pays", changeLang: "🌐 Changer de langue",
    notifOn: "🔔 Activé", notifOff: "🔕 Désactivé",
    enableNotif: "🔔 Activer", disableNotif: "🔕 Désactiver",
    referral: "👥 Inviter des amis",
    referralTitle: "🎁 Ton lien de parrainage:",
    referralStats: "👥 Invités: {count} amis",
    couponEarned: "🎉 Tu as gagné un coupon!",
    couponProgress: "Encore {left} amis pour le coupon",
    yourCoupon: "🏷️ Ton coupon: {code}",
    supportMsg: "💬 Contacte le support:",
    recentSearches: "🕐 Recherches récentes:",
    noSearchHistory: "Pas d'historique",
    topTitle: "🔥 TOP-10 offres du jour:",
    countrySelected: "✅ Pays sélectionné!",
    langSelected: "✅ Langue changée!",
    error: "❌ Erreur. Réessaie.",
    discount: "PROMO",
    sold: "vendu",
    freeShip: "Livraison gratuite",
    priceDrop: "Prix baissé!",
    was: "Était",
    hotDeals: "🔥 Promos",
    leaderboard: "🏆 Top",
    achievements: "🏅 Succès",
    myStats: "📊 Stats",
    leaderboardTitle: "🏆 <b>TOP UTILISATEURS</b> 🏆\n\n━━━━━━━━━━━━━━━━━",
    achievementsTitle: "🏅 <b>TES SUCCÈS</b> 🏅\n\n━━━━━━━━━━━━━━━━━",
    noAchievements: "😔 Pas encore de succès\n\n📊 <b>Comment gagner:</b>\n┣ 🔍 Première recherche (+10 pts)\n┣ ❤️ Premier favori (+15 pts)\n┣ 👥 Premier parrainage (+25 pts)\n┣ 🔥 10 recherches (+50 pts)\n┗ 🌟 5 parrainages (+100 pts)",
    statsTitle: "📊 <b>TES STATISTIQUES</b> 📊\n\n━━━━━━━━━━━━━━━━━",
    statsSearches: "🔍 <b>Recherches:</b>",
    statsFavorites: "❤️ <b>Favoris:</b>",
    statsReferrals: "👥 <b>Parrainages:</b>",
    statsClicks: "👆 <b>Clics:</b>",
    statsPoints: "🏆 <b>Points:</b>",
    statsStreak: "🔥 <b>Streak:</b>",
    statsDays: "jours",
    leaderboardYourRank: "👤 Ton rang:",
    hotDealsTitle: "🔥 <b>PROMOS</b> 🔥\n\n━━━━━━━━━━━━━━━━━\nProduits avec 30%+ de réduction!",
    more: "➕ Plus",
  },
  es: {
    welcome: "¡Hola {name}! 🛍️ Te ayudo a encontrar las mejores ofertas. Elige tu país:",
    welcomeBack: "¡Bienvenido de nuevo, {name}! 🎉",
    mainMenu: "📱 Menú principal",
    search: "🔍 Buscar", top10: "🔥 TOP-10", categories: "📂 Categorías", favorites: "❤️ Favoritos",
    profile: "👤 Perfil", support: "💬 Soporte", back: "🔙 Menú",
    searchPrompt: "¿Qué buscas?",
    resultsFor: "🔍 Resultados para",
    noResults: "😔 Nada encontrado.",
    buy: "🛒 Comprar",
    catElectronics: "📱 Electrónica", catClothing: "👗 Ropa", catHome: "🏠 Hogar",
    catBeauty: "💄 Belleza", catGadgets: "🔌 Gadgets", catGifts: "🎁 Regalos", catUnder10: "💰 Menos de $10",
    favEmpty: "❤️ Sin favoritos",
    favAdded: "✅ ¡Añadido a favoritos!",
    favRemoved: "❌ Eliminado de favoritos",
    profileTitle: "👤 Tu perfil",
    country: "🌍 País", language: "🌐 Idioma", notifications: "🔔 Notificaciones",
    changeCountry: "🌍 Cambiar país", changeLang: "🌐 Cambiar idioma",
    notifOn: "🔔 Activado", notifOff: "🔕 Desactivado",
    enableNotif: "🔔 Activar", disableNotif: "🔕 Desactivar",
    referral: "👥 Invitar amigos",
    referralTitle: "🎁 Tu enlace de referido:",
    referralStats: "👥 Invitados: {count} amigos",
    couponEarned: "🎉 ¡Ganaste un cupón!",
    couponProgress: "Faltan {left} amigos para el cupón",
    yourCoupon: "🏷️ Tu cupón: {code}",
    supportMsg: "💬 Contacta soporte:",
    recentSearches: "🕐 Búsquedas recientes:",
    noSearchHistory: "Sin historial",
    topTitle: "🔥 TOP-10 ofertas de hoy:",
    countrySelected: "✅ ¡País seleccionado!",
    langSelected: "✅ ¡Idioma cambiado!",
    error: "❌ Error. Inténtalo de nuevo.",
    discount: "DESCUENTO",
    sold: "vendido",
    freeShip: "Envío gratis",
    priceDrop: "¡Precio bajó!",
    was: "Era",
    hotDeals: "🔥 Ofertas",
    leaderboard: "🏆 Top",
    achievements: "🏅 Logros",
    myStats: "📊 Estadísticas",
    leaderboardTitle: "🏆 <b>TOP USUARIOS</b> 🏆\n\n━━━━━━━━━━━━━━━━━",
    achievementsTitle: "🏅 <b>TUS LOGROS</b> 🏅\n\n━━━━━━━━━━━━━━━━━",
    noAchievements: "😔 Sin logros aún\n\n📊 <b>Cómo ganar:</b>\n┣ 🔍 Primera búsqueda (+10 pts)\n┣ ❤️ Primer favorito (+15 pts)\n┣ 👥 Primer referido (+25 pts)\n┣ 🔥 10 búsquedas (+50 pts)\n┗ 🌟 5 referidos (+100 pts)",
    statsTitle: "📊 <b>TUS ESTADÍSTICAS</b> 📊\n\n━━━━━━━━━━━━━━━━━",
    statsSearches: "🔍 <b>Búsquedas:</b>",
    statsFavorites: "❤️ <b>Favoritos:</b>",
    statsReferrals: "👥 <b>Referidos:</b>",
    statsClicks: "👆 <b>Clics:</b>",
    statsPoints: "🏆 <b>Puntos:</b>",
    statsStreak: "🔥 <b>Streak:</b>",
    statsDays: "días",
    leaderboardYourRank: "👤 Tu posición:",
    hotDealsTitle: "🔥 <b>OFERTAS CALIENTES</b> 🔥\n\n━━━━━━━━━━━━━━━━━\nProductos con 30%+ descuento!",
    more: "➕ Más",
  },
  it: {
    welcome: "Ciao {name}! 🛍️ Ti aiuto a trovare le migliori offerte. Scegli il tuo paese:",
    welcomeBack: "Bentornato, {name}! 🎉",
    mainMenu: "📱 Menu principale",
    search: "🔍 Cerca", top10: "🔥 TOP-10", categories: "📂 Categorie", favorites: "❤️ Preferiti",
    profile: "👤 Profilo", support: "💬 Supporto", back: "🔙 Menu",
    searchPrompt: "Cosa cerchi?",
    resultsFor: "🔍 Risultati per",
    noResults: "😔 Niente trovato.",
    buy: "🛒 Compra",
    catElectronics: "📱 Elettronica", catClothing: "👗 Abbigliamento", catHome: "🏠 Casa",
    catBeauty: "💄 Bellezza", catGadgets: "🔌 Gadget", catGifts: "🎁 Regali", catUnder10: "💰 Sotto $10",
    favEmpty: "❤️ Nessun preferito",
    favAdded: "✅ Aggiunto ai preferiti!",
    favRemoved: "❌ Rimosso dai preferiti",
    profileTitle: "👤 Il tuo profilo",
    country: "🌍 Paese", language: "🌐 Lingua", notifications: "🔔 Notifiche",
    changeCountry: "🌍 Cambia paese", changeLang: "🌐 Cambia lingua",
    notifOn: "🔔 Attivo", notifOff: "🔕 Disattivo",
    enableNotif: "🔔 Attiva", disableNotif: "🔕 Disattiva",
    referral: "👥 Invita amici",
    referralTitle: "🎁 Il tuo link referral:",
    referralStats: "👥 Invitati: {count} amici",
    couponEarned: "🎉 Hai guadagnato un coupon!",
    couponProgress: "Altri {left} amici per il coupon",
    yourCoupon: "🏷️ Il tuo coupon: {code}",
    supportMsg: "💬 Contatta supporto:",
    recentSearches: "🕐 Ricerche recenti:",
    noSearchHistory: "Nessuna cronologia",
    topTitle: "🔥 TOP-10 offerte di oggi:",
    countrySelected: "✅ Paese selezionato!",
    langSelected: "✅ Lingua cambiata!",
    error: "❌ Errore. Riprova.",
    discount: "SCONTO",
    sold: "venduto",
    freeShip: "Spedizione gratuita",
    priceDrop: "Prezzo sceso!",
    was: "Era",
    hotDeals: "🔥 Offerte",
    leaderboard: "🏆 Top",
    achievements: "🏅 Successi",
    myStats: "📊 Statistiche",
    leaderboardTitle: "🏆 <b>TOP UTENTI</b> 🏆\n\n━━━━━━━━━━━━━━━━━",
    achievementsTitle: "🏅 <b>I TUOI SUCCESSI</b> 🏅\n\n━━━━━━━━━━━━━━━━━",
    noAchievements: "😔 Nessun successo ancora\n\n📊 <b>Come guadagnare:</b>\n┣ 🔍 Prima ricerca (+10 pts)\n┣ ❤️ Primo preferito (+15 pts)\n┣ 👥 Primo referral (+25 pts)\n┣ 🔥 10 ricerche (+50 pts)\n┗ 🌟 5 referral (+100 pts)",
    statsTitle: "📊 <b>LE TUE STATISTICHE</b> 📊\n\n━━━━━━━━━━━━━━━━━",
    statsSearches: "🔍 <b>Ricerche:</b>",
    statsFavorites: "❤️ <b>Preferiti:</b>",
    statsReferrals: "👥 <b>Referral:</b>",
    statsClicks: "👆 <b>Click:</b>",
    statsPoints: "🏆 <b>Punti:</b>",
    statsStreak: "🔥 <b>Streak:</b>",
    statsDays: "giorni",
    leaderboardYourRank: "👤 La tua posizione:",
    hotDealsTitle: "🔥 <b>OFFERTE CALDE</b> 🔥\n\n━━━━━━━━━━━━━━━━━\nProdotti con 30%+ sconto!",
    more: "➕ Altro",
  },
  cs: {
    welcome: "Ahoj {name}! 🛍️ Pomohu ti najít nejlepší nabídky. Vyber svou zemi:",
    welcomeBack: "Vítej zpět, {name}! 🎉",
    mainMenu: "📱 Hlavní menu",
    search: "🔍 Hledat", top10: "🔥 TOP-10", categories: "📂 Kategorie", favorites: "❤️ Oblíbené",
    profile: "👤 Profil", support: "💬 Podpora", back: "🔙 Menu",
    searchPrompt: "Co hledáš?",
    resultsFor: "🔍 Výsledky pro",
    noResults: "😔 Nic nenalezeno.",
    buy: "🛒 Koupit",
    catElectronics: "📱 Elektronika", catClothing: "👗 Oblečení", catHome: "🏠 Domov",
    catBeauty: "💄 Krása", catGadgets: "🔌 Gadgety", catGifts: "🎁 Dárky", catUnder10: "💰 Do $10",
    favEmpty: "❤️ Žádné oblíbené",
    favAdded: "✅ Přidáno do oblíbených!",
    favRemoved: "❌ Odebráno z oblíbených",
    profileTitle: "👤 Tvůj profil",
    country: "🌍 Země", language: "🌐 Jazyk", notifications: "🔔 Oznámení",
    changeCountry: "🌍 Změnit zemi", changeLang: "🌐 Změnit jazyk",
    notifOn: "🔔 Zapnuto", notifOff: "🔕 Vypnuto",
    enableNotif: "🔔 Zapnout", disableNotif: "🔕 Vypnout",
    referral: "👥 Pozvat přátele",
    referralTitle: "🎁 Tvůj referenční odkaz:",
    referralStats: "👥 Pozváno: {count} přátel",
    couponEarned: "🎉 Získal jsi kupon!",
    couponProgress: "Ještě {left} přátel do kuponu",
    yourCoupon: "🏷️ Tvůj kupon: {code}",
    supportMsg: "💬 Kontaktuj podporu:",
    recentSearches: "🕐 Poslední hledání:",
    noSearchHistory: "Žádná historie",
    topTitle: "🔥 TOP-10 nabídek dnes:",
    countrySelected: "✅ Země vybrána!",
    langSelected: "✅ Jazyk změněn!",
    error: "❌ Chyba. Zkus to znovu.",
    discount: "SLEVA",
    sold: "prodáno",
    freeShip: "Doprava zdarma",
    priceDrop: "Cena klesla!",
    was: "Bylo",
    hotDeals: "🔥 Slevy",
    leaderboard: "🏆 Top",
    achievements: "🏅 Úspěchy",
    myStats: "📊 Statistiky",
    leaderboardTitle: "🏆 <b>TOP UŽIVATELÉ</b> 🏆\n\n━━━━━━━━━━━━━━━━━",
    achievementsTitle: "🏅 <b>TVÉ ÚSPĚCHY</b> 🏅\n\n━━━━━━━━━━━━━━━━━",
    noAchievements: "😔 Zatím žádné úspěchy\n\n📊 <b>Jak získat:</b>\n┣ 🔍 První vyhledávání (+10 pts)\n┣ ❤️ První oblíbený (+15 pts)\n┣ 👥 První doporučení (+25 pts)\n┣ 🔥 10 vyhledávání (+50 pts)\n┗ 🌟 5 doporučení (+100 pts)",
    statsTitle: "📊 <b>TVÉ STATISTIKY</b> 📊\n\n━━━━━━━━━━━━━━━━━",
    statsSearches: "🔍 <b>Vyhledávání:</b>",
    statsFavorites: "❤️ <b>Oblíbené:</b>",
    statsReferrals: "👥 <b>Doporučení:</b>",
    statsClicks: "👆 <b>Kliknutí:</b>",
    statsPoints: "🏆 <b>Body:</b>",
    statsStreak: "🔥 <b>Streak:</b>",
    statsDays: "dní",
    leaderboardYourRank: "👤 Tvoje pozice:",
    hotDealsTitle: "🔥 <b>HORKÉ NABÍDKY</b> 🔥\n\n━━━━━━━━━━━━━━━━━\nProdukty s 30%+ slevou!",
    more: "➕ Další",
  },
  ro: {
    welcome: "Salut {name}! 🛍️ Te ajut să găsești cele mai bune oferte. Alege țara:",
    welcomeBack: "Bine ai revenit, {name}! 🎉",
    mainMenu: "📱 Meniu principal",
    search: "🔍 Caută", top10: "🔥 TOP-10", categories: "📂 Categorii", favorites: "❤️ Favorite",
    profile: "👤 Profil", support: "💬 Suport", back: "🔙 Meniu",
    searchPrompt: "Ce cauți?",
    resultsFor: "🔍 Rezultate pentru",
    noResults: "😔 Nimic găsit.",
    buy: "🛒 Cumpără",
    catElectronics: "📱 Electronică", catClothing: "👗 Îmbrăcăminte", catHome: "🏠 Casă",
    catBeauty: "💄 Frumusețe", catGadgets: "🔌 Gadgeturi", catGifts: "🎁 Cadouri", catUnder10: "💰 Sub $10",
    favEmpty: "❤️ Niciun favorit",
    favAdded: "✅ Adăugat la favorite!",
    favRemoved: "❌ Eliminat din favorite",
    profileTitle: "👤 Profilul tău",
    country: "🌍 Țară", language: "🌐 Limbă", notifications: "🔔 Notificări",
    changeCountry: "🌍 Schimbă țara", changeLang: "🌐 Schimbă limba",
    notifOn: "🔔 Activat", notifOff: "🔕 Dezactivat",
    enableNotif: "🔔 Activează", disableNotif: "🔕 Dezactivează",
    referral: "👥 Invită prieteni",
    referralTitle: "🎁 Linkul tău de referință:",
    referralStats: "👥 Invitați: {count} prieteni",
    couponEarned: "🎉 Ai câștigat un cupon!",
    couponProgress: "Încă {left} prieteni pentru cupon",
    yourCoupon: "🏷️ Cuponul tău: {code}",
    supportMsg: "💬 Contactează suportul:",
    recentSearches: "🕐 Căutări recente:",
    noSearchHistory: "Fără istoric",
    topTitle: "🔥 TOP-10 oferte azi:",
    countrySelected: "✅ Țară selectată!",
    langSelected: "✅ Limba schimbată!",
    error: "❌ Eroare. Încearcă din nou.",
    discount: "REDUCERE",
    sold: "vândut",
    freeShip: "Livrare gratuită",
    priceDrop: "Preț scăzut!",
    was: "A fost",
    hotDeals: "🔥 Oferte",
    leaderboard: "🏆 Top",
    achievements: "🏅 Realizări",
    myStats: "📊 Statistici",
    leaderboardTitle: "🏆 <b>TOP UTILIZATORI</b> 🏆\n\n━━━━━━━━━━━━━━━━━",
    achievementsTitle: "🏅 <b>REALIZĂRILE TALE</b> 🏅\n\n━━━━━━━━━━━━━━━━━",
    noAchievements: "😔 Nicio realizare încă\n\n📊 <b>Cum să câștigi:</b>\n┣ 🔍 Prima căutare (+10 pts)\n┣ ❤️ Primul favorit (+15 pts)\n┣ 👥 Primul referral (+25 pts)\n┣ 🔥 10 căutări (+50 pts)\n┗ 🌟 5 referral-uri (+100 pts)",
    statsTitle: "📊 <b>STATISTICILE TALE</b> 📊\n\n━━━━━━━━━━━━━━━━━",
    statsSearches: "🔍 <b>Căutări:</b>",
    statsFavorites: "❤️ <b>Favorite:</b>",
    statsReferrals: "👥 <b>Referral-uri:</b>",
    statsClicks: "👆 <b>Click-uri:</b>",
    statsPoints: "🏆 <b>Puncte:</b>",
    statsStreak: "🔥 <b>Streak:</b>",
    statsDays: "zile",
    leaderboardYourRank: "👤 Poziția ta:",
    hotDealsTitle: "🔥 <b>OFERTE FIERBINȚI</b> 🔥\n\n━━━━━━━━━━━━━━━━━\nProduse cu 30%+ reducere!",
    more: "➕ Mai mult",
  },
};

const COUNTRY_CURRENCY: Record<string, string> = {
  Ukraine: "UAH", Germany: "EUR", Poland: "PLN", Czechia: "CZK", Romania: "RON",
  France: "EUR", Spain: "EUR", Italy: "EUR", UK: "GBP", USA: "USD",
};

const COUNTRY_LANG: Record<string, string> = {
  Ukraine: "uk", Germany: "de", Poland: "pl", Czechia: "cs", Romania: "ro",
  France: "fr", Spain: "es", Italy: "it", UK: "en", USA: "en",
};

function getText(lang: string, key: string, params?: Record<string, any>): string {
  const texts = LANG_TEXTS[lang] || LANG_TEXTS.en;
  let text = texts[key] || LANG_TEXTS.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

function getMainMenuButtons(lang: string, telegramId?: string) {
  const t = LANG_TEXTS[lang] || LANG_TEXTS.en;
  return [
    [{ text: t.search, callback_data: "action:search" }, { text: t.top10, callback_data: "action:top10" }],
    [{ text: t.categories, callback_data: "action:categories" }, { text: t.favorites, callback_data: "action:favorites" }],
    [{ text: t.hotDeals || "🔥 Hot Deals", callback_data: "action:hot_deals" }, { text: t.leaderboard || "🏆 Top", callback_data: "action:leaderboard" }],
    [{ text: t.history || "🕐 History", callback_data: "action:history" }, { text: t.profile, callback_data: "action:profile" }],
    [{ text: t.support, callback_data: "action:support" }],
  ];
}

function getCategoryButtons(lang: string) {
  const t = LANG_TEXTS[lang] || LANG_TEXTS.en;
  return [
    [{ text: t.catElectronics, callback_data: "cat:electronics" }, { text: t.catClothing, callback_data: "cat:clothing" }],
    [{ text: t.catHome, callback_data: "cat:home" }, { text: t.catBeauty, callback_data: "cat:beauty" }],
    [{ text: t.catGadgets, callback_data: "cat:gadgets" }, { text: t.catGifts, callback_data: "cat:gifts" }],
    [{ text: t.catUnder10, callback_data: "cat:under10" }],
    [{ text: t.back, callback_data: "action:menu" }],
  ];
}

function getProfileButtons(lang: string, dailyTopEnabled: boolean) {
  const t = LANG_TEXTS[lang] || LANG_TEXTS.en;
  return [
    [{ text: t.referral, callback_data: "action:referral" }, { text: t.myCoupons || "🎟️ Coupons", callback_data: "action:coupons" }],
    [{ text: t.achievements || "🏅 Achievements", callback_data: "action:achievements" }, { text: t.myStats || "📊 Stats", callback_data: "action:my_stats" }],
    [{ text: t.changeCountry, callback_data: "action:change_country" }, { text: t.changeLang, callback_data: "action:change_lang" }],
    [{ text: dailyTopEnabled ? t.disableNotif : t.enableNotif, callback_data: dailyTopEnabled ? "toggle:daily_off" : "toggle:daily_on" }],
    [{ text: t.back, callback_data: "action:menu" }],
  ];
}

const COUPON_MILESTONES = [
  { refs: 1, percent: 3, name: "STARTER" },
  { refs: 3, percent: 5, name: "BRONZE" },
  { refs: 5, percent: 10, name: "SILVER" },
  { refs: 10, percent: 15, name: "GOLD" },
];

function getNextMilestone(currentRefs: number) {
  for (const m of COUPON_MILESTONES) {
    if (currentRefs < m.refs) return m;
  }
  return null;
}

function getLangButtons() {
  return [
    [{ text: "🇺🇦 Українська", callback_data: "lang:uk" }, { text: "🇷🇺 Русский", callback_data: "lang:ru" }],
    [{ text: "🇬🇧 English", callback_data: "lang:en" }, { text: "🇩🇪 Deutsch", callback_data: "lang:de" }],
    [{ text: "🇵🇱 Polski", callback_data: "lang:pl" }, { text: "🇫🇷 Français", callback_data: "lang:fr" }],
    [{ text: "🇪🇸 Español", callback_data: "lang:es" }, { text: "🇮🇹 Italiano", callback_data: "lang:it" }],
    [{ text: "🇨🇿 Čeština", callback_data: "lang:cs" }, { text: "🇷🇴 Română", callback_data: "lang:ro" }],
  ];
}

const COUNTRY_BUTTONS = [
  [{ text: "🇺🇦 Україна", callback_data: "country:Ukraine" }, { text: "🇩🇪 Deutschland", callback_data: "country:Germany" }],
  [{ text: "🇵🇱 Polska", callback_data: "country:Poland" }, { text: "🇨🇿 Česko", callback_data: "country:Czechia" }],
  [{ text: "🇷🇴 România", callback_data: "country:Romania" }, { text: "🇫🇷 France", callback_data: "country:France" }],
  [{ text: "🇪🇸 España", callback_data: "country:Spain" }, { text: "🇮🇹 Italia", callback_data: "country:Italy" }],
  [{ text: "🇬🇧 UK", callback_data: "country:UK" }, { text: "🇺🇸 USA", callback_data: "country:USA" }],
];

const CATEGORY_KEYWORDS: Record<string, string> = {
  electronics: "smartphone tablet headphones",
  clothing: "fashion dress shirt",
  home: "home decor kitchen",
  beauty: "makeup skincare beauty",
  gadgets: "gadgets tools accessories",
  gifts: "gift set present",
  under10: "deals",
};

const responseSchema = z.object({
  response: z.string(),
  chatId: z.string(),
  telegramId: z.string().optional(),
  messageId: z.number().optional(),
  keyboard: z.string().optional(),
  lang: z.string().optional(),
  dailyTopEnabled: z.boolean().optional(),
  products: z.array(z.any()).optional(),
  favorites: z.array(z.any()).optional(),
  searchHistory: z.array(z.any()).optional(),
  searchQuery: z.string().optional(),
  searchPage: z.number().optional(),
  hasMore: z.boolean().optional(),
  adminStats: z.object({
    total: z.number(),
    today: z.number(),
    withNotif: z.number(),
  }).optional(),
});

const processMessageStep = createStep({
  id: "process-message",
  inputSchema: z.object({
    message: z.string().optional(),
    chatId: z.string(),
    telegramId: z.string(),
    isCallback: z.boolean(),
    callbackData: z.string().optional(),
    userName: z.string().optional(),
    languageCode: z.string().optional(),
    messageId: z.number().optional(),
  }),
  outputSchema: responseSchema,
  execute: async ({ inputData, mastra }) => {
    const { message, chatId, telegramId, isCallback, callbackData, userName, messageId } = inputData;
    const firstName = userName || "Friend";

    try {
      let [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
      const lang = user?.language || "en";
      const t = (key: string, params?: any) => getText(lang, key, params);

      if (message?.startsWith("/start")) {
        const parts = message.split(" ");
        const refCode = parts[1];

        if (!user) {
          const newRefCode = await generateUniqueReferralCode(telegramId);
          let referredById: number | null = null;

          if (refCode) {
            const [referrer] = await db.select().from(users).where(eq(users.referralCode, refCode)).limit(1);
            if (referrer) referredById = referrer.id;
          }

          await db.insert(users).values({
            telegramId,
            firstName,
            language: "uk",
            country: "",
            currency: "USD",
            referralCode: newRefCode,
            referredBy: referredById,
          });

          if (referredById) {
            const [newUser] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
            if (newUser) {
              await db.insert(referrals).values({ referrerId: referredById, referredId: newUser.id });
              const refCount = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(eq(referrals.referrerId, referredById));
              const totalRefs = Number(refCount[0]?.count || 0);
              
              if (totalRefs === 1) {
                const existingFirstRef = await db.select().from(achievements).where(and(eq(achievements.userId, referredById), eq(achievements.achievementType, "first_referral"))).limit(1);
                if (existingFirstRef.length === 0) {
                  await db.insert(achievements).values({ userId: referredById, achievementType: "first_referral" });
                  await db.update(users).set({ points: sql`${users.points} + 25` }).where(eq(users.id, referredById));
                }
              }
              if (totalRefs === 5) {
                const existingFiveRef = await db.select().from(achievements).where(and(eq(achievements.userId, referredById), eq(achievements.achievementType, "referrals_5"))).limit(1);
                if (existingFiveRef.length === 0) {
                  await db.insert(achievements).values({ userId: referredById, achievementType: "referrals_5" });
                  await db.update(users).set({ points: sql`${users.points} + 100` }).where(eq(users.id, referredById));
                }
              }
              
              for (const milestone of COUPON_MILESTONES) {
                if (totalRefs >= milestone.refs) {
                  const existingCoupon = await db.select().from(coupons).where(and(eq(coupons.userId, referredById), eq(coupons.earnedForReferrals, milestone.refs))).limit(1);
                  if (existingCoupon.length === 0) {
                    const couponCode = `BW${milestone.percent}-${referredById}-${Date.now().toString(36).toUpperCase()}`;
                    await db.insert(coupons).values({ userId: referredById, code: couponCode, discountPercent: milestone.percent, earnedForReferrals: milestone.refs });
                    
                    const [referrer] = await db.select().from(users).where(eq(users.id, referredById)).limit(1);
                    if (referrer) {
                      const botToken = process.env.TELEGRAM_BOT_TOKEN;
                      const referrerLang = referrer.language || "uk";
                      const newCouponMsg = getText(referrerLang, "newCouponEarned", { refs: milestone.refs, percent: milestone.percent, code: couponCode });
                      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ chat_id: referrer.telegramId, text: newCouponMsg, parse_mode: "HTML" })
                      }).catch(() => {});
                    }
                  }
                }
              }
            }
          }

          return { response: t("welcome", { name: firstName }), chatId, telegramId, keyboard: "country", lang: "uk" };
        }

        return { response: t("welcomeBack", { name: user.firstName || firstName }), chatId, telegramId, keyboard: "main", lang };
      }

      if (message === "/admin") {
        if (!isAdmin(telegramId)) {
          return { response: t("mainMenu"), chatId, telegramId, keyboard: "main", lang };
        }
        const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(users);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();
        const activeToday = await db.select({ count: sql<number>`count(*)` }).from(users).where(sql`${users.createdAt} >= ${todayISO}`);
        const withNotif = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.dailyTopEnabled, true));
        return {
          response: `🔐 Адмін-панель\n\n${t("totalUsers", { count: totalUsers[0]?.count || 0 })}\n${t("activeToday", { count: activeToday[0]?.count || 0 })}\n${t("withNotif", { count: withNotif[0]?.count || 0 })}`,
          chatId,
          telegramId,
          keyboard: "admin",
          lang,
          adminStats: {
            total: Number(totalUsers[0]?.count || 0),
            today: Number(activeToday[0]?.count || 0),
            withNotif: Number(withNotif[0]?.count || 0),
          }
        };
      }

      if (!user) {
        return { response: getText("uk", "welcome", { name: firstName }), chatId, telegramId, keyboard: "country", lang: "uk" };
      }

      if (isCallback && callbackData) {
        const [type, value] = callbackData.split(":");

        if (type === "country") {
          const currency = COUNTRY_CURRENCY[value] || "USD";
          const newLang = COUNTRY_LANG[value] || "en";
          await db.update(users).set({ country: value, currency, language: newLang }).where(eq(users.telegramId, telegramId));
          return { response: getText(newLang, "countrySelected"), chatId, telegramId, keyboard: "main", lang: newLang };
        }

        if (type === "lang") {
          await db.update(users).set({ language: value }).where(eq(users.telegramId, telegramId));
          return { response: getText(value, "langSelected"), chatId, telegramId, keyboard: "main", lang: value };
        }

        if (type === "toggle") {
          const enabled = value === "daily_on";
          await db.update(users).set({ dailyTopEnabled: enabled }).where(eq(users.telegramId, telegramId));
          return { response: enabled ? t("notifOn") : t("notifOff"), chatId, telegramId, keyboard: "profile", lang, dailyTopEnabled: enabled };
        }

        if (type === "cat") {
          const keyword = CATEGORY_KEYWORDS[value] || "trending";
          const maxPrice = value === "under10" ? 10 : 0;
          const res = await searchProductsTool.execute({
            context: { query: keyword, country: user.country, currency: user.currency, quality: "default", maxPrice, freeShipping: false, onlyDiscount: false, preferCheaper: value === "under10" },
            mastra, runtimeContext: {} as any
          });
          const allProducts = res.success ? res.products : [];
          return { response: `📂 ${value.toUpperCase()}:`, chatId, telegramId, messageId, products: allProducts.slice(0, 5), lang, searchQuery: `cat:${value}`, searchPage: 1, hasMore: allProducts.length > 5 };
        }

        if (type === "fav" && value === "remove") {
          const productId = callbackData.split(":")[2];
          await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.productId, productId)));
          return { response: t("favRemoved"), chatId, telegramId, keyboard: "main", lang };
        }

        if (type === "fav" && value === "add") {
          const parts = callbackData.split(":");
          const productId = parts[2];
          
          // Look up product data from cache
          const cachedProduct = await getCachedProduct(productId);
          const productTitle = cachedProduct?.title || "Product";
          const productUrl = cachedProduct?.url || "";
          const productImage = cachedProduct?.image || "";
          const price = cachedProduct?.price || 0;
          const currency = cachedProduct?.currency || user.currency;
          
          if (!cachedProduct) {
            console.log(`⚠️ [Favorites] Product ${productId} not found in cache`);
          }
          
          const existing = await db.select().from(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.productId, productId))).limit(1);
          if (existing.length === 0) {
            await db.insert(favorites).values({
              userId: user.id,
              productId,
              productTitle,
              productUrl,
              productImage,
              originalPrice: price,
              currentPrice: price,
              currency,
            });
            
            await db.insert(clickAnalytics).values({ userId: user.id, action: "add_favorite", productId, productTitle, productPrice: price, currency, createdAt: new Date() });
            
            const favTotal = await db.select({ count: sql<number>`count(*)` }).from(favorites).where(eq(favorites.userId, user.id));
            if (Number(favTotal[0]?.count || 0) === 1) {
              const existingAch = await db.select().from(achievements).where(and(eq(achievements.userId, user.id), eq(achievements.achievementType, "first_favorite"))).limit(1);
              if (existingAch.length === 0) {
                await db.insert(achievements).values({ userId: user.id, achievementType: "first_favorite" });
                await db.update(users).set({ points: sql`${users.points} + 15` }).where(eq(users.id, user.id));
              }
            }
          }
          return { response: t("favAdded"), chatId, telegramId, keyboard: "main", lang };
        }

        if (type === "repeat") {
          const historyIndex = parseInt(value);
          const history = await db.select().from(searchHistory).where(eq(searchHistory.userId, user.id)).orderBy(desc(searchHistory.createdAt)).limit(5);
          if (history[historyIndex]) {
            const query = history[historyIndex].query;
            const res = await searchProductsTool.execute({
              context: { query, country: user.country, currency: user.currency, quality: "default", maxPrice: 0, freeShipping: false, onlyDiscount: false, preferCheaper: false },
              mastra, runtimeContext: {} as any
            });
            const repeatProducts = res.success ? res.products : [];
            return { response: `${t("resultsFor")} "${query}":`, chatId, telegramId, messageId, products: repeatProducts.slice(0, 5), lang, searchQuery: query, searchPage: 1, hasMore: repeatProducts.length > 5 };
          }
        }

        if (type === "more") {
          const parts = callbackData.split(":");
          const moreType = parts[1];
          const page = parseInt(parts[2]) || 1;
          const query = decodeURIComponent(parts[3] || "");
          
          if (moreType === "search" && query) {
            const res = await searchProductsTool.execute({
              context: { query, country: user.country, currency: user.currency, quality: "default", maxPrice: 0, freeShipping: false, onlyDiscount: false, preferCheaper: false },
              mastra, runtimeContext: {} as any
            });
            const allProducts = res.success ? res.products : [];
            const start = page * 5;
            const pageProducts = allProducts.slice(start, start + 5);
            return { response: `${t("resultsFor")} "${query}" (${page + 1}):`, chatId, telegramId, messageId, products: pageProducts, lang, searchQuery: query, searchPage: page + 1, hasMore: allProducts.length > start + 5 };
          }
          
          if (moreType === "cat") {
            const keyword = CATEGORY_KEYWORDS[query] || "trending";
            const maxPrice = query === "under10" ? 10 : 0;
            const res = await searchProductsTool.execute({
              context: { query: keyword, country: user.country, currency: user.currency, quality: "default", maxPrice, freeShipping: false, onlyDiscount: false, preferCheaper: query === "under10" },
              mastra, runtimeContext: {} as any
            });
            const allProducts = res.success ? res.products : [];
            const start = page * 5;
            const pageProducts = allProducts.slice(start, start + 5);
            return { response: `📂 ${query.toUpperCase()} (${page + 1}):`, chatId, telegramId, messageId, products: pageProducts, lang, searchQuery: `cat:${query}`, searchPage: page + 1, hasMore: allProducts.length > start + 5 };
          }

          if (moreType === "top") {
            const res = await getTopProductsTool.execute({
              context: { country: user.country, currency: user.currency, category: "" },
              mastra, runtimeContext: {} as any
            });
            const allProducts = res.success ? res.products : [];
            const start = page * 10;
            const pageProducts = allProducts.slice(start, start + 10);
            return { response: `${t("topTitle")} (${page + 1}):`, chatId, telegramId, messageId, products: pageProducts, lang, searchQuery: "top", searchPage: page + 1, hasMore: allProducts.length > start + 10 };
          }

          if (moreType === "hot") {
            const hotRes = await searchProductsTool.execute({
              context: { query: "deals discount sale", country: user.country, currency: user.currency, quality: "default", maxPrice: 0, freeShipping: false, onlyDiscount: true, preferCheaper: false },
              mastra, runtimeContext: {} as any
            });
            const allProducts = hotRes.products || [];
            const start = page * 5;
            const pageProducts = allProducts.slice(start, start + 5);
            return { response: `${t("hotDealsTitle")} (${page + 1}):`, chatId, telegramId, messageId, products: pageProducts, lang, searchQuery: "hot", searchPage: page + 1, hasMore: allProducts.length > start + 5 };
          }
        }

        if (type === "action") {
          switch (value) {
            case "menu":
              return { response: t("mainMenu"), chatId, telegramId, keyboard: "main", lang };

            case "search":
              return { response: t("searchPrompt"), chatId, telegramId, keyboard: "back", lang };

            case "top10":
              const topRes = await getTopProductsTool.execute({
                context: { country: user.country, currency: user.currency, category: "" },
                mastra, runtimeContext: {} as any
              });
              const topProducts = topRes.success ? topRes.products : [];
              return { response: t("topTitle"), chatId, telegramId, messageId, products: topProducts.slice(0, 10), lang, searchQuery: "top", searchPage: 1, hasMore: topProducts.length > 10 };

            case "categories":
              return { response: t("categories"), chatId, telegramId, keyboard: "categories", lang };

            case "favorites":
              const favs = await db.select().from(favorites).where(eq(favorites.userId, user.id)).orderBy(desc(favorites.createdAt)).limit(10);
              if (favs.length === 0) {
                return { response: t("favEmpty"), chatId, telegramId, keyboard: "main", lang };
              }
              return { response: t("favorites"), chatId, telegramId, favorites: favs, lang };

            case "profile":
              const [currentUser] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
              const profileRefCount = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(eq(referrals.referrerId, currentUser.id));
              const profileRefs = Number(profileRefCount[0]?.count || 0);
              const profileCoupons = await db.select({ count: sql<number>`count(*)` }).from(coupons).where(eq(coupons.userId, currentUser.id));
              const couponsCount = Number(profileCoupons[0]?.count || 0);
              
              let userRank = "🌱 Новачок";
              let rankEmoji = "🌱";
              if (profileRefs >= 10) { userRank = "👑 VIP"; rankEmoji = "👑"; }
              else if (profileRefs >= 5) { userRank = "🥇 Золото"; rankEmoji = "🥇"; }
              else if (profileRefs >= 3) { userRank = "🥈 Срібло"; rankEmoji = "🥈"; }
              else if (profileRefs >= 1) { userRank = "🥉 Бронза"; rankEmoji = "🥉"; }
              
              const profileText = `${t("profileTitle")}

━━━━━━━━━━━━━━━━━
${rankEmoji} <b>Рейтинг:</b> ${userRank}
👥 <b>Запрошено:</b> ${profileRefs} друзів
🎟️ <b>Купонів:</b> ${couponsCount}
━━━━━━━━━━━━━━━━━

${t("country")}: ${currentUser.country || "-"}
${t("language")}: ${currentUser.language}
${t("notifications")}: ${currentUser.dailyTopEnabled ? t("notifOn") : t("notifOff")}`;
              return { response: profileText, chatId, telegramId, keyboard: "profile", lang, dailyTopEnabled: currentUser.dailyTopEnabled };

            case "history":
              const historyItems = await db.select().from(searchHistory).where(eq(searchHistory.userId, user.id)).orderBy(desc(searchHistory.createdAt)).limit(5);
              if (historyItems.length === 0) {
                return { response: t("noSearchHistory"), chatId, telegramId, keyboard: "main", lang };
              }
              return { response: t("recentSearches"), chatId, telegramId, searchHistory: historyItems, lang };

            case "support":
              return { response: `${t("supportMsg")}\n\n@bogdan_OP24`, chatId, telegramId, keyboard: "support", lang };

            case "admin":
              if (!isAdmin(telegramId)) {
                return { response: t("mainMenu"), chatId, telegramId, keyboard: "main", lang };
              }
              const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(users);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const todayISO = today.toISOString();
              const activeToday = await db.select({ count: sql<number>`count(*)` }).from(users).where(sql`${users.createdAt} >= ${todayISO}`);
              const withNotif = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.dailyTopEnabled, true));
              return {
                response: `🔐 Адмін-панель\n\n${t("totalUsers", { count: totalUsers[0]?.count || 0 })}\n${t("activeToday", { count: activeToday[0]?.count || 0 })}\n${t("withNotif", { count: withNotif[0]?.count || 0 })}`,
                chatId,
                telegramId,
                keyboard: "admin",
                lang,
                adminStats: {
                  total: Number(totalUsers[0]?.count || 0),
                  today: Number(activeToday[0]?.count || 0),
                  withNotif: Number(withNotif[0]?.count || 0),
                }
              };

            case "broadcast":
              if (!isAdmin(telegramId)) {
                return { response: t("mainMenu"), chatId, telegramId, keyboard: "main", lang };
              }
              await db.update(users).set({ pendingAction: "broadcast" }).where(eq(users.telegramId, telegramId));
              return { response: t("broadcastPrompt") || "Напиши текст розсилки:", chatId, telegramId, keyboard: "admin_broadcast", lang };

            case "admin_countries":
              if (!isAdmin(telegramId)) {
                return { response: t("mainMenu"), chatId, telegramId, keyboard: "main", lang };
              }
              const countryStats = await db.select({
                country: users.country,
                count: sql<number>`count(*)`,
              }).from(users).groupBy(users.country);
              
              let countryText = "👥 <b>Users by Country</b>\n\n━━━━━━━━━━━━━━━━━\n";
              const sortedCountries = countryStats
                .filter(s => s.country && s.country.length > 0)
                .sort((a, b) => Number(b.count) - Number(a.count));
              
              for (const stat of sortedCountries) {
                const flag = stat.country === "Ukraine" ? "🇺🇦" : 
                             stat.country === "Germany" ? "🇩🇪" :
                             stat.country === "Poland" ? "🇵🇱" :
                             stat.country === "Czechia" ? "🇨🇿" :
                             stat.country === "Romania" ? "🇷🇴" :
                             stat.country === "France" ? "🇫🇷" :
                             stat.country === "Spain" ? "🇪🇸" :
                             stat.country === "Italy" ? "🇮🇹" :
                             stat.country === "UK" ? "🇬🇧" :
                             stat.country === "USA" ? "🇺🇸" : "🌍";
                countryText += `${flag} <b>${stat.country}:</b> ${stat.count}\n`;
              }
              
              const noCountry = countryStats.find(s => !s.country || s.country.length === 0);
              if (noCountry) {
                countryText += `\n⚠️ <b>No country set:</b> ${noCountry.count}`;
              }
              
              return { response: countryText, chatId, telegramId, keyboard: "admin", lang };

            case "admin_history":
              if (!isAdmin(telegramId)) {
                return { response: t("mainMenu"), chatId, telegramId, keyboard: "main", lang };
              }
              const recentBroadcasts = await db.select()
                .from(broadcasts)
                .orderBy(desc(broadcasts.sentAt))
                .limit(10);
              
              let historyText = "📜 <b>Broadcast History</b>\n\n━━━━━━━━━━━━━━━━━\n";
              
              if (recentBroadcasts.length === 0) {
                historyText += "No broadcasts yet.";
              } else {
                for (const b of recentBroadcasts) {
                  const date = b.sentAt ? new Date(b.sentAt).toLocaleDateString('uk-UA') : "N/A";
                  const msgPreview = b.message?.substring(0, 30) || "N/A";
                  historyText += `📅 <b>${date}</b>\n👥 Sent to: ${b.sentCount}\n💬 ${msgPreview}...\n\n`;
                }
              }
              
              return { response: historyText, chatId, telegramId, keyboard: "admin", lang };

            case "change_country":
              return { response: t("changeCountry"), chatId, keyboard: "country", lang };

            case "change_lang":
              return { response: t("changeLang"), chatId, keyboard: "lang", lang };

            case "referral":
              const refCount = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(eq(referrals.referrerId, user.id));
              const refTotal = Number(refCount[0]?.count || 0);
              
              let refText = `${t("referralTitle")}\n\nhttps://t.me/BuyWises_bot?start=${user.referralCode}\n\n${t("referralStats", { count: refTotal })}`;
              
              const nextM = getNextMilestone(refTotal);
              if (nextM) {
                refText += `\n\n📊 <b>До ${nextM.percent}% купона:</b> ${nextM.refs - refTotal} друзів`;
              } else {
                refText += t("allMilestonesReached");
              }
              return { response: refText, chatId, telegramId, keyboard: "profile", lang };

            case "coupons":
              const userCoupons = await db.select().from(coupons).where(eq(coupons.userId, user.id)).orderBy(desc(coupons.discountPercent));
              const couponRefCount = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(eq(referrals.referrerId, user.id));
              const couponRefs = Number(couponRefCount[0]?.count || 0);
              
              if (userCoupons.length === 0) {
                let noCouponsText = t("noCoupons");
                const nextCoupon = getNextMilestone(couponRefs);
                if (nextCoupon) {
                  noCouponsText += `\n\n👥 Запрошено: ${couponRefs}\n📊 До ${nextCoupon.percent}% купона: ${nextCoupon.refs - couponRefs} друзів`;
                }
                return { response: noCouponsText, chatId, telegramId, keyboard: "profile", lang };
              }
              
              let couponsText = t("couponsTitle") + "\n\n";
              for (const c of userCoupons) {
                const milestone = COUPON_MILESTONES.find(m => m.percent === c.discountPercent);
                couponsText += `🎟️ <b>${milestone?.name || "BONUS"}</b> — ${c.discountPercent}%\n<code>${c.code}</code>\n\n`;
              }
              
              const nextCouponMilestone = getNextMilestone(couponRefs);
              if (nextCouponMilestone) {
                couponsText += `📊 <b>До ${nextCouponMilestone.percent}% купона:</b> ${nextCouponMilestone.refs - couponRefs} друзів`;
              } else {
                couponsText += t("allMilestonesReached");
              }
              return { response: couponsText, chatId, telegramId, keyboard: "profile", lang };

            case "leaderboard":
              const topUsers = await db.select({
                firstName: users.firstName,
                points: users.points,
                streak: users.streak
              }).from(users).orderBy(desc(users.points)).limit(10);
              
              let lbText = t("leaderboardTitle") + "\n\n";
              topUsers.forEach((u, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                lbText += `${medal} <b>${u.firstName || "User"}</b> — ${u.points || 0} pts\n`;
              });
              
              const myRankResult = await db.select({ count: sql<number>`count(*)` }).from(users).where(sql`${users.points} > ${user.points || 0}`);
              const myRank = Number(myRankResult[0]?.count || 0) + 1;
              lbText += `\n━━━━━━━━━━━━━━━━━\n${t("leaderboardYourRank")} <b>#${myRank}</b> (${user.points || 0} pts)`;
              
              return { response: lbText, chatId, telegramId, keyboard: "main", lang };

            case "achievements":
              const userAchievements = await db.select().from(achievements).where(eq(achievements.userId, user.id));
              
              if (userAchievements.length === 0) {
                return { response: t("noAchievements"), chatId, telegramId, keyboard: "profile", lang };
              }
              
              const ACHIEVEMENT_NAMES: Record<string, Record<string, string>> = {
                uk: { first_search: "🔍 Перший пошук", first_favorite: "❤️ Перше обране", first_referral: "👥 Перший реферал", searches_10: "🔥 10 пошуків", referrals_5: "🌟 5 рефералів" },
                ru: { first_search: "🔍 Первый поиск", first_favorite: "❤️ Первое избранное", first_referral: "👥 Первый реферал", searches_10: "🔥 10 поисков", referrals_5: "🌟 5 рефералов" },
                en: { first_search: "🔍 First Search", first_favorite: "❤️ First Favorite", first_referral: "👥 First Referral", searches_10: "🔥 10 Searches", referrals_5: "🌟 5 Referrals" },
                de: { first_search: "🔍 Erste Suche", first_favorite: "❤️ Erster Favorit", first_referral: "👥 Erster Empfehlene", searches_10: "🔥 10 Suchen", referrals_5: "🌟 5 Empfehlene" },
                pl: { first_search: "🔍 Pierwsze wyszukiwanie", first_favorite: "❤️ Pierwszy ulubiony", first_referral: "👥 Pierwszy polecony", searches_10: "🔥 10 wyszukiwań", referrals_5: "🌟 5 poleconych" },
                cs: { first_search: "🔍 První vyhledávání", first_favorite: "❤️ První oblíbený", first_referral: "👥 První doporučení", searches_10: "🔥 10 vyhledávání", referrals_5: "🌟 5 doporučení" },
                fr: { first_search: "🔍 Première recherche", first_favorite: "❤️ Premier favori", first_referral: "👥 Premier parrainage", searches_10: "🔥 10 recherches", referrals_5: "🌟 5 parrainages" },
                es: { first_search: "🔍 Primera búsqueda", first_favorite: "❤️ Primer favorito", first_referral: "👥 Primer referido", searches_10: "🔥 10 búsquedas", referrals_5: "🌟 5 referidos" },
                it: { first_search: "🔍 Prima ricerca", first_favorite: "❤️ Primo preferito", first_referral: "👥 Primo referral", searches_10: "🔥 10 ricerche", referrals_5: "🌟 5 referral" },
                ro: { first_search: "🔍 Prima căutare", first_favorite: "❤️ Primul favorit", first_referral: "👥 Primul referral", searches_10: "🔥 10 căutări", referrals_5: "🌟 5 referral-uri" }
              };
              const achNames = ACHIEVEMENT_NAMES[lang] || ACHIEVEMENT_NAMES.en;
              
              let achText = t("achievementsTitle") + "\n\n";
              for (const a of userAchievements) {
                achText += `${achNames[a.achievementType] || a.achievementType}\n`;
              }
              return { response: achText, chatId, telegramId, keyboard: "profile", lang };

            case "my_stats":
              const searchCount = await db.select({ count: sql<number>`count(*)` }).from(searchHistory).where(eq(searchHistory.userId, user.id));
              const favCount = await db.select({ count: sql<number>`count(*)` }).from(favorites).where(eq(favorites.userId, user.id));
              const refStatsCount = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(eq(referrals.referrerId, user.id));
              const clickCount = await db.select({ count: sql<number>`count(*)` }).from(clickAnalytics).where(eq(clickAnalytics.userId, user.id));
              
              const statsText = `${t("statsTitle")}

${t("statsSearches")} ${searchCount[0]?.count || 0}
${t("statsFavorites")} ${favCount[0]?.count || 0}
${t("statsReferrals")} ${refStatsCount[0]?.count || 0}
${t("statsClicks")} ${clickCount[0]?.count || 0}

━━━━━━━━━━━━━━━━━
${t("statsPoints")} ${user.points || 0}
${t("statsStreak")} ${user.streak || 0} ${t("statsDays")}`;
              return { response: statsText, chatId, telegramId, keyboard: "profile", lang };

            case "hot_deals":
              const hotDealsRes = await searchProductsTool.execute({
                context: { query: "hot sale discount", country: user.country, currency: user.currency, quality: "default", maxPrice: 0, freeShipping: false, onlyDiscount: true, preferCheaper: false },
                mastra, runtimeContext: {} as any
              });
              
              await db.insert(clickAnalytics).values({ userId: user.id, action: "view_hot_deals", createdAt: new Date() });
              
              if (!hotDealsRes.success || hotDealsRes.products.length === 0) {
                return { response: t("hotDealsTitle") + "\n\n😔 Зараз немає гарячих знижок", chatId, telegramId, keyboard: "main", lang };
              }
              const hotProducts = hotDealsRes.products;
              return { response: t("hotDealsTitle"), chatId, telegramId, messageId, products: hotProducts.slice(0, 5), lang, searchQuery: "hot", searchPage: 1, hasMore: hotProducts.length > 5 };

          }
        }

        if (type === "broadcast" && value === "send" && isAdmin(telegramId)) {
          return { response: t("broadcastPrompt") || "Напиши текст для розсилки:", chatId, telegramId, keyboard: "admin_broadcast", lang };
        }
      }

      if (message && message.length > 1 && !message.startsWith("/")) {
        if (user.pendingAction === "broadcast" && isAdmin(telegramId)) {
          await db.update(users).set({ pendingAction: null }).where(eq(users.telegramId, telegramId));
          const allUsers = await db.select().from(users);
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          let sentCount = 0;
          for (const u of allUsers) {
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: u.telegramId, text: message, parse_mode: "HTML" })
              });
              sentCount++;
            } catch {}
          }
          await db.insert(broadcasts).values({ adminId: telegramId, message, sentCount, sentAt: new Date() });
          return { response: t("broadcastSent", { count: sentCount }), chatId, telegramId, keyboard: "admin", lang };
        }

        await db.insert(searchHistory).values({ userId: user.id, query: message, createdAt: new Date() });
        await db.insert(clickAnalytics).values({ userId: user.id, action: "search", category: message, createdAt: new Date() });
        
        await db.update(users).set({ 
          points: sql`${users.points} + 1`,
          lastActiveAt: new Date()
        }).where(eq(users.id, user.id));
        
        const searchTotalCount = await db.select({ count: sql<number>`count(*)` }).from(searchHistory).where(eq(searchHistory.userId, user.id));
        const totalSearches = Number(searchTotalCount[0]?.count || 0);
        
        if (totalSearches === 1) {
          const existingAch = await db.select().from(achievements).where(and(eq(achievements.userId, user.id), eq(achievements.achievementType, "first_search"))).limit(1);
          if (existingAch.length === 0) {
            await db.insert(achievements).values({ userId: user.id, achievementType: "first_search" });
            await db.update(users).set({ points: sql`${users.points} + 10` }).where(eq(users.id, user.id));
          }
        }
        if (totalSearches === 10) {
          const existingAch = await db.select().from(achievements).where(and(eq(achievements.userId, user.id), eq(achievements.achievementType, "searches_10"))).limit(1);
          if (existingAch.length === 0) {
            await db.insert(achievements).values({ userId: user.id, achievementType: "searches_10" });
            await db.update(users).set({ points: sql`${users.points} + 50` }).where(eq(users.id, user.id));
          }
        }
        
        const searchRes = await searchProductsTool.execute({
          context: { query: message, country: user.country, currency: user.currency, quality: "default", maxPrice: 0, freeShipping: false, onlyDiscount: false, preferCheaper: false },
          mastra, runtimeContext: {} as any
        });
        if (searchRes.products.length === 0) {
          return { response: t("noResults"), chatId, telegramId, keyboard: "main", lang };
        }
        const allSearchProducts = searchRes.products;
        return { response: `${t("resultsFor")} "${message}":`, chatId, telegramId, products: allSearchProducts.slice(0, 5), lang, searchQuery: message, searchPage: 1, hasMore: allSearchProducts.length > 5 };
      }

      return { response: t("mainMenu"), chatId, telegramId, keyboard: "main", lang };
    } catch (e) {
      console.error("❌ [processMessageStep] Error:", e);
      return { response: getText("uk", "error"), chatId, telegramId, keyboard: "main", lang: "uk" };
    }
  }
});

const sendToTelegramStep = createStep({
  id: "send-to-telegram",
  inputSchema: responseSchema,
  outputSchema: z.object({ sent: z.boolean() }),
  execute: async ({ inputData }) => {
    const data = inputData;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || !data || data.chatId === "unknown") return { sent: false };

    const lang = data.lang || "uk";
    const t = LANG_TEXTS[lang] || LANG_TEXTS.en;

    try {
      let kb: any = null;
      
      switch (data.keyboard) {
        case "main":
          kb = { inline_keyboard: getMainMenuButtons(lang, data.telegramId) };
          break;
        case "country":
          kb = { inline_keyboard: COUNTRY_BUTTONS };
          break;
        case "back":
          kb = { inline_keyboard: [[{ text: t.back, callback_data: "action:menu" }]] };
          break;
        case "categories":
          kb = { inline_keyboard: getCategoryButtons(lang) };
          break;
        case "profile":
          kb = { inline_keyboard: getProfileButtons(lang, data.dailyTopEnabled ?? true) };
          break;
        case "lang":
          kb = { inline_keyboard: [...getLangButtons(), [{ text: t.back, callback_data: "action:menu" }]] };
          break;
        case "support":
          kb = { inline_keyboard: [
            [{ text: "💬 @bogdan_OP24", url: "https://t.me/bogdan_OP24" }],
            [{ text: t.back, callback_data: "action:menu" }]
          ]};
          break;
        case "admin":
          kb = { inline_keyboard: [
            [{ text: t.adminBroadcast || "📢 Broadcast", callback_data: "action:broadcast" }],
            [{ text: "👥 Users by Country", callback_data: "action:admin_countries" }],
            [{ text: "📜 Broadcast History", callback_data: "action:admin_history" }],
            [{ text: t.adminStats || "📊 Refresh Stats", callback_data: "action:admin" }],
            [{ text: t.back, callback_data: "action:menu" }]
          ]};
          break;
        case "admin_broadcast":
          kb = { inline_keyboard: [
            [{ text: t.back, callback_data: "action:admin" }]
          ]};
          break;
      }

      if (data.products && data.products.length > 0) {
        for (const p of data.products) {
          const rating = p.rating || 4.5;
          const stars = "⭐".repeat(Math.max(1, Math.round(rating)));
          const price = typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0;
          const origPrice = typeof p.originalPrice === 'number' ? p.originalPrice : parseFloat(p.originalPrice) || 0;
          const discountBadge = p.discount > 0 ? `\n🔥 <b>-${p.discount}% ${t.discount || 'OFF'}!</b>` : "";
          const originalPriceText = p.discount > 0 && origPrice > price 
            ? `<s>${origPrice.toFixed(2)}</s> → ` 
            : "";
          const ordersNum = p.orders || 0;
          const ordersText = ordersNum > 1000 ? `${(ordersNum/1000).toFixed(1)}K` : String(ordersNum);
          const caption = `<b>${p.title?.substring(0, 100)}</b>${discountBadge}\n\n💰 ${originalPriceText}<b>${price.toFixed(2)} ${p.currency}</b>\n${stars} ${rating.toFixed(1)} | 📦 ${ordersText} ${t.sold || 'sold'}\n🚚 ${t.freeShip || 'Free shipping'}`;
          
          const productId = p.id || p.productId || String(Date.now());
          
          // Cache product data for later lookup when user clicks "Add to favorites"
          await cacheProduct(
            productId,
            (p.title || "Product").substring(0, 100),
            p.affiliateUrl || p.productUrl || "",
            p.imageUrl || "",
            price,
            p.currency || "USD"
          );
          
          // Use short callback format that fits in 64 bytes
          const favCallback = `fav:add:${productId}`;
          
          const mk = { inline_keyboard: [
            [{ text: t.buy, url: p.affiliateUrl || p.productUrl }],
            [{ text: t.addFav || "❤️ Add", callback_data: favCallback }]
          ]};
          
          if (p.imageUrl) {
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  chat_id: data.chatId, 
                  photo: p.imageUrl, 
                  caption, 
                  parse_mode: "HTML", 
                  reply_markup: mk 
                })
              });
            } catch {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: data.chatId, text: caption, parse_mode: "HTML", reply_markup: mk })
              });
            }
          } else {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: data.chatId, text: caption, parse_mode: "HTML", reply_markup: mk })
            });
          }
        }
        
        const menuButtons: any[] = [];
        if (data.hasMore && data.searchQuery && data.searchPage) {
          let moreType = "search";
          let moreQuery = encodeURIComponent(data.searchQuery);
          if (data.searchQuery === "top") {
            moreType = "top";
            moreQuery = "";
          } else if (data.searchQuery === "hot") {
            moreType = "hot";
            moreQuery = "";
          } else if (data.searchQuery.startsWith("cat:")) {
            moreType = "cat";
            moreQuery = data.searchQuery.replace("cat:", "");
          }
          menuButtons.push([{ text: t.more || "➕ More", callback_data: `more:${moreType}:${data.searchPage}:${moreQuery}` }]);
        }
        menuButtons.push(...getMainMenuButtons(lang, data.telegramId));
        
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: data.chatId, text: t.mainMenu, reply_markup: { inline_keyboard: menuButtons } })
        });
        return { sent: true };
      }

      if (data.favorites && data.favorites.length > 0) {
        for (const f of data.favorites) {
          const currPrice = typeof f.currentPrice === 'number' ? f.currentPrice : parseFloat(f.currentPrice) || 0;
          const origPrice = typeof f.originalPrice === 'number' ? f.originalPrice : parseFloat(f.originalPrice) || 0;
          const priceDropBadge = origPrice > 0 && currPrice < origPrice 
            ? `\n📉 <b>${t.priceDrop || 'Price dropped!'}</b> ${t.was || 'Was'}: <s>${origPrice.toFixed(2)} ${f.currency}</s>` 
            : "";
          const caption = `❤️ <b>${f.productTitle}</b>${priceDropBadge}\n\n💰 <b>${currPrice.toFixed(2)} ${f.currency}</b>`;
          const mk = { inline_keyboard: [
            [{ text: t.buy, url: f.productUrl }],
            [{ text: "❌ Remove", callback_data: `fav:remove:${f.productId}` }]
          ]};
          
          if (f.productImage) {
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  chat_id: data.chatId, 
                  photo: f.productImage, 
                  caption, 
                  parse_mode: "HTML", 
                  reply_markup: mk 
                })
              });
            } catch {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: data.chatId, text: caption, parse_mode: "HTML", reply_markup: mk })
              });
            }
          } else {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: data.chatId, text: caption, parse_mode: "HTML", reply_markup: mk })
            });
          }
        }
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: data.chatId, text: t.mainMenu, reply_markup: { inline_keyboard: getMainMenuButtons(lang, data.telegramId) } })
        });
        return { sent: true };
      }

      if (data.searchHistory && data.searchHistory.length > 0) {
        const buttons = data.searchHistory.map((h: any, i: number) => [{ text: `${i + 1}️⃣ ${h.query}`, callback_data: `repeat:${i}` }]);
        buttons.push([{ text: t.back, callback_data: "action:menu" }]);
        
        if (data.messageId) {
          await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: data.chatId, message_id: data.messageId, text: data.response, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } })
          });
        } else {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: data.chatId, text: data.response, reply_markup: { inline_keyboard: buttons } })
          });
        }
        return { sent: true };
      }

      if (!kb && data.keyboard === "main") {
        kb = { inline_keyboard: getMainMenuButtons(lang, data.telegramId) };
      }

      if (data.messageId && kb) {
        await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: data.chatId, message_id: data.messageId, text: data.response, parse_mode: "HTML", reply_markup: kb })
        });
      } else {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: data.chatId, text: data.response, parse_mode: "HTML", reply_markup: kb })
        });
      }
      return { sent: true };
    } catch (e) {
      console.error("❌ [sendToTelegramStep] Error:", e);
      return { sent: false };
    }
  }
});

export const telegramBotWorkflow = createWorkflow({
  id: "telegram-bot-workflow",
  inputSchema: z.object({
    message: z.string().optional(),
    chatId: z.string(),
    telegramId: z.string(),
    isCallback: z.boolean(),
    callbackData: z.string().optional(),
    userName: z.string().optional(),
    languageCode: z.string().optional(),
    messageId: z.number().optional(),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
  }),
})
  .then(processMessageStep)
  .then(sendToTelegramStep)
  .commit();
