import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { buyWiseAgent } from "../agents/buyWiseAgent";
import { db } from "../../db";
import { users, favorites } from "../../db/schema";
import { eq, and } from "drizzle-orm";

const productCache = new Map<string, { title: string; url: string; img: string; price: number }>();

const COUNTRY_BUTTONS = [
  [{ text: "🇺🇦 Україна", callback_data: "country:Ukraine" }, { text: "🇩🇪 Deutschland", callback_data: "country:Germany" }],
  [{ text: "🇵🇱 Polska", callback_data: "country:Poland" }, { text: "🇨🇿 Česko", callback_data: "country:Czechia" }],
  [{ text: "🇷🇴 România", callback_data: "country:Romania" }, { text: "🇫🇷 France", callback_data: "country:France" }],
  [{ text: "🇪🇸 España", callback_data: "country:Spain" }, { text: "🇮🇹 Italia", callback_data: "country:Italy" }],
  [{ text: "🇬🇧 UK", callback_data: "country:UK" }, { text: "🇺🇸 USA", callback_data: "country:USA" }],
];

const MAIN_MENU_BUTTONS = [
  [{ text: "🔍 Пошук", callback_data: "action:search" }, { text: "🔥 ТОП-10", callback_data: "action:top10" }],
  [{ text: "💰 До ціни", callback_data: "action:best_price" }, { text: "⚙️ Налаштування", callback_data: "action:settings" }],
];

const SETTINGS_BUTTONS = [
  [{ text: "🌍 Змінити країну", callback_data: "settings:country" }],
  [{ text: "🔙 Назад", callback_data: "action:menu" }],
];

