import { inngest } from "./client";
import { init, serve as originalInngestServe } from "@mastra/inngest";
import { registerApiRoute as originalRegisterApiRoute } from "@mastra/core/server";
import { type Mastra } from "@mastra/core";
import { type Inngest, InngestFunction, NonRetriableError } from "inngest";
import { db } from "../../db";
import { users, broadcasts, favorites } from "../../db/schema";
import { eq, and, isNotNull, ne, gt } from "drizzle-orm";
import { searchAliExpressAPI, calculateScore } from "../tools/aliexpressSearchTool";

// Initialize Inngest with Mastra to get Inngest-compatible workflow helpers
const {
  createWorkflow: originalCreateWorkflow,
  createStep,
  cloneStep,
} = init(inngest);

export function createWorkflow(
  params: Parameters<typeof originalCreateWorkflow>[0],
): ReturnType<typeof originalCreateWorkflow> {
  return originalCreateWorkflow({
    ...params,
    retryConfig: {
      attempts: process.env.NODE_ENV === "production" ? 3 : 0,
      ...(params.retryConfig ?? {}),
    },
  });
}

// Export the Inngest client and Inngest-compatible workflow helpers
export { inngest, createStep, cloneStep };

const inngestFunctions: InngestFunction.Any[] = [];

// Create a middleware for Inngest to be able to route triggers to Mastra directly.
export function registerApiRoute<P extends string>(
  ...args: Parameters<typeof originalRegisterApiRoute<P>>
): ReturnType<typeof originalRegisterApiRoute<P>> {
  const [path, options] = args;
  if (typeof options !== "object") {
    // This will throw an error.
    return originalRegisterApiRoute(...args);
  }

  // Extract connector name from path
  // For paths like "/api/linear" -> "linear"
  // For paths like "/linear" or "/linear/webhook" -> "linear"
  const pathWithoutSlash = path.replace(/^\/+/, "");
  const pathWithoutApi = pathWithoutSlash.startsWith("api/")
    ? pathWithoutSlash.substring(4)
    : pathWithoutSlash;
  // Take only the first segment as the connector name
  const connectorName = pathWithoutApi.split("/")[0];

  inngestFunctions.push(
    inngest.createFunction(
      {
        id: `api-${connectorName}`,
        name: path,
      },
      {
        // Match the event pattern created by createWebhook: event/api.webhooks.{connector-name}.action
        event: `event/api.webhooks.${connectorName}.action`,
      },
      async ({ event, step }) => {
        await step.run("forward request to Mastra", async () => {
          // It is hard to obtain an internal handle on the Hono server,
          // so we just forward the request to the local Mastra server.
          // Extract runId from event.data if provided and pass it as a header
          const headers = { ...(event.data.headers ?? {}) };
          if (event.data.runId) {
            headers["x-mastra-run-id"] = event.data.runId;
          }
          const response = await fetch(`http://localhost:5000${path}`, {
            method: event.data.method,
            headers,
            body: event.data.body,
          });

          if (!response.ok) {
            if (
              (response.status >= 500 && response.status < 600) ||
              response.status == 429 ||
              response.status == 408
            ) {
              // 5XX, 429 (Rate-Limit Exceeded), 408 (Request Timeout) are retriable.
              throw new Error(
                `Failed to forward request to Mastra: ${response.statusText}`,
              );
            } else {
              // All other errors are non-retriable.
              throw new NonRetriableError(
                `Failed to forward request to Mastra: ${response.statusText}`,
              );
            }
          }
        });
      },
    ),
  );

  return originalRegisterApiRoute(...args);
}

// ======================================================================
// TRIGGER FUNCTIONS - CHOOSE ONE BASED ON YOUR AUTOMATION TYPE
// ======================================================================
// An automation only has a single trigger type. Based on your trigger:
//
// FOR TIME-BASED AUTOMATIONS (cron/schedule):
//   - Keep the registerCronWorkflow function below
//   - Delete the registerApiRoute function above (entire function)
//   - Used for: Daily reports, scheduled tasks, periodic checks
//
// FOR WEBHOOK-BASED AUTOMATIONS (Slack, Telegram, connectors):
//   - Keep the registerApiRoute function above
//   - Delete the registerCronWorkflow function below (entire function)
//   - Used for: Slack bots, Telegram bots, GitHub webhooks, Linear webhooks, etc.
// ======================================================================

