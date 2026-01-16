import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../db";
import { users, broadcasts } from "../../db/schema";
import { eq, sql } from "drizzle-orm";

const ADMIN_IDS = ["8210587392"];
const ADMIN_USERNAME = "@bogdan_OP24";

export const isAdmin = (telegramId: string): boolean => {
  return ADMIN_IDS.includes(telegramId);
};

export const checkAdminTool = createTool({
  id: "check-admin",
  description: "Checks if a user is an admin. Used for admin panel access.",
  inputSchema: z.object({
    telegramId: z.string().describe("User's Telegram ID"),
  }),
  outputSchema: z.object({
    isAdmin: z.boolean(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔐 [CheckAdmin] Checking admin status", { telegramId: context.telegramId });
    return { isAdmin: isAdmin(context.telegramId) };
  },
});

export const getUserStatsTool = createTool({
  id: "get-user-stats",
  description: "Gets overall user statistics for admin panel.",
  inputSchema: z.object({
    telegramId: z.string().describe("Admin's Telegram ID"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    totalUsers: z.number().optional(),
    usersByCountry: z.record(z.number()).optional(),
    usersByLanguage: z.record(z.number()).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📊 [UserStats] Getting user statistics");
    
    if (!isAdmin(context.telegramId)) {
      return { success: false, error: "Access denied" };
    }
    
    try {
      const totalResult = await db.select({ count: sql<number>`count(*)` }).from(users);
      const totalUsers = Number(totalResult[0]?.count || 0);
      
      const countryStats = await db.select({
        country: users.country,
        count: sql<number>`count(*)`,
      }).from(users).groupBy(users.country);
      
      const languageStats = await db.select({
        language: users.language,
        count: sql<number>`count(*)`,
      }).from(users).groupBy(users.language);
      
      const usersByCountry: Record<string, number> = {};
      countryStats.forEach(s => {
        if (s.country) usersByCountry[s.country] = Number(s.count);
      });
      
      const usersByLanguage: Record<string, number> = {};
      languageStats.forEach(s => {
        if (s.language) usersByLanguage[s.language] = Number(s.count);
      });
      
      logger?.info("✅ [UserStats] Stats retrieved", { totalUsers });
      
      return {
        success: true,
        totalUsers,
        usersByCountry,
        usersByLanguage,
      };
    } catch (error: any) {
      logger?.error("❌ [UserStats] Error", { error: error.message });
      return { success: false, error: error.message };
    }
  },
});

export const getAllUsersForBroadcastTool = createTool({
  id: "get-users-for-broadcast",
  description: "Gets all users matching criteria for broadcast.",
  inputSchema: z.object({
    adminTelegramId: z.string().describe("Admin's Telegram ID"),
    country: z.string().optional().describe("Filter by country"),
    language: z.string().optional().describe("Filter by language"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    users: z.array(z.object({
      telegramId: z.string(),
      country: z.string(),
      language: z.string(),
      currency: z.string(),
    })).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📋 [GetUsersForBroadcast] Getting users for broadcast", context);
    
    if (!isAdmin(context.adminTelegramId)) {
      return { success: false, error: "Access denied" };
    }
    
    try {
      let query = db.select({
        telegramId: users.telegramId,
        country: users.country,
        language: users.language,
        currency: users.currency,
      }).from(users).where(eq(users.dailyTopEnabled, true));
      
      const allUsers = await query;
      
      let filteredUsers = allUsers.filter(u => u.country && u.country.length > 0);
      
      if (context.country) {
        filteredUsers = filteredUsers.filter(u => u.country === context.country);
      }
      if (context.language) {
        filteredUsers = filteredUsers.filter(u => u.language === context.language);
      }
      
      logger?.info("✅ [GetUsersForBroadcast] Found users", { count: filteredUsers.length });
      
      return {
        success: true,
        users: filteredUsers,
      };
    } catch (error: any) {
      logger?.error("❌ [GetUsersForBroadcast] Error", { error: error.message });
      return { success: false, error: error.message };
    }
  },
});

export const saveBroadcastLogTool = createTool({
  id: "save-broadcast-log",
  description: "Saves a broadcast log entry.",
  inputSchema: z.object({
    adminId: z.string().describe("Admin's Telegram ID"),
    message: z.string().optional().describe("Broadcast message"),
    targetCountry: z.string().optional().describe("Target country"),
    targetLanguage: z.string().optional().describe("Target language"),
    sentCount: z.number().describe("Number of messages sent"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    broadcastId: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("💾 [SaveBroadcast] Saving broadcast log", context);
    
    try {
      const result = await db.insert(broadcasts).values({
        adminId: context.adminId,
        message: context.message,
        targetCountry: context.targetCountry,
        targetLanguage: context.targetLanguage,
        sentCount: context.sentCount,
        sentAt: new Date(),
      }).returning({ id: broadcasts.id });
      
      logger?.info("✅ [SaveBroadcast] Broadcast logged", { id: result[0]?.id });
      
      return {
        success: true,
        broadcastId: result[0]?.id,
      };
    } catch (error: any) {
      logger?.error("❌ [SaveBroadcast] Error", { error: error.message });
      return { success: false, error: error.message };
    }
  },
});

export const getSupportInfoTool = createTool({
  id: "get-support-info",
  description: "Gets support contact information with pre-filled message template in user's language.",
  inputSchema: z.object({
    language: z.string().describe("User's language code"),
    userName: z.string().optional().describe("User's name"),
  }),
  outputSchema: z.object({
    adminUsername: z.string(),
    messageTemplate: z.string(),
    supportUrl: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📞 [Support] Getting support info", { language: context.language });
    
    const templates: Record<string, string> = {
      uk: `Добрий день! Мене звати ${context.userName || "користувач"}.\n\nХочу повідомити про:\n- [ ] Проблему з ботом\n- [ ] Пропозицію щодо покращення\n- [ ] Питання про функціонал\n\nОпис:`,
      ru: `Добрый день! Меня зовут ${context.userName || "пользователь"}.\n\nХочу сообщить о:\n- [ ] Проблеме с ботом\n- [ ] Предложении по улучшению\n- [ ] Вопросе о функционале\n\nОписание:`,
      en: `Hello! My name is ${context.userName || "user"}.\n\nI would like to report:\n- [ ] A problem with the bot\n- [ ] A suggestion for improvement\n- [ ] A question about functionality\n\nDescription:`,
      de: `Guten Tag! Mein Name ist ${context.userName || "Benutzer"}.\n\nIch möchte berichten über:\n- [ ] Ein Problem mit dem Bot\n- [ ] Einen Verbesserungsvorschlag\n- [ ] Eine Frage zur Funktionalität\n\nBeschreibung:`,
      pl: `Dzień dobry! Nazywam się ${context.userName || "użytkownik"}.\n\nChcę zgłosić:\n- [ ] Problem z botem\n- [ ] Sugestię ulepszenia\n- [ ] Pytanie o funkcjonalność\n\nOpis:`,
      fr: `Bonjour! Je m'appelle ${context.userName || "utilisateur"}.\n\nJe voudrais signaler:\n- [ ] Un problème avec le bot\n- [ ] Une suggestion d'amélioration\n- [ ] Une question sur les fonctionnalités\n\nDescription:`,
      es: `¡Hola! Me llamo ${context.userName || "usuario"}.\n\nQuiero reportar:\n- [ ] Un problema con el bot\n- [ ] Una sugerencia de mejora\n- [ ] Una pregunta sobre funcionalidad\n\nDescripción:`,
      it: `Buongiorno! Mi chiamo ${context.userName || "utente"}.\n\nVorrei segnalare:\n- [ ] Un problema con il bot\n- [ ] Un suggerimento per miglioramento\n- [ ] Una domanda sulla funzionalità\n\nDescrizione:`,
      cs: `Dobrý den! Jmenuji se ${context.userName || "uživatel"}.\n\nChci nahlásit:\n- [ ] Problém s botem\n- [ ] Návrh na zlepšení\n- [ ] Dotaz k funkcionalitě\n\nPopis:`,
      ro: `Bună ziua! Mă numesc ${context.userName || "utilizator"}.\n\nVreau să raportez:\n- [ ] O problemă cu botul\n- [ ] O sugestie de îmbunătățire\n- [ ] O întrebare despre funcționalitate\n\nDescriere:`,
    };
    
    const messageTemplate = templates[context.language] || templates.en;
    const encodedMessage = encodeURIComponent(messageTemplate);
    
    return {
      adminUsername: ADMIN_USERNAME,
      messageTemplate,
      supportUrl: `https://t.me/bogdan_OP24?text=${encodedMessage}`,
    };
  },
});
