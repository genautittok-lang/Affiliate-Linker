import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../db";
import { users, favorites } from "../../db/schema";
import { eq, and } from "drizzle-orm";

export const toggleFavoriteTool = createTool({
  id: "toggle-favorite",
  description: "Adds or removes a product from user's favorites. Returns updated status.",
  inputSchema: z.object({
    telegramId: z.string().describe("User's Telegram ID"),
    productId: z.string().describe("Product ID to toggle"),
    productTitle: z.string().describe("Product title"),
    productUrl: z.string().describe("Product affiliate URL"),
    productImage: z.string().describe("Product image URL"),
    price: z.number().describe("Product current price"),
    currency: z.string().describe("Price currency"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    isFavorite: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [toggleFavoriteTool] Toggling favorite:", context.productId);
    
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, context.telegramId));
      
      if (!user) {
        return {
          success: false,
          isFavorite: false,
          message: "User not found",
        };
      }
      
      const [existing] = await db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, user.id),
            eq(favorites.productId, context.productId)
          )
        );
      
      if (existing) {
        await db
          .delete(favorites)
          .where(eq(favorites.id, existing.id));
        
        logger?.info("✅ [toggleFavoriteTool] Removed from favorites");
        return {
          success: true,
          isFavorite: false,
          message: "Removed from favorites",
        };
      } else {
        await db.insert(favorites).values({
          userId: user.id,
          productId: context.productId,
          productTitle: context.productTitle,
          productUrl: context.productUrl,
          productImage: context.productImage,
          currentPrice: context.price,
          currency: context.currency,
          createdAt: new Date(),
        });
        
        logger?.info("✅ [toggleFavoriteTool] Added to favorites");
        return {
          success: true,
          isFavorite: true,
          message: "Added to favorites",
        };
      }
    } catch (error) {
      logger?.error("❌ [toggleFavoriteTool] Error:", error);
      return {
        success: false,
        isFavorite: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

export const getFavoritesTool = createTool({
  id: "get-favorites",
  description: "Gets user's favorite products list.",
  inputSchema: z.object({
    telegramId: z.string().describe("User's Telegram ID"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    favorites: z.array(z.object({
      productId: z.string(),
      productTitle: z.string(),
      productUrl: z.string(),
      productImage: z.string().optional(),
      price: z.number().optional(),
      currency: z.string(),
    })),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [getFavoritesTool] Getting favorites for:", context.telegramId);
    
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, context.telegramId));
      
      if (!user) {
        return {
          success: false,
          favorites: [],
          message: "User not found",
        };
      }
      
      const userFavorites = await db
        .select()
        .from(favorites)
        .where(eq(favorites.userId, user.id));
      
      logger?.info(`✅ [getFavoritesTool] Found ${userFavorites.length} favorites`);
      
      return {
        success: true,
        favorites: userFavorites.map(f => ({
          productId: f.productId,
          productTitle: f.productTitle,
          productUrl: f.productUrl,
          productImage: f.productImage || undefined,
          price: f.currentPrice || undefined,
          currency: f.currency,
        })),
        message: `Found ${userFavorites.length} favorites`,
      };
    } catch (error) {
      logger?.error("❌ [getFavoritesTool] Error:", error);
      return {
        success: false,
        favorites: [],
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

export const checkFavoriteTool = createTool({
  id: "check-favorite",
  description: "Checks if a product is in user's favorites.",
  inputSchema: z.object({
    telegramId: z.string().describe("User's Telegram ID"),
    productId: z.string().describe("Product ID to check"),
  }),
  outputSchema: z.object({
    isFavorite: z.boolean(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, context.telegramId));
      
      if (!user) {
        return { isFavorite: false };
      }
      
      const [existing] = await db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, user.id),
            eq(favorites.productId, context.productId)
          )
        );
      
      return { isFavorite: !!existing };
    } catch (error) {
      logger?.error("❌ [checkFavoriteTool] Error:", error);
      return { isFavorite: false };
    }
  },
});