const LANG_GREETINGS: Record<string, { welcome: string; chooseCountry: string; ready: string; search: string; price: string; help: string; settings: string }> = {
  uk: {
    welcome: "Вітаю! 👋 Я BuyWise - допоможу знайти найкращі товари на AliExpress.",
    chooseCountry: "Оберіть вашу країну для доставки:",
    ready: "Готово! ✅ Тепер можу шукати товари для вас.",
    search: "🔍 Напишіть що шукаєте:\n• навушники bluetooth\n• чохол iPhone 15\n• кросівки Nike",
    price: "💰 Напишіть максимальну ціну:\n• до 500 грн\n• під 20 євро",
    help: "📖 <b>Як користуватися:</b>\n\n🔍 <b>Пошук</b> - напишіть назву товару\n🔥 <b>ТОП-10</b> - найкращі пропозиції дня\n💰 <b>До ціни</b> - товари до вказаної суми\n⚙️ <b>Налаштування</b> - змінити країну\n\n<i>Приклад:</i> бездротові навушники",
    settings: "⚙️ <b>Налаштування</b>\n\nВаша країна: {country}\nВалюта: {currency}",
  },
  ru: {
    welcome: "Привет! 👋 Я BuyWise - помогу найти лучшие товары на AliExpress.",
    chooseCountry: "Выберите вашу страну для доставки:",
    ready: "Готово! ✅ Теперь могу искать товары для вас.",
    search: "🔍 Напишите что ищете:\n• наушники bluetooth\n• чехол iPhone 15\n• кроссовки Nike",
    price: "💰 Напишите максимальную цену:\n• до 500 грн\n• до 20 евро",
    help: "📖 <b>Как пользоваться:</b>\n\n🔍 <b>Поиск</b> - напишите название товара\n🔥 <b>ТОП-10</b> - лучшие предложения дня\n💰 <b>До цены</b> - товары до указанной суммы\n⚙️ <b>Настройки</b> - сменить страну",
    settings: "⚙️ <b>Настройки</b>\n\nВаша страна: {country}\nВалюта: {currency}",
  },
  en: {
    welcome: "Hello! 👋 I'm BuyWise - I'll help you find the best deals on AliExpress.",
    chooseCountry: "Choose your country for shipping:",
    ready: "Done! ✅ Now I can search products for you.",
    search: "🔍 Tell me what you're looking for:\n• bluetooth headphones\n• iPhone 15 case\n• Nike sneakers",
    price: "💰 Enter maximum price:\n• under 50 EUR\n• max 30 USD",
    help: "📖 <b>How to use:</b>\n\n🔍 <b>Search</b> - type product name\n🔥 <b>TOP-10</b> - best deals today\n💰 <b>Under price</b> - products under budget\n⚙️ <b>Settings</b> - change country",
    settings: "⚙️ <b>Settings</b>\n\nYour country: {country}\nCurrency: {currency}",
  },
  de: {
    welcome: "Hallo! 👋 Ich bin BuyWise - ich helfe dir die besten Angebote auf AliExpress zu finden.",
    chooseCountry: "Wählen Sie Ihr Land für den Versand:",
    ready: "Fertig! ✅ Jetzt kann ich Produkte für Sie suchen.",
    search: "🔍 Schreiben Sie was Sie suchen:\n• Bluetooth Kopfhörer\n• iPhone 15 Hülle\n• Nike Schuhe",
    price: "💰 Maximaler Preis eingeben:\n• bis 50 EUR\n• max 30 USD",
    help: "📖 <b>Anleitung:</b>\n\n🔍 <b>Suche</b> - Produktname eingeben\n🔥 <b>TOP-10</b> - beste Angebote\n💰 <b>Bis Preis</b> - Produkte bis Budget\n⚙️ <b>Einstellungen</b> - Land ändern",
    settings: "⚙️ <b>Einstellungen</b>\n\nIhr Land: {country}\nWährung: {currency}",
  },
  pl: {
    welcome: "Cześć! 👋 Jestem BuyWise - pomogę znaleźć najlepsze oferty na AliExpress.",
    chooseCountry: "Wybierz swój kraj dostawy:",
    ready: "Gotowe! ✅ Teraz mogę szukać produktów dla Ciebie.",
    search: "🔍 Napisz czego szukasz:\n• słuchawki bluetooth\n• etui iPhone 15\n• buty Nike",
    price: "💰 Podaj maksymalną cenę:\n• do 100 PLN\n• max 20 EUR",
    help: "📖 <b>Jak korzystać:</b>\n\n🔍 <b>Szukaj</b> - wpisz nazwę produktu\n🔥 <b>TOP-10</b> - najlepsze oferty\n💰 <b>Do ceny</b> - produkty w budżecie\n⚙️ <b>Ustawienia</b> - zmień kraj",
    settings: "⚙️ <b>Ustawienia</b>\n\nTwój kraj: {country}\nWaluta: {currency}",
  },
};

function getLang(code: string): typeof LANG_GREETINGS.uk {
  const lang = code?.toLowerCase().slice(0, 2) || "en";
  return LANG_GREETINGS[lang] || LANG_GREETINGS.en;
}

