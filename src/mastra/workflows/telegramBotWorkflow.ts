import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { db } from "../../db";
import { users, searchHistory } from "../../db/schema";
import { eq } from "drizzle-orm";
import { searchProductsTool, getTopProductsTool } from "../tools/aliexpressSearchTool";

const COUNTRY_BUTTONS = [
  [{ text: "🇺🇦 Україна", callback_data: "country:Ukraine" }, { text: "🇩🇪 Deutschland", callback_data: "country:Germany" }],
  [{ text: "🇵🇱 Polska", callback_data: "country:Poland" }, { text: "🇨🇿 Česko", callback_data: "country:Czechia" }],
  [{ text: "🇷🇴 România", callback_data: "country:Romania" }, { text: "🇫🇷 France", callback_data: "country:France" }],
  [{ text: "🇪🇸 España", callback_data: "country:Spain" }, { text: "🇮🇹 Italia", callback_data: "country:Italy" }],
  [{ text: "🇬🇧 UK", callback_data: "country:UK" }, { text: "🇺🇸 USA", callback_data: "country:USA" }],
];

const MAIN_MENU_BUTTONS = [
  [{ text: "🔍 Пошук", callback_data: "action:search" }, { text: "🔥 ТОП-10", callback_data: "action:top10" }],
  [{ text: "📂 Категорії", callback_data: "action:categories" }, { text: "❤️ Обране", callback_data: "action:favorites" }],
  [{ text: "👤 Профіль", callback_data: "action:profile" }, { text: "💬 Підтримка", callback_data: "action:support" }],
];

const BACK_BUTTON = [[{ text: "🔙 Меню", callback_data: "action:menu" }]];

const processMessageStep = createStep({
  id: "process-message",
  execute: async ({ context, mastra }: any) => {
    // Correct way to access input data in Mastra Inngest steps
    const inputData = context?.inputData;
    
    if (!inputData) {
      console.error("❌ [processMessageStep] No inputData in context");
      return { response: "Помилка отримання даних.", chatId: "unknown", keyboard: "main" };
    }

    const { message, chatId, telegramId, isCallback, callbackData } = inputData;

    try {
      const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);

      if (message === "/start") {
        if (!user) return { response: "Вітаю! Оберіть країну:", chatId, keyboard: "country" };
        return { response: "З поверненням!", chatId, keyboard: "main" };
      }

      if (isCallback && callbackData) {
        const [type, value] = callbackData.split(":");
        if (type === "country") {
          if (user) await db.update(users).set({ country: value }).where(eq(users.telegramId, telegramId));
          else await db.insert(users).values({ telegramId, country: value, currency: "USD", language: "uk", referralCode: "BW" + Math.random().toString(36).substr(2,5).toUpperCase() });
          return { response: "Готово! Можна шукати товари.", chatId, keyboard: "main" };
        }
        if (value === "menu" || callbackData === "action:menu") return { response: "Головне меню:", chatId, keyboard: "main" };
        if (value === "top10" || callbackData === "action:top10") {
          const res = await getTopProductsTool.execute({ context: { country: user?.country || "Ukraine", currency: user?.currency || "UAH", category: "" }, mastra, runtimeContext: {} as any });
          return { response: "🔥 ТОП-10:", chatId, products: res.success ? res.products.slice(0, 5) : [] };
        }
        if (value === "search" || callbackData === "action:search") return { response: "Що ви шукаєте?", chatId, keyboard: "back" };
      }

      if (message && message.length > 1 && !message.startsWith("/")) {
        const res = await searchProductsTool.execute({ context: { query: message, country: user?.country || "Ukraine", currency: user?.currency || "UAH", quality: "default", maxPrice: 0, freeShipping: false, onlyDiscount: false, preferCheaper: false }, mastra, runtimeContext: {} as any });
        if (user) await db.insert(searchHistory).values({ userId: user.id, query: message, createdAt: new Date() });
        return { response: `🔍 Результати для "${message}":`, chatId, products: res.success ? res.products.slice(0, 5) : [] };
      }

      return { response: "Оберіть дію:", chatId, keyboard: "main" };
    } catch (e) { 
      console.error("❌ [processMessageStep] Error:", e);
      return { response: "Помилка", chatId, keyboard: "main" }; 
    }
  }
});

const sendToTelegramStep = createStep({
  id: "send-to-telegram",
  execute: async ({ context }: any) => {
    // In Mastra Inngest, step results are accessed via getStepResult
    const inputData = context.getStepResult("process-message");
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || !inputData || inputData.chatId === "unknown") return;

    try {
      let kb: any = null;
      if (inputData.keyboard === "main") kb = { inline_keyboard: MAIN_MENU_BUTTONS };
      if (inputData.keyboard === "country") kb = { inline_keyboard: COUNTRY_BUTTONS };
      if (inputData.keyboard === "back") kb = { inline_keyboard: BACK_BUTTON };

      if (inputData.products && inputData.products.length > 0) {
        for (const p of inputData.products) {
          const text = `<b>${p.title}</b>\n💰 Ціна: <b>${p.price} ${p.currency}</b>`;
          const mk = { inline_keyboard: [[{ text: "🔗 Купити", url: p.affiliateUrl }]] };
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: inputData.chatId, text, parse_mode: "HTML", reply_markup: mk }) });
        }
      } else {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: inputData.chatId, text: inputData.response, parse_mode: "HTML", reply_markup: kb }) });
      }
    } catch (e) { console.error("❌ [sendToTelegramStep] Error:", e); }
  }
});

export const telegramBotWorkflow = createWorkflow({ 
  id: "telegram-bot-workflow",
})
  .then(processMessageStep)
  .then(sendToTelegramStep)
  .commit();
