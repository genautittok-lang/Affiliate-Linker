import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { buyWiseAgent } from "../agents/buyWiseAgent";
import { db } from "../../db";
import { users, favorites, referrals, searchHistory, coupons, broadcasts } from "../../db/schema";
import { desc } from "drizzle-orm";
import { eq, and, sql } from "drizzle-orm";
import { searchProductsTool, getTopProductsTool } from "../tools/aliexpressSearchTool";
import { getReferralLinkTool, processReferralTool } from "../tools/referralTool";
import { isAdmin, getSupportInfoTool } from "../tools/adminTool";
import { formatProductCard, createProductKeyboard, createMainMenuKeyboard } from "../tools/telegramHelpers";

const productCache = new Map<string, { title: string; url: string; img: string; price: number }>();
const searchCache = new Map<string, { query: string; page: number; isTop: boolean }>();

const COUNTRY_BUTTONS = [
  [{ text: "🇺🇦 Україна", callback_data: "country:Ukraine" }, { text: "🇩🇪 Deutschland", callback_data: "country:Germany" }],
  [{ text: "🇵🇱 Polska", callback_data: "country:Poland" }, { text: "🇨🇿 Česko", callback_data: "country:Czechia" }],
  [{ text: "🇷🇴 România", callback_data: "country:Romania" }, { text: "🇫🇷 France", callback_data: "country:France" }],
  [{ text: "🇪🇸 España", callback_data: "country:Spain" }, { text: "🇮🇹 Italia", callback_data: "country:Italy" }],
  [{ text: "🇬🇧 UK", callback_data: "country:UK" }, { text: "🇺🇸 USA", callback_data: "country:USA" }],
];

const MAIN_MENU_BUTTONS = [
  [{ text: "🔍 Пошук", callback_data: "action:search" }, { text: "🔥 ТОП-10", callback_data: "action:top10" }],
  [{ text: "📂 Категорії", callback_data: "action:categories" }, { text: "🕐 Історія", callback_data: "action:history" }],
  [{ text: "❤️ Обране", callback_data: "action:favorites" }, { text: "👤 Профіль", callback_data: "action:profile" }],
  [{ text: "🎁 Рефералка", callback_data: "action:referral" }, { text: "🌐 Мова", callback_data: "action:language" }],
  [{ text: "💬 Підтримка", callback_data: "action:support" }],
];

const PROFILE_BUTTONS = [
  [{ text: "🌍 Змінити країну", callback_data: "settings:country" }],
  [{ text: "🌐 Змінити мову", callback_data: "action:language" }],
  [{ text: "🔔 Сповіщення ТОП-10", callback_data: "toggle:daily_on" }],
  [{ text: "🔙 Меню", callback_data: "action:menu" }],
];

const LANGUAGE_BUTTONS = [
  [{ text: "🇺🇦 Українська", callback_data: "lang:uk" }, { text: "🇷🇺 Русский", callback_data: "lang:ru" }],
  [{ text: "🇬🇧 English", callback_data: "lang:en" }, { text: "🇩🇪 Deutsch", callback_data: "lang:de" }],
  [{ text: "🇵🇱 Polski", callback_data: "lang:pl" }, { text: "🇫🇷 Français", callback_data: "lang:fr" }],
  [{ text: "🇪🇸 Español", callback_data: "lang:es" }, { text: "🇮🇹 Italiano", callback_data: "lang:it" }],
  [{ text: "🇨🇿 Čeština", callback_data: "lang:cs" }, { text: "🇷🇴 Română", callback_data: "lang:ro" }],
  [{ text: "🔙 Назад", callback_data: "action:menu" }],
];

const BACK_BUTTON = [
  [{ text: "🔙 Меню", callback_data: "action:menu" }],
];

interface LangTexts {
  welcome: string;
  welcomeBack: string;
  chooseCountry: string;
  chooseLang: string;
  ready: string;
  search: string;
  profile: string;
  support: string;
  langChanged: string;
  noFavorites: string;
  referral: string;
  referralStats: string;
  notifEnabled: string;
  notifDisabled: string;
  enableNotif: string;
  disableNotif: string;
  notifOn: string;
  notifOff: string;
  changeCountry: string;
  changeLang: string;
  backMenu: string;
  categories: string;
  catElectronics: string;
  catClothing: string;
  catHome: string;
  catBeauty: string;
  catGadgets: string;
  catGifts: string;
  catUnder10: string;
  recentSearches: string;
  noSearchHistory: string;
  couponEarned: string;
  couponProgress: string;
  yourCoupon: string;
}

