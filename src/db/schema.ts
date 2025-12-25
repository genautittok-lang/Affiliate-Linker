import { pgTable, serial, text, boolean, timestamp, real, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  userName: text("user_name"),
  language: text("language").notNull().default("en"),
  country: text("country").notNull().default(""),
  currency: text("currency").notNull().default("USD"),
  timezone: text("timezone"),
  dailyTopEnabled: boolean("daily_top_enabled").notNull().default(true),
  referralCode: text("referral_code"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  productTitle: text("product_title").notNull(),
  productUrl: text("product_url").notNull(),
  productImage: text("product_image"),
  originalPrice: real("original_price"),
  currentPrice: real("current_price"),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const searchHistory = pgTable("search_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const translationCache = pgTable("translation_cache", {
  id: serial("id").primaryKey(),
  productId: text("product_id").notNull(),
  language: text("language").notNull(),
  originalText: text("original_text").notNull(),
  translatedText: text("translated_text").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Favorite = typeof favorites.$inferSelect;
export type InsertFavorite = typeof favorites.$inferInsert;
export type SearchHistory = typeof searchHistory.$inferSelect;
export type TranslationCache = typeof translationCache.$inferSelect;
