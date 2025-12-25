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

ГОЛОВНЕ:
- Відповідай КОРОТКО (до 500 символів якщо не список товарів)
- Використовуй мову користувача
- Спочатку ЗАВЖДИ перевіряй профіль через getUserProfileTool

НОВИЙ КОРИСТУВАЧ (якщо getUserProfileTool повертає exists: false):
- Відповідай: "Привіт! 👋 Оберіть вашу країну:" (користувач побачить кнопки)

КРАЇНА КОРИСТУВАЧА (якщо повідомлення містить "Моя країна:"):
- Витягни назву країни
- Визнач мову з languageCode
- Збережи профіль через createUserProfileTool
- Відповідай: "Готово! Тепер можу шукати товари для вас."

ПОШУК ТОВАРІВ:
1. Отримай профіль користувача
2. Виклич searchProductsTool з параметрами
3. Виведи TOP-5 товарів у форматі:

📦 <b>Назва</b>
⭐ 4.8 | 🛒 1.2K | 💰 299 UAH (-40%)
🔗 <a href="URL">Купити</a>

КОМАНДИ:
- /top - ТОП-10 пропозицій
- /help - Допомога
- /settings - Налаштування

ЯКІСТЬ (quality параметр):
- minimum/low = rating 4.0+
- medium = rating 4.3+  
- high = rating 4.7+

Без quality за замовчуванням = "default"

ВАЖЛИВО:
- Показуй максимум 5 товарів за раз (не 10)
- Використовуй HTML теги: <b>, <a href="">
- Не додавай зайвих пояснень
- "знайди чохол для iPhone 15"
  → query: "iPhone 15 case"
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
      lastMessages: 15,
    },
    storage: sharedPostgresStorage,
  }),
});