const LANG_TEXTS: Record<string, LangTexts> = {
  uk: {
    welcome: "🎉 <b>Вітаю, {name}!</b> 🛍️\n\nЯ <b>BuyWise</b> - твій персональний помічник для пошуку найкращих товарів на AliExpress! 🌟\n\n🔍 <b>Шукай</b> - знайду найкраще\n🔥 <b>ТОП-10</b> - хіти продажів\n❤️ <b>Обране</b> - твої знахідки\n🎁 <b>Рефералка</b> - запрошуй друзів\n\n<i>Готовий до шопінгу?</i> 👇",
    welcomeBack: "👋 <b>З поверненням, {name}!</b> 🌟\n\nРадий бачити тебе знову! Що шукаємо сьогодні? 🛍️",
    chooseCountry: "🌍 <b>Оберіть вашу країну</b>\n\nЦе допоможе показувати правильні ціни та доставку:",
    chooseLang: "🌐 <b>Оберіть мову:</b>",
    ready: "🎊 <b>Чудово!</b> Тепер я готовий шукати найкращі пропозиції для тебе! 🛒\n\n<i>Напиши що шукаєш або натисни кнопку нижче</i> 👇",
    search: "🔍 <b>Пошук товарів</b>\n\n✨ Напишіть що шукаєте:\n• навушники bluetooth 🎧\n• чохол iPhone 15 📱\n• кросівки Nike 👟",
    profile: "👤 <b>Ваш профіль</b>\n\n🌍 Країна: <b>{country}</b>\n💰 Валюта: <b>{currency}</b>\n🌐 Мова: <b>{language}</b>\n👤 Ім'я: <b>{name}</b>\n🎁 Рефералів: <b>{referrals}</b>",
    support: "💬 <b>Підтримка</b>\n\n❓ Є питання чи пропозиції?\n🐛 Знайшли помилку?\n💡 Маєте ідею?\n\n👇 <b>Напишіть нашому адміну:</b>",
    langChanged: "✅ Мову змінено на Українську 🇺🇦",
    noFavorites: "❤️ У вас поки немає обраних товарів.\n\n<i>Додайте товари в обране натиснувши</i> ❤️ <i>під товаром.</i>",
    referral: "🎁 <b>Реферальна програма</b>\n\n📎 Твоє унікальне посилання:\n<code>{link}</code>\n\n👥 Запрошено друзів: <b>{count}</b>\n\n<i>Поділись посиланням з друзями!</i>",
    referralStats: "📊 <b>Твоя статистика</b>\n\n👥 Запрошено друзів: <b>{count}</b>\n🔗 Твій код: <code>{code}</code>",
    notifEnabled: "🔔 Сповіщення увімкнено",
    notifDisabled: "🔕 Сповіщення вимкнено",
    enableNotif: "🔔 Увімкнути ТОП-10",
    disableNotif: "🔕 Вимкнути ТОП-10",
    notifOn: "🔔 Щоденні сповіщення увімкнено!\n\nВи отримуватимете TOP-10 товарів о 10:00.",
    notifOff: "🔕 Щоденні сповіщення вимкнено.\n\nВи можете увімкнути їх знову в профілі.",
    changeCountry: "🌍 Змінити країну",
    changeLang: "🌐 Змінити мову",
    backMenu: "🔙 Меню",
    categories: "📂 <b>Оберіть категорію:</b>",
    catElectronics: "📱 Електроніка",
    catClothing: "👕 Одяг",
    catHome: "🏠 Дім і сад",
    catBeauty: "💄 Краса",
    catGadgets: "🔧 Гаджети",
    catGifts: "🎁 Подарунки",
    catUnder10: "💰 До $10",
    recentSearches: "🕐 <b>Останні пошуки:</b>",
    noSearchHistory: "📭 Історії пошуку поки немає",
    couponEarned: "🎉 <b>Вітаємо!</b> Ви отримали купон на знижку 5%!\n\n🎫 Код: <code>{code}</code>\n\n<i>Використовуйте при замовленні на AliExpress</i>",
    couponProgress: "👥 Запросіть ще <b>{remaining}</b> друзів для отримання купону на знижку!",
    yourCoupon: "🎫 Ваш купон: <code>{code}</code> (-5%)",
  },
};

function getTexts(lang: string = "uk"): LangTexts {
  return LANG_TEXTS[lang] || LANG_TEXTS.uk;
}

const LANG_NAMES: Record<string, string> = {
  uk: "Українська 🇺🇦", ru: "Русский 🇷🇺", en: "English 🇬🇧", de: "Deutsch 🇩🇪", pl: "Polski 🇵🇱",
  fr: "Français 🇫🇷", es: "Español 🇪🇸", it: "Italiano 🇮🇹", cs: "Čeština 🇨🇿", ro: "Română 🇷🇴"
};

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  Ukraine: "UAH", Germany: "EUR", Poland: "PLN", Czechia: "CZK",
  Romania: "RON", France: "EUR", Spain: "EUR", Italy: "EUR", UK: "GBP", USA: "USD"
};