// Helper function for registering cron-based workflow triggers
export function registerCronWorkflow(cronExpression: string, workflow: any) {
  console.log("🕐 [registerCronWorkflow] Registering cron trigger", {
    cronExpression,
    workflowId: workflow?.id,
  });

  const cronFunction = inngest.createFunction(
    { id: "cron-trigger" },
    [{ event: "replit/cron.trigger" }, { cron: cronExpression }],
    async ({ event, step }) => {
      return await step.run("execute-cron-workflow", async () => {
        console.log("🚀 [Cron Trigger] Starting scheduled workflow execution", {
          workflowId: workflow?.id,
          scheduledTime: new Date().toISOString(),
          cronExpression,
        });

        try {
          const run = await workflow.createRunAsync();
          console.log("📝 [Cron Trigger] Workflow run created", {
            runId: run?.runId,
          });

          const result = await inngest.send({
            name: `workflow.${workflow.id}`,
            data: {
              runId: run?.runId,
              inputData: {},
            },
          });
          console.log("✅ [Cron Trigger] Invoked Inngest function", {
            workflowId: workflow?.id,
            runId: run?.runId,
          });

          return result;
        } catch (error) {
          console.error("❌ [Cron Trigger] Workflow execution failed", {
            workflowId: workflow?.id,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          throw error;
        }
      });
    },
  );

  inngestFunctions.push(cronFunction);
  console.log(
    "✅ [registerCronWorkflow] Cron trigger registered successfully",
    {
      cronExpression,
    },
  );
}

const COUNTRY_LANGUAGES: Record<string, string> = {
  UA: "uk", RU: "ru", DE: "de", PL: "pl", GB: "en", US: "en",
  FR: "fr", ES: "es", IT: "it", CZ: "cs", RO: "ro",
};

const BROADCAST_MESSAGES: Record<string, { morning: string; trySearch: string; searchBtn: string; disableBtn: string }> = {
  uk: { morning: "🌟 <b>Доброго ранку!</b>\n\nОсь ТОП-10 товарів дня для тебе 🔥", trySearch: "Спробуй шукати: <b>гаджети</b>", searchBtn: "🔍 Шукати ТОП-10", disableBtn: "❌ Вимкнути сповіщення" },
  ru: { morning: "🌟 <b>Доброе утро!</b>\n\nВот ТОП-10 товаров дня для тебя 🔥", trySearch: "Попробуй искать: <b>гаджеты</b>", searchBtn: "🔍 Искать ТОП-10", disableBtn: "❌ Отключить уведомления" },
  de: { morning: "🌟 <b>Guten Morgen!</b>\n\nHier sind TOP-10 Produkte des Tages für dich 🔥", trySearch: "Versuche zu suchen: <b>Gadgets</b>", searchBtn: "🔍 TOP-10 suchen", disableBtn: "❌ Benachrichtigungen deaktivieren" },
  pl: { morning: "🌟 <b>Dzień dobry!</b>\n\nOto TOP-10 produktów dnia dla ciebie 🔥", trySearch: "Spróbuj szukać: <b>gadżety</b>", searchBtn: "🔍 Szukaj TOP-10", disableBtn: "❌ Wyłącz powiadomienia" },
  en: { morning: "🌟 <b>Good morning!</b>\n\nHere are TOP-10 products of the day for you 🔥", trySearch: "Try searching: <b>gadgets</b>", searchBtn: "🔍 Search TOP-10", disableBtn: "❌ Disable notifications" },
  fr: { morning: "🌟 <b>Bonjour!</b>\n\nVoici le TOP-10 des produits du jour pour toi 🔥", trySearch: "Essaie de chercher: <b>gadgets</b>", searchBtn: "🔍 Chercher TOP-10", disableBtn: "❌ Désactiver les notifications" },
  es: { morning: "🌟 <b>Buenos días!</b>\n\nAquí están los TOP-10 productos del día para ti 🔥", trySearch: "Intenta buscar: <b>gadgets</b>", searchBtn: "🔍 Buscar TOP-10", disableBtn: "❌ Desactivar notificaciones" },
  it: { morning: "🌟 <b>Buongiorno!</b>\n\nEcco i TOP-10 prodotti del giorno per te 🔥", trySearch: "Prova a cercare: <b>gadget</b>", searchBtn: "🔍 Cerca TOP-10", disableBtn: "❌ Disabilita notifiche" },
  cs: { morning: "🌟 <b>Dobré ráno!</b>\n\nZde je TOP-10 produktů dne pro tebe 🔥", trySearch: "Zkus hledat: <b>gadgety</b>", searchBtn: "🔍 Hledat TOP-10", disableBtn: "❌ Vypnout upozornění" },
  ro: { morning: "🌟 <b>Bună dimineața!</b>\n\nIată TOP-10 produse ale zilei pentru tine 🔥", trySearch: "Încearcă să cauți: <b>gadgeturi</b>", searchBtn: "🔍 Caută TOP-10", disableBtn: "❌ Dezactivează notificările" },
};

const COUNTRY_CURRENCIES: Record<string, string> = {
  Ukraine: "UAH", Germany: "EUR", Poland: "PLN", Czechia: "CZK",
  Romania: "RON", France: "EUR", Spain: "EUR", Italy: "EUR", UK: "GBP", USA: "USD",
};

const dailyBroadcastFunction = inngest.createFunction(
  { id: "daily-broadcast", name: "Daily TOP-10 Broadcast" },
  { cron: "0 10 * * *" },
  async ({ step }) => {
    console.log("📢 [DailyBroadcast] Starting daily broadcast at 10:00...");
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error("❌ [DailyBroadcast] Bot token not configured");
      return { success: false, sentCount: 0, errorCount: 0, productsSent: 0 };
    }
    
    const eligibleUsers = await step.run("fetch-eligible-users", async () => {
      return await db.select()
        .from(users)
        .where(and(
          eq(users.dailyTopEnabled, true),
          isNotNull(users.country)
        ));
    });
    
    console.log(`📊 [DailyBroadcast] Found ${eligibleUsers.length} eligible users`);
    
    const productsByCountry = new Map<string, any[]>();
    
    const countries = [...new Set(eligibleUsers.map(u => u.country).filter(Boolean))];
    
    await step.run("fetch-products-for-countries", async () => {
      for (const country of countries) {
        const currency = COUNTRY_CURRENCIES[country || ""] || "USD";
        try {
          const products = await searchAliExpressAPI(
            "bestseller trending hot deals",
            country || "USA",
            currency,
            { minRating: 4.5 }
          );
          
          const scoredProducts = products
            .filter(p => p.price >= 1)
            .map(p => ({ ...p, score: calculateScore(p) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
          
          productsByCountry.set(country || "USA", scoredProducts);
          console.log(`✅ [DailyBroadcast] Fetched ${scoredProducts.length} products for ${country}`);
        } catch (e) {
          console.error(`❌ [DailyBroadcast] Error fetching products for ${country}:`, e);
          productsByCountry.set(country || "USA", []);
        }
      }
    });
    
    const result = await step.run("send-broadcast-messages", async () => {
      let sentCount = 0;
      let errorCount = 0;
      let productsSent = 0;
      
      for (const user of eligibleUsers) {
        if (!user.country) continue;
        
        const lang = COUNTRY_LANGUAGES[user.country] || user.language || "en";
        const msgs = BROADCAST_MESSAGES[lang] || BROADCAST_MESSAGES.en;
        const products = productsByCountry.get(user.country) || [];
        
        try {
          const introRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: user.telegramId,
              text: msgs.morning,
              parse_mode: "HTML",
            }),
          });
          
          const introResult = await introRes.json() as { ok: boolean };
          if (!introResult.ok) {
            errorCount++;
            continue;
          }
          
          let sent = 0;
          for (const product of products.slice(0, 5)) {
            const discount = product.discount > 0 ? ` <s>${product.originalPrice}</s> -${product.discount}%` : "";
            const shipping = product.freeShipping ? "🚚 Free" : "";
            const rating = product.rating > 0 ? `⭐ ${product.rating.toFixed(1)}` : "";
            const orders = product.orders > 0 ? `🛒 ${product.orders >= 1000 ? (product.orders / 1000).toFixed(1) + "K" : product.orders}` : "";
            
            const caption = `📦 <b>${product.title.slice(0, 100)}</b>\n\n💰 <b>${product.price} ${product.currency}</b>${discount}\n${[rating, orders, shipping].filter(Boolean).join(" | ")}`;
            
            const productButtons = [
              [{ text: "🛒 Buy", url: product.affiliateUrl }],
            ];
            
            try {
              if (product.imageUrl && !product.imageUrl.includes("placeholder")) {
                const photoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: user.telegramId,
                    photo: product.imageUrl,
                    caption,
                    parse_mode: "HTML",
                    reply_markup: { inline_keyboard: productButtons },
                  }),
                });
                const photoResult = await photoRes.json() as { ok: boolean };
                if (photoResult.ok) {
                  sent++;
                } else {
                  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      chat_id: user.telegramId,
                      text: caption,
                      parse_mode: "HTML",
                      reply_markup: { inline_keyboard: productButtons },
                    }),
                  });
                  sent++;
                }
              } else {
                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: user.telegramId,
                    text: caption,
                    parse_mode: "HTML",
                    reply_markup: { inline_keyboard: productButtons },
                  }),
                });
                sent++;
              }
              
              await new Promise(r => setTimeout(r, 100));
            } catch (e) {
              console.warn(`⚠️ [DailyBroadcast] Product send error:`, e);
            }
          }
          
          productsSent += sent;
          
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: user.telegramId,
              text: `\n\n🔍 ${msgs.trySearch}`,
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [{ text: msgs.searchBtn, callback_data: "action:top10" }],
                  [{ text: msgs.disableBtn, callback_data: "toggle:daily_off" }],
                ],
              },
            }),
          });
          
          sentCount++;
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          errorCount++;
          console.error(`❌ [DailyBroadcast] Error sending to ${user.telegramId}:`, e);
        }
      }
      
      await db.insert(broadcasts).values({
        adminId: "system",
        message: "Daily TOP-10 broadcast with products",
        targetCountry: "all",
        targetLanguage: "all",
        sentCount,
        sentAt: new Date(),
        createdAt: new Date(),
      });
      
      console.log(`✅ [DailyBroadcast] Complete: ${sentCount} users, ${productsSent} products, ${errorCount} errors`);
      return { success: true, sentCount, errorCount, productsSent };
    });
    
    return result;
  }
);

