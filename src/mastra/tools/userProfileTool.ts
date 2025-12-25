import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../db";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";

const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  "Ukraine": "UAH",
  "Україна": "UAH",
  "Russia": "RUB",
  "Россия": "RUB",
  "Germany": "EUR",
  "Deutschland": "EUR",
  "Німеччина": "EUR",
  "Poland": "PLN",
  "Polska": "PLN",
  "Польща": "PLN",
  "United Kingdom": "GBP",
  "UK": "GBP",
  "Великобританія": "GBP",
  "France": "EUR",
  "Франція": "EUR",
  "Spain": "EUR",
  "España": "EUR",
  "Іспанія": "EUR",
  "Italy": "EUR",
  "Italia": "EUR",
  "Італія": "EUR",
  "Czech Republic": "CZK",
  "Czechia": "CZK",
  "Чехія": "CZK",
  "Romania": "RON",
  "România": "RON",
  "Румунія": "RON",
  "USA": "USD",
  "United States": "USD",
  "США": "USD",
};

const LANGUAGE_MAP: Record<string, string> = {
  "uk": "uk",
  "ua": "uk",
  "ru": "ru",
  "de": "de",
  "pl": "pl",
  "en": "en",
  "fr": "fr",
  "es": "es",
  "it": "it",
  "cs": "cs",
  "ro": "ro",
};

export const getUserProfileTool = createTool({
  id: "get-user-profile",
  description: "Gets user profile by Telegram ID. Use this to check if user exists and get their preferences (language, country, currency).",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram user ID"),
  }),
  outputSchema: z.object({
    exists: z.boolean(),
    profile: z.object({
      telegramId: z.string(),
      language: z.string(),
      country: z.string(),
      currency: z.string(),
      userName: z.string().nullable(),
      dailyTopEnabled: z.boolean(),
      timezone: z.string().nullable(),
    }).nullable(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [getUserProfileTool] Getting profile for:", context.telegramId);
    
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, context.telegramId));
      
      if (user) {
        logger?.info("✅ [getUserProfileTool] Found user profile");
        return {
          exists: true,
          profile: {
            telegramId: user.telegramId,
            language: user.language,
            country: user.country,
            currency: user.currency,
            userName: user.userName,
            dailyTopEnabled: user.dailyTopEnabled,
            timezone: user.timezone,
          },
        };
      }
      
      logger?.info("📝 [getUserProfileTool] User not found");
      return { exists: false, profile: null };
    } catch (error) {
      logger?.error("❌ [getUserProfileTool] Error:", error);
      return { exists: false, profile: null };
    }
  },
});

export const createUserProfileTool = createTool({
  id: "create-user-profile",
  description: "Creates or updates user profile with language, country, and currency. Currency is auto-determined from country.",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram user ID"),
    userName: z.string().describe("Telegram username. Empty string if not available."),
    language: z.string().describe("User's preferred language code (uk, ru, de, pl, en, fr, es, it, cs, ro)"),
    country: z.string().describe("User's country for delivery"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    profile: z.object({
      telegramId: z.string(),
      language: z.string(),
      country: z.string(),
      currency: z.string(),
      userName: z.string().nullable(),
      dailyTopEnabled: z.boolean(),
    }).nullable(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [createUserProfileTool] Creating/updating profile:", context);
    
    try {
      const normalizedLang = LANGUAGE_MAP[context.language.toLowerCase()] || "en";
      const currency = COUNTRY_CURRENCY_MAP[context.country] || "USD";
      
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, context.telegramId));
      
      if (existingUser) {
        const [updatedUser] = await db
          .update(users)
          .set({
            language: normalizedLang,
            country: context.country,
            currency: currency,
            userName: context.userName || existingUser.userName,
            updatedAt: new Date(),
          })
          .where(eq(users.telegramId, context.telegramId))
          .returning();
        
        logger?.info("✅ [createUserProfileTool] Profile updated");
        return {
          success: true,
          profile: {
            telegramId: updatedUser.telegramId,
            language: updatedUser.language,
            country: updatedUser.country,
            currency: updatedUser.currency,
            userName: updatedUser.userName,
            dailyTopEnabled: updatedUser.dailyTopEnabled,
          },
          message: "Profile updated successfully",
        };
      }
      
      const [newUser] = await db
        .insert(users)
        .values({
          telegramId: context.telegramId,
          userName: context.userName || null,
          language: normalizedLang,
          country: context.country,
          currency: currency,
          dailyTopEnabled: true,
        })
        .returning();
      
      logger?.info("✅ [createUserProfileTool] Profile created");
      return {
        success: true,
        profile: {
          telegramId: newUser.telegramId,
          language: newUser.language,
          country: newUser.country,
          currency: newUser.currency,
          userName: newUser.userName,
          dailyTopEnabled: newUser.dailyTopEnabled,
        },
        message: "Profile created successfully",
      };
    } catch (error) {
      logger?.error("❌ [createUserProfileTool] Error:", error);
      return {
        success: false,
        profile: null,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

export const updateUserSettingsTool = createTool({
  id: "update-user-settings",
  description: "Updates user settings like language, country, or daily top subscription. Pass empty string to keep current value.",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram user ID"),
    language: z.string().describe("New language code. Empty string to keep current."),
    country: z.string().describe("New country for delivery. Empty string to keep current."),
    dailyTopEnabled: z.boolean().describe("Enable/disable daily TOP-10"),
    timezone: z.string().describe("User timezone. Empty string to keep current."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [updateUserSettingsTool] Updating settings:", context);
    
    try {
      const updateData: Record<string, any> = { updatedAt: new Date() };
      
      if (context.language) {
        updateData.language = LANGUAGE_MAP[context.language.toLowerCase()] || context.language;
      }
      if (context.country) {
        updateData.country = context.country;
        updateData.currency = COUNTRY_CURRENCY_MAP[context.country] || "USD";
      }
      if (context.dailyTopEnabled !== undefined) {
        updateData.dailyTopEnabled = context.dailyTopEnabled;
      }
      if (context.timezone) {
        updateData.timezone = context.timezone;
      }
      
      await db
        .update(users)
        .set(updateData)
        .where(eq(users.telegramId, context.telegramId));
      
      logger?.info("✅ [updateUserSettingsTool] Settings updated");
      return { success: true, message: "Settings updated successfully" };
    } catch (error) {
      logger?.error("❌ [updateUserSettingsTool] Error:", error);
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