const processMessageStep = createStep({
  id: "process-message",
  description: "Processes incoming Telegram message or callback",
  inputSchema: z.object({
    telegramId: z.string(),
    userName: z.string().optional(),
    message: z.string(),
    chatId: z.string(),
    languageCode: z.string().optional(),
    isCallback: z.boolean().optional(),
    callbackData: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const inputData = context.getStepResult<{ telegramId: string; userName?: string; message: string; chatId: string; languageCode?: string; isCallback?: boolean; callbackData?: string }>("process-message") || context.inputData as any;
    const userLang = inputData.languageCode?.slice(0, 2) || "uk";
    
    try {
      const [existingUser] = await db.select().from(users).where(eq(users.telegramId, inputData.telegramId)).limit(1);
      const lang = existingUser?.language || userLang;
      const texts = getTexts(lang);
      const message = inputData.message;

      if (message === "/start") {
        if (!existingUser) {
          return { response: texts.welcome.replace("{name}", inputData.userName || "Друже") + "\n\n" + texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode: lang };
        }
        return { response: texts.welcomeBack.replace("{name}", existingUser.firstName || inputData.userName || "Друже"), chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode: lang };
      }

      if (inputData.isCallback && inputData.callbackData) {
        const cbData = inputData.callbackData;
        const [type, value] = cbData.split(":");
        logger?.info("🔘 [Step 1] Callback detected:", { type, value, full: cbData });

        if (type === "country") {
          const currency = COUNTRY_TO_CURRENCY[value] || "USD";
          if (existingUser) {
            await db.update(users).set({ country: value, currency, updatedAt: new Date() }).where(eq(users.telegramId, inputData.telegramId));
          } else {
            const refCode = `BW${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            await db.insert(users).values({ telegramId: inputData.telegramId, firstName: inputData.userName, language: lang, country: value, currency, dailyTopEnabled: true, referralCode: refCode, createdAt: new Date() });
          }
          return { response: texts.ready, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode: lang };
        }

        if (type === "lang") {
          if (existingUser) {
            await db.update(users).set({ language: value, updatedAt: new Date() }).where(eq(users.telegramId, inputData.telegramId));
          }
          const newTexts = getTexts(value);
          return { response: newTexts.langChanged, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode: value };
        }

        if (type === "action") {
          switch (value) {
            case "menu":
              return { response: "📱 <b>Головне меню</b>\n\nОберіть дію:", chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode: lang };
            case "search":
              return { response: texts.search, chatId: inputData.chatId, success: true, keyboard: "back", telegramId: inputData.telegramId, languageCode: lang };
            case "top10":
              if (!existingUser) return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode: lang };
              const topResult = await getTopProductsTool.execute({ context: { country: existingUser.country, currency: existingUser.currency, category: "" }, mastra, runtimeContext: {} as any });
              if (topResult.success) {
                return { response: "🔥 <b>ТОП-10 товарів дня:</b>", chatId: inputData.chatId, success: true, keyboard: "none", products: topResult.products.slice(0, 5), hasMore: true, telegramId: inputData.telegramId, languageCode: lang };
              }
              return { response: "😔 Не вдалося отримати ТОП-10", chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode: lang };
            case "categories":
              return { response: texts.categories, chatId: inputData.chatId, success: true, keyboard: "categories", telegramId: inputData.telegramId, languageCode: lang };
            case "history":
              if (!existingUser) return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode: lang };
              const history = await db.select().from(searchHistory).where(eq(searchHistory.userId, existingUser.id)).orderBy(desc(searchHistory.createdAt)).limit(5);
              if (history.length === 0) return { response: texts.noSearchHistory, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode: lang };
              let histText = texts.recentSearches + "\n\n";
              history.forEach((h, i) => { histText += `${i+1}. ${h.query}\n`; });
              return { response: histText, chatId: inputData.chatId, success: true, keyboard: "history", telegramId: inputData.telegramId, languageCode: lang };
            case "favorites":
              if (!existingUser) return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode: lang };
              const userFavs = await db.select().from(favorites).where(eq(favorites.userId, existingUser.id));
              if (userFavs.length === 0) return { response: texts.noFavorites, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode: lang };
              const favProds = userFavs.map(f => ({ id: f.productId, title: f.productTitle, price: f.currentPrice || 0, originalPrice: f.currentPrice || 0, currency: f.currency, discount: 0, rating: 0, orders: 0, imageUrl: f.productImage || "", affiliateUrl: f.productUrl, freeShipping: false }));
              return { response: `❤️ <b>Обране (${favProds.length}):</b>`, chatId: inputData.chatId, success: true, keyboard: "main", products: favProds, telegramId: inputData.telegramId };
            case "profile":
              if (!existingUser) return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode: lang };
              const refCountResult = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(eq(referrals.referrerId, existingUser.id));
              const profileText = texts.profile.replace("{country}", existingUser.country || "-").replace("{currency}", existingUser.currency).replace("{language}", existingUser.language).replace("{name}", existingUser.firstName || inputData.userName || "-").replace("{referrals}", String(refCountResult[0]?.count || 0));
              return { response: profileText, chatId: inputData.chatId, success: true, keyboard: existingUser.dailyTopEnabled ? "profile_notif_on" : "profile_notif_off", telegramId: inputData.telegramId, languageCode: lang };
            case "referral":
              if (!existingUser) return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode: lang };
              const refLink = `https://t.me/BuyWiseBot?start=${existingUser.referralCode}`;
              const refCount2 = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(eq(referrals.referrerId, existingUser.id));
              return { response: texts.referral.replace("{link}", refLink).replace("{count}", String(refCount2[0].count)), chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode: lang };
            case "language":
              return { response: texts.chooseLang, chatId: inputData.chatId, success: true, keyboard: "language", telegramId: inputData.telegramId, languageCode: lang };
            case "support":
              return { response: texts.support, chatId: inputData.chatId, success: true, keyboard: "support", telegramId: inputData.telegramId, languageCode: lang };
          }
        }
      }

      if (message && message.length > 1 && !message.startsWith("/")) {
        if (!existingUser) return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode: lang };
        const result = await searchProductsTool.execute({ context: { query: message, country: existingUser.country, currency: existingUser.currency, quality: "default", maxPrice: 0, freeShipping: false, onlyDiscount: false, preferCheaper: false }, mastra, runtimeContext: {} as any });
        if (result.success && result.products.length > 0) {
          await db.insert(searchHistory).values({ userId: existingUser.id, query: message, createdAt: new Date() });
          return { response: `🔍 <b>Знайдено ${result.products.length} товарів:</b>`, chatId: inputData.chatId, success: true, keyboard: "none", products: result.products.slice(0, 5), hasMore: result.products.length > 5, telegramId: inputData.telegramId };
        }
        return { response: "😔 На жаль, нічого не знайдено.", chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId };
      }

      return { response: "👋 Що я можу для вас зробити? Оберіть дію в меню 👇", chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode: lang };
    } catch (e) {
      logger?.error("❌ [Step 1] Error:", e);
      return { response: "❌ Помилка. Спробуйте ще раз.", chatId: inputData.chatId, success: false, keyboard: "main", telegramId: inputData.telegramId };
    }
  }
});