inngestFunctions.push(dailyBroadcastFunction);

const PRICE_DROP_MESSAGES: Record<string, { title: string; dropped: string; viewBtn: string }> = {
  uk: { title: "📉 <b>Ціна впала!</b>", dropped: "Ціна знизилась на <b>{percent}%</b>!", viewBtn: "👀 Переглянути" },
  ru: { title: "📉 <b>Цена упала!</b>", dropped: "Цена снизилась на <b>{percent}%</b>!", viewBtn: "👀 Посмотреть" },
  en: { title: "📉 <b>Price dropped!</b>", dropped: "Price dropped by <b>{percent}%</b>!", viewBtn: "👀 View" },
  de: { title: "📉 <b>Preis gefallen!</b>", dropped: "Preis um <b>{percent}%</b> gesunken!", viewBtn: "👀 Ansehen" },
  pl: { title: "📉 <b>Cena spadła!</b>", dropped: "Cena spadła o <b>{percent}%</b>!", viewBtn: "👀 Zobacz" },
  fr: { title: "📉 <b>Prix en baisse!</b>", dropped: "Prix réduit de <b>{percent}%</b>!", viewBtn: "👀 Voir" },
  es: { title: "📉 <b>¡Precio bajó!</b>", dropped: "Precio bajó un <b>{percent}%</b>!", viewBtn: "👀 Ver" },
  it: { title: "📉 <b>Prezzo sceso!</b>", dropped: "Prezzo sceso del <b>{percent}%</b>!", viewBtn: "👀 Guarda" },
  cs: { title: "📉 <b>Cena klesla!</b>", dropped: "Cena klesla o <b>{percent}%</b>!", viewBtn: "👀 Zobrazit" },
  ro: { title: "📉 <b>Preț scăzut!</b>", dropped: "Prețul a scăzut cu <b>{percent}%</b>!", viewBtn: "👀 Vezi" },
};