const processWithAgentStep = createStep({
  id: "process-with-agent",
  description: "Processes the incoming Telegram message using the BuyWise agent",
  
  inputSchema: z.object({
    telegramId: z.string(),
    userName: z.string().optional(),
    message: z.string(),
    chatId: z.string(),
    languageCode: z.string().optional(),
    isCallback: z.boolean().optional(),
    callbackData: z.string().optional(),
  }),
  
  outputSchema: z.object({
    response: z.string(),
    chatId: z.string(),
    success: z.boolean(),
    keyboard: z.string(),
    products: z.array(z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
      originalPrice: z.number(),
      currency: z.string(),
      discount: z.number(),
      rating: z.number(),
      orders: z.number(),
      imageUrl: z.string(),
      affiliateUrl: z.string(),
      freeShipping: z.boolean(),
    })).optional(),
    telegramId: z.string().optional(),
  }),
  
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🚀 [Step 1] Processing", {
      telegramId: inputData.telegramId,
      message: inputData.message?.substring(0, 30),
      isCallback: inputData.isCallback,
    });
    
    const texts = getLang(inputData.languageCode || "uk");
    
    try {
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, inputData.telegramId));
      
      if (inputData.isCallback && inputData.callbackData) {
        const [type, value] = inputData.callbackData.split(":");
        
        if (type === "country") {
          const COUNTRY_CURRENCY: Record<string, string> = {
            Ukraine: "UAH", Germany: "EUR", Poland: "PLN", Czechia: "CZK",
            Romania: "RON", France: "EUR", Spain: "EUR", Italy: "EUR", UK: "GBP", USA: "USD",
          };
          const currency = COUNTRY_CURRENCY[value] || "USD";
          const lang = inputData.languageCode?.slice(0, 2) || "en";
          
          if (existingUser) {
            await db.update(users).set({ 
              country: value, 
              currency, 
              updatedAt: new Date() 
            }).where(eq(users.telegramId, inputData.telegramId));
          } else {
            await db.insert(users).values({
              telegramId: inputData.telegramId,
              userName: inputData.userName || null,
              language: lang,
              country: value,
              currency,
              dailyTopEnabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          
          logger?.info("✅ [Step 1] Country saved:", value);
          return {
            response: texts.ready,
            chatId: inputData.chatId,
            success: true,
            keyboard: "main",
            telegramId: inputData.telegramId,
          };
        }
        
        if (type === "action") {
          switch (value) {
            case "search":
              return { response: texts.search, chatId: inputData.chatId, success: true, keyboard: "none", telegramId: inputData.telegramId };
            case "best_price":
              return { response: texts.price, chatId: inputData.chatId, success: true, keyboard: "none", telegramId: inputData.telegramId };
            case "menu":
              return { response: "📱 Головне меню:", chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId };
            case "help":
              return { response: texts.help, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId };
            case "settings":
              if (existingUser) {
                const settingsText = texts.settings
                  .replace("{country}", existingUser.country)
                  .replace("{currency}", existingUser.currency);
                return { response: settingsText, chatId: inputData.chatId, success: true, keyboard: "settings", telegramId: inputData.telegramId };
              }
              return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId };
            case "top10":
              break;
          }
        }
        
        if (type === "settings" && value === "country") {
          return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId };
        }
        
        if (type === "like") {
          if (!existingUser) {
            return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId };
          }
          
          const [existingFav] = await db
            .select()
            .from(favorites)
            .where(and(
              eq(favorites.userId, existingUser.id),
              eq(favorites.productId, value)
            ));
          
          if (existingFav) {
            await db.delete(favorites).where(eq(favorites.id, existingFav.id));
            logger?.info("✅ Removed from favorites:", value);
            return { response: "❌ Видалено з обраного", chatId: inputData.chatId, success: true, keyboard: "none", telegramId: inputData.telegramId };
          } else {
            const productInfo = productCache.get(value);
            await db.insert(favorites).values({
              userId: existingUser.id,
              productId: value,
              productTitle: productInfo?.title || "Product",
              productUrl: productInfo?.url || "",
              productImage: productInfo?.img || null,
              currentPrice: productInfo?.price || 0,
              currency: existingUser.currency,
              createdAt: new Date(),
            });
            logger?.info("✅ Added to favorites:", value);
            return { response: "❤️ Додано до обраного!", chatId: inputData.chatId, success: true, keyboard: "none", telegramId: inputData.telegramId };
          }
        }
      }
      
      const message = inputData.message || "";
      
      if (message === "/start") {
        if (!existingUser) {
          return {
            response: `${texts.welcome}\n\n${texts.chooseCountry}`,
            chatId: inputData.chatId,
            success: true,
            keyboard: "country",
            telegramId: inputData.telegramId,
          };
        }
        return {
          response: `${texts.welcome}\n\n📱 Оберіть дію:`,
          chatId: inputData.chatId,
          success: true,
          keyboard: "main",
          telegramId: inputData.telegramId,
        };
      }
      
      if (message === "/help") {
        return { response: texts.help, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId };
      }
      
      if (message === "/settings") {
        if (existingUser) {
          const settingsText = texts.settings
            .replace("{country}", existingUser.country)
            .replace("{currency}", existingUser.currency);
          return { response: settingsText, chatId: inputData.chatId, success: true, keyboard: "settings", telegramId: inputData.telegramId };
        }
        return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId };
      }
      
      if (message === "/favorites" || message === "/fav") {
        if (!existingUser) {
          return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId };
        }
        const userFavorites = await db
          .select()
          .from(favorites)
          .where(eq(favorites.userId, existingUser.id));
        
        if (userFavorites.length === 0) {
          return { response: "❤️ У вас поки немає обраних товарів", chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId };
        }
        
        const favProducts = userFavorites.map(f => ({
          id: f.productId,
          title: f.productTitle,
          price: f.currentPrice || 0,
          originalPrice: f.currentPrice || 0,
          currency: f.currency,
          discount: 0,
          rating: 0,
          orders: 0,
          imageUrl: f.productImage || "",
          affiliateUrl: f.productUrl,
          freeShipping: false,
        }));
        
        return {
          response: `❤️ <b>Ваші обрані товари (${favProducts.length}):</b>`,
          chatId: inputData.chatId,
          success: true,
          keyboard: "main",
          products: favProducts,
          telegramId: inputData.telegramId,
        };
      }
      
      if (!existingUser) {
        return {
          response: texts.chooseCountry,
          chatId: inputData.chatId,
          success: true,
          keyboard: "country",
          telegramId: inputData.telegramId,
        };
      }
      
      let messageToProcess = message;
      if (inputData.isCallback && inputData.callbackData === "action:top10") {
        messageToProcess = "/top";
      }
      
      const fullPrompt = `[Telegram ID: ${inputData.telegramId}]\n[Language: ${inputData.languageCode || "uk"}]\n\nUser: ${messageToProcess}`;
      
      const response = await buyWiseAgent.generateLegacy(fullPrompt, {
        resourceId: "telegram-bot",
        threadId: `telegram_${inputData.telegramId}`,
        maxSteps: 5,
      });
      
      const responseText = response.text || "Вибачте, сталася помилка. Спробуйте ще раз.";
      logger?.info("✅ [Step 1] Response generated", { length: responseText.length });
      
      let products: any[] = [];
      if (response.toolResults) {
        for (const result of response.toolResults) {
          if (result && typeof result === "object" && "result" in result) {
            const toolResult = result.result as any;
            if (toolResult && toolResult.products && Array.isArray(toolResult.products)) {
              products = toolResult.products.slice(0, 5);
              break;
            }
          }
        }
      }
      
      logger?.info("✅ [Step 1] Products extracted", { count: products.length });
      
      return {
        response: products.length > 0 ? `🔍 <b>Знайдено ${products.length} товарів:</b>` : responseText,
        chatId: inputData.chatId,
        success: true,
        keyboard: products.length > 0 ? "none" : "main",
        products: products.length > 0 ? products : undefined,
        telegramId: inputData.telegramId,
      };
    } catch (error) {
      logger?.error("❌ [Step 1] Error:", error);
      return {
        response: "Вибачте, сталася помилка. Спробуйте ще раз.",
        chatId: inputData.chatId,
        success: false,
        keyboard: "none",
        telegramId: inputData.telegramId,
      };
    }
  },
});

