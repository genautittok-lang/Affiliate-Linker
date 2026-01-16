import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../db";
import { users, referrals } from "../../db/schema";
import { eq, sql } from "drizzle-orm";

function generateReferralCode(telegramId: string): string {
  const base = Buffer.from(telegramId).toString('base64').replace(/[+/=]/g, '').substring(0, 8);
  return `BW${base}`.toUpperCase();
}

export const getReferralLinkTool = createTool({
  id: "get-referral-link",
  description: "Gets user's unique referral link. Use when user asks for their referral link or wants to invite friends.",
  inputSchema: z.object({
    telegramId: z.string().describe("User's Telegram ID"),
    botUsername: z.string().default("BuyWiseBot").describe("Bot's username"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    referralCode: z.string().optional(),
    referralLink: z.string().optional(),
    referralCount: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔗 [ReferralLink] Getting referral link for user", { telegramId: context.telegramId });
    
    try {
      const [user] = await db.select().from(users).where(eq(users.telegramId, context.telegramId));
      
      if (!user) {
        return { success: false, error: "User not found" };
      }
      
      let referralCode = user.referralCode;
      if (!referralCode) {
        referralCode = generateReferralCode(context.telegramId);
        await db.update(users)
          .set({ referralCode })
          .where(eq(users.telegramId, context.telegramId));
        logger?.info("✅ [ReferralLink] Generated new referral code", { referralCode });
      }
      
      const referralCountResult = await db.select({ count: sql<number>`count(*)` })
        .from(referrals)
        .where(eq(referrals.referrerId, user.id));
      
      const referralCount = referralCountResult[0]?.count || 0;
      const referralLink = `https://t.me/${context.botUsername}?start=${referralCode}`;
      
      logger?.info("✅ [ReferralLink] Returning referral info", { referralCode, referralCount });
      
      return {
        success: true,
        referralCode,
        referralLink,
        referralCount: Number(referralCount),
      };
    } catch (error: any) {
      logger?.error("❌ [ReferralLink] Error", { error: error.message });
      return { success: false, error: error.message };
    }
  },
});

export const processReferralTool = createTool({
  id: "process-referral",
  description: "Processes a referral when new user joins via referral link. Called during /start with referral code.",
  inputSchema: z.object({
    newUserTelegramId: z.string().describe("New user's Telegram ID"),
    referralCode: z.string().describe("Referral code from the link"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    referrerName: z.string().optional(),
    bonusMessage: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🎁 [ProcessReferral] Processing referral", context);
    
    try {
      const [referrer] = await db.select()
        .from(users)
        .where(eq(users.referralCode, context.referralCode));
      
      if (!referrer) {
        logger?.info("⚠️ [ProcessReferral] Referral code not found", { code: context.referralCode });
        return { success: false, error: "Invalid referral code" };
      }
      
      if (referrer.telegramId === context.newUserTelegramId) {
        return { success: false, error: "Cannot refer yourself" };
      }
      
      const [newUser] = await db.select()
        .from(users)
        .where(eq(users.telegramId, context.newUserTelegramId));
      
      if (!newUser) {
        return { success: false, error: "New user not found" };
      }
      
      const existingReferral = await db.select()
        .from(referrals)
        .where(eq(referrals.referredId, newUser.id));
      
      if (existingReferral.length > 0) {
        logger?.info("⚠️ [ProcessReferral] User already referred", { userId: newUser.id });
        return { success: false, error: "User already has a referrer" };
      }
      
      await db.insert(referrals).values({
        referrerId: referrer.id,
        referredId: newUser.id,
        bonusAwarded: true,
      });
      
      await db.update(users)
        .set({ referredBy: referrer.id })
        .where(eq(users.id, newUser.id));
      
      logger?.info("✅ [ProcessReferral] Referral recorded successfully");
      
      return {
        success: true,
        referrerName: referrer.userName || referrer.firstName || "друг",
        bonusMessage: `🎉 Ви приєднались за запрошенням від ${referrer.userName || referrer.firstName || "друга"}!`,
      };
    } catch (error: any) {
      logger?.error("❌ [ProcessReferral] Error", { error: error.message });
      return { success: false, error: error.message };
    }
  },
});

export const getReferralStatsTool = createTool({
  id: "get-referral-stats",
  description: "Gets user's referral statistics: how many people they invited, bonuses earned.",
  inputSchema: z.object({
    telegramId: z.string().describe("User's Telegram ID"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    totalReferrals: z.number().optional(),
    referralCode: z.string().optional(),
    referralLink: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📊 [ReferralStats] Getting stats for user", { telegramId: context.telegramId });
    
    try {
      const [user] = await db.select()
        .from(users)
        .where(eq(users.telegramId, context.telegramId));
      
      if (!user) {
        return { success: false, error: "User not found" };
      }
      
      const referralCountResult = await db.select({ count: sql<number>`count(*)` })
        .from(referrals)
        .where(eq(referrals.referrerId, user.id));
      
      const totalReferrals = Number(referralCountResult[0]?.count || 0);
      
      let referralCode = user.referralCode;
      if (!referralCode) {
        referralCode = generateReferralCode(context.telegramId);
        await db.update(users)
          .set({ referralCode })
          .where(eq(users.telegramId, context.telegramId));
      }
      
      logger?.info("✅ [ReferralStats] Stats retrieved", { totalReferrals, referralCode });
      
      return {
        success: true,
        totalReferrals,
        referralCode,
        referralLink: `https://t.me/BuyWises_bot?start=${referralCode}`,
      };
    } catch (error: any) {
      logger?.error("❌ [ReferralStats] Error", { error: error.message });
      return { success: false, error: error.message };
    }
  },
});