const sendToTelegramStep = createStep({
  id: "send-to-telegram",
  description: "Sends the response to Telegram",
  inputSchema: z.any(),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const inputData = context.getStepResult<any>("process-message");
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || !inputData) return { success: false };

    try {
      let keyboard: any = null;
      if (inputData.keyboard === "main") keyboard = { inline_keyboard: MAIN_MENU_BUTTONS };
      if (inputData.keyboard === "country") keyboard = { inline_keyboard: COUNTRY_BUTTONS };
      if (inputData.keyboard === "language") keyboard = { inline_keyboard: LANGUAGE_BUTTONS };
      if (inputData.keyboard === "back") keyboard = { inline_keyboard: BACK_BUTTON };
      if (inputData.keyboard === "profile_notif_on") keyboard = { inline_keyboard: PROFILE_BUTTONS };
      
      if (inputData.products && inputData.products.length > 0) {
        for (const p of inputData.products) {
          const text = `<b>${p.title}</b>\n\n💰 Ціна: <b>${p.price} ${p.currency}</b>`;
          const kb = { inline_keyboard: [[{ text: "🔗 Купити", url: p.affiliateUrl }, { text: "❤️", callback_data: `like:${p.id}` }]] };
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: inputData.chatId, text, parse_mode: "HTML", reply_markup: kb }) });
        }
        if (inputData.hasMore) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: inputData.chatId, text: "👇 Ще більше товарів", reply_markup: { inline_keyboard: [[{ text: "➕ Ще", callback_data: "action:more" }]] } }) });
        }
      } else {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: inputData.chatId, text: inputData.response, parse_mode: "HTML", reply_markup: keyboard }) });
      }
      return { success: true };
    } catch (e) {
      logger?.error("❌ [Step 2] Error:", e);
      return { success: false };
    }
  }
});

export const telegramBotWorkflow = createWorkflow({ id: "telegram-bot-workflow" })
  .step(processMessageStep)
  .then(sendToTelegramStep)
  .commit();