const sendToTelegramStep = createStep({
  id: "send-to-telegram",
  description: "Sends the response with inline buttons to Telegram",
  
  inputSchema: z.object({
    response: z.string(),
    chatId: z.string(),
    success: z.boolean(),
    keyboard: z.string(),
    products: z.array(z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
      originalPrice: z.number(),
      currency: z.string(),
      discount: z.number(),
      rating: z.number(),
      orders: z.number(),
      imageUrl: z.string(),
      affiliateUrl: z.string(),
      freeShipping: z.boolean(),
    })).optional(),
    telegramId: z.string().optional(),
  }),
  
  outputSchema: z.object({
    sent: z.boolean(),
    messageId: z.number().optional(),
    error: z.string().optional(),
  }),
  
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📤 [Step 2] Sending to Telegram", { 
      chatId: inputData.chatId, 
      keyboard: inputData.keyboard,
      productsCount: inputData.products?.length || 0,
    });
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return { sent: false, error: "Bot token not configured" };
    }
    
    const sendMessage = async (text: string, keyboard?: any) => {
      const body: any = {
        chat_id: inputData.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      };
      if (keyboard) {
        body.reply_markup = { inline_keyboard: keyboard };
      }
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    };
    
    const sendPhoto = async (photoUrl: string, caption: string, keyboard: any) => {
      const body = {
        chat_id: inputData.chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard },
      };
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    };
    
    try {
      let inlineKeyboard = null;
      switch (inputData.keyboard) {
        case "country": inlineKeyboard = COUNTRY_BUTTONS; break;
        case "main": inlineKeyboard = MAIN_MENU_BUTTONS; break;
        case "settings": inlineKeyboard = SETTINGS_BUTTONS; break;
      }
      
      if (inputData.products && inputData.products.length > 0) {
        await sendMessage(inputData.response);
        
        for (const product of inputData.products) {
          const discount = product.discount > 0 ? ` <s>${product.originalPrice}</s> -${product.discount}%` : "";
          const shipping = product.freeShipping ? "🚚 Free" : "";
          const rating = product.rating > 0 ? `⭐ ${product.rating.toFixed(1)}` : "";
          const orders = product.orders > 0 ? `🛒 ${product.orders >= 1000 ? (product.orders / 1000).toFixed(1) + "K" : product.orders}` : "";
          
          const caption = `📦 <b>${product.title.slice(0, 100)}</b>\n\n💰 <b>${product.price} ${product.currency}</b>${discount}\n${[rating, orders, shipping].filter(Boolean).join(" | ")}`;
          
          productCache.set(product.id, {
            title: product.title.slice(0, 100),
            url: product.affiliateUrl,
            img: product.imageUrl,
            price: product.price,
          });
          
          const productButtons = [
            [
              { text: "🛒 Купити", url: product.affiliateUrl },
              { text: "❤️", callback_data: `like:${product.id.slice(0, 50)}` },
            ],
          ];
          
          if (product.imageUrl && !product.imageUrl.includes("placeholder")) {
            const photoResult = await sendPhoto(product.imageUrl, caption, productButtons);
            if (!photoResult.ok) {
              logger?.warn("⚠️ Photo failed, sending text", { error: photoResult.description });
              await sendMessage(caption, productButtons);
            }
          } else {
            await sendMessage(caption, productButtons);
          }
          
          await new Promise(r => setTimeout(r, 100));
        }
        
        await sendMessage("📱 Головне меню:", MAIN_MENU_BUTTONS);
        logger?.info("✅ [Step 2] Products sent");
        return { sent: true };
      }
      
      const result = await sendMessage(inputData.response, inlineKeyboard);
      
      if (result.ok) {
        logger?.info("✅ [Step 2] Sent successfully");
        return { sent: true, messageId: result.result?.message_id };
      } else {
        const plainResult = await sendMessage(inputData.response.replace(/<[^>]*>/g, ""), inlineKeyboard);
        if (plainResult.ok) {
          return { sent: true, messageId: plainResult.result?.message_id };
        }
        logger?.error("❌ [Step 2] Telegram error:", result);
        return { sent: false, error: result.description };
      }
    } catch (error) {
      logger?.error("❌ [Step 2] Error:", error);
      return { sent: false, error: String(error) };
    }
  },
});

export const telegramBotWorkflow = createWorkflow({
  id: "telegram-bot-workflow",
  
  inputSchema: z.object({
    telegramId: z.string(),
    userName: z.string().optional(),
    message: z.string(),
    chatId: z.string(),
    languageCode: z.string().optional(),
    isCallback: z.boolean().optional(),
    callbackData: z.string().optional(),
  }) as any,
  
  outputSchema: z.object({
    sent: z.boolean(),
    messageId: z.number().optional(),
    error: z.string().optional(),
  }),
})
  .then(processWithAgentStep as any)
  .then(sendToTelegramStep as any)
  .commit();
