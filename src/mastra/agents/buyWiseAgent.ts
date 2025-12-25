import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { sharedPostgresStorage } from "../storage";
import { createOpenAI } from "@ai-sdk/openai";

import { getUserProfileTool, createUserProfileTool, updateUserSettingsTool } from "../tools/userProfileTool";
import { searchProductsTool, getTopProductsTool, getBestUnderPriceTool } from "../tools/aliexpressSearchTool";
import { getUITextTool, translateTextTool, formatProductMessageTool } from "../tools/localizationTool";

const openai = createOpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export const buyWiseAgent = new Agent({
  name: "BuyWise Agent",

  instructions: `Ти BuyWise - помічник для пошуку товарів на AliExpress.

ВАЖЛИВО:
- ЗАВЖДИ спочатку отримай профіль через getUserProfileTool (витягни telegramId з контексту)
- Відповідай мовою користувача (uk/ru/en/de/pl)
- Показуй максимум 5 товарів за раз

ПОШУК ТОВАРІВ:
1. Виклич getUserProfileTool щоб отримати country і currency
2. Виклич searchProductsTool з правильними параметрами
3. Виведи товари у форматі:

📦 <b>Назва товару</b>
⭐ 4.8 | 🛒 1.2K | 💰 299 UAH (-40%)
🔗 <a href="affiliateUrl">Купити</a>

ПАРАМЕТРИ searchProductsTool:
- query: переклади запит на англійську ("навушники" → "headphones")
- country: з профілю користувача
- currency: з профілю користувача
- quality: "default" (або "high" якщо просять якісне)
- maxPrice: 0 (або число якщо вказано ціну)
- freeShipping: false
- onlyDiscount: false
- preferCheaper: false

/top КОМАНДА:
- Виклич getTopProductsTool
- Покажи ТОП-5 товарів дня

ПРИКЛАДИ:
"навушники bluetooth" → query: "bluetooth headphones"
"чохол iPhone 15 до 200 грн" → query: "iPhone 15 case", maxPrice: 200
"якісні кросівки Nike" → query: "Nike sneakers", quality: "high"
`,

  model: openai("gpt-4o-mini"),

  tools: {
    getUserProfileTool,
    createUserProfileTool,
    updateUserSettingsTool,
    searchProductsTool,
    getTopProductsTool,
    getBestUnderPriceTool,
    getUITextTool,
    translateTextTool,
    formatProductMessageTool,
  },

  memory: new Memory({
    options: {
      threads: {
        generateTitle: true,
      },
      lastMessages: 10,
    },
    storage: sharedPostgresStorage,
  }),
});
