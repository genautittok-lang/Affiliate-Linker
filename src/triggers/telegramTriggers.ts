import { registerApiRoute } from "../mastra/inngest";
import { Mastra } from "@mastra/core";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.warn("TELEGRAM_BOT_TOKEN not configured");
}

export type TriggerInfoTelegram = {
  type: "telegram/message" | "telegram/callback";
  params: {
    userName: string;
    message: string;
    telegramId: string;
    chatId: string;
    languageCode: string;
    isCallback: boolean;
    callbackData?: string;
    callbackQueryId?: string;
  };
  payload: any;
};

export function registerTelegramTrigger({
  triggerType,
  handler,
}: {
  triggerType: string;
  handler: (mastra: Mastra, triggerInfo: TriggerInfoTelegram) => Promise<void>;
}) {
  return [
    registerApiRoute("/webhooks/telegram/action", {
      method: "POST",
      handler: async (c) => {
        const mastra = c.get("mastra");
        const logger = mastra.getLogger();
        
        try {
          const payload = await c.req.json();
          logger?.info("📥 [Telegram] Webhook received", { payload: JSON.stringify(payload).substring(0, 200) });

          if (payload.callback_query) {
            const cb = payload.callback_query;
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            
            if (botToken && cb.id) {
              fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callback_query_id: cb.id }),
              }).catch(() => {});
            }
            
            await handler(mastra, {
              type: "telegram/callback",
              params: {
                userName: cb.from?.username || cb.from?.first_name || "",
                message: cb.data || "",
                telegramId: cb.from?.id?.toString() || "",
                chatId: cb.message?.chat?.id?.toString() || "",
                languageCode: cb.from?.language_code || "en",
                isCallback: true,
                callbackData: cb.data,
                callbackQueryId: cb.id,
              },
              payload,
            });
            
            return c.text("OK", 200);
          }

          if (payload.message) {
            const msg = payload.message;
            
            await handler(mastra, {
              type: "telegram/message",
              params: {
                userName: msg.from?.username || msg.from?.first_name || "",
                message: msg.text || "",
                telegramId: msg.from?.id?.toString() || "",
                chatId: msg.chat?.id?.toString() || "",
                languageCode: msg.from?.language_code || "en",
                isCallback: false,
              },
              payload,
            });
            
            return c.text("OK", 200);
          }

          logger?.warn("⚠️ [Telegram] Unknown payload type");
          return c.text("OK", 200);
          
        } catch (error) {
          logger?.error("❌ [Telegram] Error:", error);
          return c.text("OK", 200);
        }
      },
    }),
  ];
}
