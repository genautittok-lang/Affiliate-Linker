import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { buyWiseAgent } from "../agents/buyWiseAgent";

const COUNTRY_BUTTONS = [
  [{ text: "🇺🇦 Україна", callback_data: "country:Ukraine" }, { text: "🇩🇪 Deutschland", callback_data: "country:Germany" }],
  [{ text: "🇵🇱 Polska", callback_data: "country:Poland" }, { text: "🇨🇿 Česko", callback_data: "country:Czechia" }],
  [{ text: "🇷🇴 România", callback_data: "country:Romania" }, { text: "🇫🇷 France", callback_data: "country:France" }],
  [{ text: "🇪🇸 España", callback_data: "country:Spain" }, { text: "🇮🇹 Italia", callback_data: "country:Italy" }],
  [{ text: "🇬🇧 UK", callback_data: "country:UK" }, { text: "🇺🇸 USA", callback_data: "country:USA" }],
];

const MAIN_MENU_BUTTONS = [
  [{ text: "🔍 Пошук товарів", callback_data: "action:search" }],
  [{ text: "🔥 ТОП-10 сьогодні", callback_data: "action:top10" }, { text: "💰 Краще до ціни", callback_data: "action:best_price" }],
  [{ text: "⚙️ Налаштування", callback_data: "action:settings" }, { text: "❓ Допомога", callback_data: "action:help" }],
];

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
    showCountryButtons: z.boolean(),
    showMainMenu: z.boolean(),
    isNewUser: z.boolean(),
  }),
  
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🚀 [Step 1] Processing message", {
      telegramId: inputData.telegramId,
      message: inputData.message?.substring(0, 50),
      isCallback: inputData.isCallback,
    });
    
    try {
      let messageToProcess = inputData.message;
      let showCountryButtons = false;
      let showMainMenu = false;
      let isNewUser = false;
      
      if (inputData.isCallback && inputData.callbackData) {
        const [type, value] = inputData.callbackData.split(":");
        if (type === "country") {
          messageToProcess = `Моя країна: ${value}`;
        } else if (type === "action") {
          switch (value) {
            case "search":
              return {
                response: "🔍 Напишіть що шукаєте, наприклад:\n• навушники bluetooth\n• чохол iPhone 15\n• кросівки Nike",
                chatId: inputData.chatId,
                success: true,
                showCountryButtons: false,
                showMainMenu: false,
                isNewUser: false,
              };
            case "top10":
              messageToProcess = "/top";
              break;
            case "best_price":
              return {
                response: "💰 Введіть максимальну ціну, наприклад:\n• до 500 грн\n• під 20 євро\n• best 30",
                chatId: inputData.chatId,
                success: true,
                showCountryButtons: false,
                showMainMenu: false,
                isNewUser: false,
              };
            case "settings":
              messageToProcess = "/settings";
              break;
            case "help":
              messageToProcess = "/help";
              break;
          }
        }
      }
      
      const contextPrompt = inputData.languageCode 
        ? `[User Telegram language: ${inputData.languageCode}]\n`
        : "";
      
      const fullPrompt = `${contextPrompt}[Telegram ID: ${inputData.telegramId}]\n\nUser message: ${messageToProcess}`;
      
      const response = await buyWiseAgent.generate(fullPrompt, {
        resourceId: "telegram-bot",
        threadId: `telegram_${inputData.telegramId}`,
        maxSteps: 5,
      });
      
      const responseText = response.text || "Вибачте, сталася помилка. Спробуйте ще раз.";
      
      if (responseText.includes("країни") || responseText.includes("country")) {
        showCountryButtons = true;
        isNewUser = true;
      }
      
      if (messageToProcess.includes("/start") && !isNewUser) {
        showMainMenu = true;
      }
      
      if (inputData.isCallback && inputData.callbackData?.startsWith("country:")) {
        showMainMenu = true;
      }
      
      logger?.info("✅ [Step 1] Response generated", { length: responseText.length });
      
      return {
        response: responseText,
        chatId: inputData.chatId,
        success: true,
        showCountryButtons,
        showMainMenu,
        isNewUser,
      };
    } catch (error) {
      logger?.error("❌ [Step 1] Error:", error);
      return {
        response: "Вибачте, сталася помилка. Спробуйте ще раз.",
        chatId: inputData.chatId,
        success: false,
        showCountryButtons: false,
        showMainMenu: false,
        isNewUser: false,
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
    showCountryButtons: z.boolean(),
    showMainMenu: z.boolean(),
    isNewUser: z.boolean(),
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
      showCountryButtons: inputData.showCountryButtons,
      showMainMenu: inputData.showMainMenu,
    });
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      return { sent: false, error: "Bot token not configured" };
    }
    
    try {
      let inlineKeyboard = null;
      
      if (inputData.showCountryButtons) {
        inlineKeyboard = COUNTRY_BUTTONS;
      } else if (inputData.showMainMenu) {
        inlineKeyboard = MAIN_MENU_BUTTONS;
      }
      
      const messageBody: any = {
        chat_id: inputData.chatId,
        text: inputData.response,
        parse_mode: "HTML",
      };
      
      if (inlineKeyboard) {
        messageBody.reply_markup = {
          inline_keyboard: inlineKeyboard,
        };
      }
      
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messageBody),
        }
      );
      
      const result = await response.json();
      
      if (result.ok) {
        logger?.info("✅ [Step 2] Sent successfully");
        return { sent: true, messageId: result.result?.message_id };
      } else {
        const plainBody = {
          chat_id: inputData.chatId,
          text: inputData.response.replace(/<[^>]*>/g, ""),
        };
        if (inlineKeyboard) {
          (plainBody as any).reply_markup = { inline_keyboard: inlineKeyboard };
        }
        
        const plainResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(plainBody),
          }
        );
        
        const plainResult = await plainResponse.json();
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