const priceDropCheckFunction = inngest.createFunction(
  { id: "price-drop-check", name: "Price Drop Notifications" },
  { cron: "0 18 * * *" },
  async ({ step }) => {
    console.log("📉 [PriceDropCheck] Starting price check at 18:00...");
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error("❌ [PriceDropCheck] Bot token not configured");
      return { success: false, notificationsSent: 0 };
    }
    
    const allFavorites = await step.run("fetch-all-favorites", async () => {
      return await db.select({
        favorite: favorites,
        user: users,
      })
      .from(favorites)
      .innerJoin(users, eq(favorites.userId, users.id))
      .where(gt(favorites.currentPrice, 0));
    });
    
    console.log(`📊 [PriceDropCheck] Found ${allFavorites.length} favorites to check`);
    
    const result = await step.run("check-prices-and-notify", async () => {
      let notificationsSent = 0;
      let priceUpdates = 0;
      
      const productIds = [...new Set(allFavorites.map(f => f.favorite.productId))];
      
      for (const item of allFavorites) {
        const fav = item.favorite;
        const user = item.user;
        const lang = user.language || "en";
        const msgs = PRICE_DROP_MESSAGES[lang] || PRICE_DROP_MESSAGES.en;
        
        try {
          const products = await searchAliExpressAPI(
            fav.productTitle.slice(0, 50),
            user.country || "USA",
            user.currency || "USD",
            {}
          );
          
          const matchingProduct = products.find(p => p.id === fav.productId) || products[0];
          
          if (matchingProduct && fav.currentPrice) {
            const oldPrice = fav.currentPrice;
            const newPrice = matchingProduct.price;
            
            if (newPrice < oldPrice) {
              const dropPercent = Math.round((1 - newPrice / oldPrice) * 100);
              
              if (dropPercent >= 5) {
                const caption = `${msgs.title}\n\n📦 <b>${fav.productTitle.slice(0, 80)}</b>\n\n💰 <s>${oldPrice} ${fav.currency}</s> → <b>${newPrice} ${fav.currency}</b>\n${msgs.dropped.replace("{percent}", String(dropPercent))}`;
                
                const productButtons = [
                  [{ text: msgs.viewBtn, url: fav.productUrl }],
                ];
                
                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: user.telegramId,
                    text: caption,
                    parse_mode: "HTML",
                    reply_markup: { inline_keyboard: productButtons },
                  }),
                });
                
                notificationsSent++;
                console.log(`📢 [PriceDropCheck] Notified ${user.telegramId} about ${dropPercent}% drop on ${fav.productId}`);
              }
              
              await db.update(favorites)
                .set({ 
                  currentPrice: newPrice,
                  originalPrice: fav.originalPrice || oldPrice,
                })
                .where(eq(favorites.id, fav.id));
              priceUpdates++;
            }
          }
          
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          console.warn(`⚠️ [PriceDropCheck] Error checking ${fav.productId}:`, e);
        }
      }
      
      console.log(`✅ [PriceDropCheck] Complete: ${notificationsSent} notifications, ${priceUpdates} price updates`);
      return { success: true, notificationsSent, priceUpdates };
    });
    
    return result;
  }
);

inngestFunctions.push(priceDropCheckFunction);

export function inngestServe({
  mastra,
  inngest,
}: {
  mastra: Mastra;
  inngest: Inngest;
}): ReturnType<typeof originalInngestServe> {
  let serveHost: string | undefined = undefined;
  if (process.env.NODE_ENV === "production") {
    if (process.env.REPLIT_DOMAINS) {
      serveHost = `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
    }
  } else {
    serveHost = "http://localhost:5000";
  }
  return originalInngestServe({
    mastra,
    inngest,
    functions: inngestFunctions,
    registerOptions: { serveHost },
  });
}
