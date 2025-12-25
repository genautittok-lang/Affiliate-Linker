import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { buyWiseAgent } from "../agents/buyWiseAgent";

const processWithAgentStep = createStep({
  id: "process-with-agent",
  description: "Processes the incoming Telegram message using the BuyWise agent to generate a response",
  
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram user ID"),
    userName: z.string().optional().describe("Telegram username"),
    message: z.string().describe("User's message text"),
    chatId: z.string().describe("Telegram chat ID for response"),
    languageCode: z.string().optional().describe("User's Telegram language code"),
  }),
  
  outputSchema: z.object({
    response: z.string(),
    chatId: z.string(),
    success: z.boolean(),
  }),
  
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🚀 [Step 1] Processing message with BuyWise agent", {
      telegramId: inputData.telegramId,
      message: inputData.message?.substring(0, 100),
    });
    
    try {
      const contextPrompt = inputData.languageCode 
        ? `[User Telegram language: ${inputData.languageCode}]\n`
        : "";
      
      const userInfoPrompt = inputData.userName 
        ? `[Username: ${inputData.userName}]\n`
        : "";
      
      const fullPrompt = `${contextPrompt}${userInfoPrompt}[Telegram ID: ${inputData.telegramId}]\n\nUser message: ${inputData.message}`;
      
      const response = await buyWiseAgent.generateLegacy(
        [{ role: "user", content: fullPrompt }],
        {
          resourceId: "telegram-bot",
          threadId: `telegram_${inputData.telegramId}`,
          maxSteps: 10,
        }
      );
      
      logger?.info("✅ [Step 1] Agent response generated", {
        responseLength: response.text?.length,
      });
      
      return {
        response: response.text || "Sorry, I could not process your request. Please try again.",
        chatId: inputData.chatId,
        success: true,
      };
    } catch (error) {
      logger?.error("❌ [Step 1] Agent error:", error);
      return {
        response: "Sorry, an error occurred. Please try again later.",
        chatId: inputData.chatId,
        success: false,
      };
    }
  },
});

const sendToTelegramStep = createStep({
  id: "send-to-telegram",
  description: "Sends the agent's response back to the Telegram user",
  
  inputSchema: z.object({
    response: z.string(),
    chatId: z.string(),
    success: z.boolean(),
  }),
  
  outputSchema: z.object({
    sent: z.boolean(),
    messageId: z.number().optional(),
    error: z.string().optional(),
  }),
  
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📤 [Step 2] Sending response to Telegram", {
      chatId: inputData.chatId,
      responseLength: inputData.response?.length,
    });
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      logger?.error("❌ [Step 2] TELEGRAM_BOT_TOKEN not configured");
      return {
        sent: false,
        error: "Bot token not configured",
      };
    }
    
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: inputData.chatId,
            text: inputData.response,
            parse_mode: "Markdown",
            disable_web_page_preview: false,
          }),
        }
      );
      
      const result = await response.json();
      
      if (result.ok) {
        logger?.info("✅ [Step 2] Message sent successfully", {
          messageId: result.result?.message_id,
        });
        return {
          sent: true,
          messageId: result.result?.message_id,
        };
      } else {
        if (result.description?.includes("can't parse entities")) {
          logger?.warn("⚠️ [Step 2] Markdown parsing failed, retrying without Markdown");
          
          const plainResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                chat_id: inputData.chatId,
                text: inputData.response.replace(/[*_`\[\]()]/g, ""),
              }),
            }
          );
          
          const plainResult = await plainResponse.json();
          
          if (plainResult.ok) {
            return {
              sent: true,
              messageId: plainResult.result?.message_id,
            };
          }
        }
        
        logger?.error("❌ [Step 2] Telegram API error:", result);
        return {
          sent: false,
          error: result.description || "Unknown Telegram error",
        };
      }
    } catch (error) {
      logger?.error("❌ [Step 2] Network error:", error);
      return {
        sent: false,
        error: error instanceof Error ? error.message : String(error),
      };
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
