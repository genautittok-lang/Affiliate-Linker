import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { db } from "../../db";
import { translationCache } from "../../db/schema";
import { and, eq } from "drizzle-orm";

const openai = createOpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  uk: {
    welcome: "Привіт, {name}! 👋\n\nЯ – 🤖 BuyWise, твій розумний помічник для вигідних покупок на AliExpress. 🛒",
    what_i_can: "Що я можу:\n⭐ Шукати товари за твоїм запитом\n💸 Показувати ТОП-10 найвигідніших пропозицій\n🔔 Сповіщати про знижки та падіння цін\n🌍 Підбирати товари з урахуванням твоєї країни та валюти",
    start_prompt: "Щоб почати, просто введи назву товару або використай команди:",
    search_button: "🔍 Пошук товару",
    top_button: "🔥 ТОП-10 сьогодні",
    settings_button: "⚙️ Налаштування",
    select_country: "Виберіть вашу країну для доставки:",
    settings_saved: "✅ Налаштування збережено!",
    product_rating: "⭐ Рейтинг",
    product_orders: "🛒 Замовлень",
    product_price: "💰 Ціна",
    product_shipping: "🚚 Доставка",
    free_shipping: "Безкоштовна",
    colors_available: "🎨 Кольорів",
    buy_now: "🛒 Купити",
    no_products: "На жаль, не знайдено товарів за вашим запитом. Спробуйте інший пошук.",
    ask_country: "З якої ви країни? Це потрібно для показу цін у вашій валюті та розрахунку доставки.",
  },
  ru: {
    welcome: "Привет, {name}! 👋\n\nЯ – 🤖 BuyWise, твой умный помощник для выгодных покупок на AliExpress. 🛒",
    what_i_can: "Что я умею:\n⭐ Искать товары по твоему запросу\n💸 Показывать ТОП-10 лучших предложений\n🔔 Уведомлять о скидках и снижении цен\n🌍 Подбирать товары с учетом твоей страны и валюты",
    start_prompt: "Чтобы начать, просто введи название товара или используй команды:",
    search_button: "🔍 Поиск товара",
    top_button: "🔥 ТОП-10 сегодня",
    settings_button: "⚙️ Настройки",
    select_country: "Выберите вашу страну для доставки:",
    settings_saved: "✅ Настройки сохранены!",
    product_rating: "⭐ Рейтинг",
    product_orders: "🛒 Заказов",
    product_price: "💰 Цена",
    product_shipping: "🚚 Доставка",
    free_shipping: "Бесплатная",
    colors_available: "🎨 Цветов",
    buy_now: "🛒 Купить",
    no_products: "К сожалению, товаров по вашему запросу не найдено. Попробуйте другой поиск.",
    ask_country: "Из какой вы страны? Это нужно для показа цен в вашей валюте и расчета доставки.",
  },
  de: {
    welcome: "Hallo, {name}! 👋\n\nIch bin 🤖 BuyWise, dein smarter Assistent für günstige Einkäufe auf AliExpress. 🛒",
    what_i_can: "Was ich kann:\n⭐ Produkte nach deiner Anfrage suchen\n💸 Die TOP-10 besten Angebote zeigen\n🔔 Über Rabatte und Preissenkungen informieren\n🌍 Produkte passend zu deinem Land und deiner Währung finden",
    start_prompt: "Um zu beginnen, gib einfach einen Produktnamen ein oder nutze die Befehle:",
    search_button: "🔍 Produkt suchen",
    top_button: "🔥 TOP-10 heute",
    settings_button: "⚙️ Einstellungen",
    select_country: "Wähle dein Land für die Lieferung:",
    settings_saved: "✅ Einstellungen gespeichert!",
    product_rating: "⭐ Bewertung",
    product_orders: "🛒 Bestellungen",
    product_price: "💰 Preis",
    product_shipping: "🚚 Versand",
    free_shipping: "Kostenlos",
    colors_available: "🎨 Farben",
    buy_now: "🛒 Kaufen",
    no_products: "Leider wurden keine Produkte gefunden. Versuche eine andere Suche.",
    ask_country: "Aus welchem Land kommst du? Das brauche ich für die Preise in deiner Währung und die Versandberechnung.",
  },
  en: {
    welcome: "Hello, {name}! 👋\n\nI'm 🤖 BuyWise, your smart assistant for great deals on AliExpress. 🛒",
    what_i_can: "What I can do:\n⭐ Search for products by your query\n💸 Show TOP-10 best deals\n🔔 Notify about discounts and price drops\n🌍 Find products matching your country and currency",
    start_prompt: "To start, just type a product name or use commands:",
    search_button: "🔍 Search product",
    top_button: "🔥 TOP-10 today",
    settings_button: "⚙️ Settings",
    select_country: "Select your country for delivery:",
    settings_saved: "✅ Settings saved!",
    product_rating: "⭐ Rating",
    product_orders: "🛒 Orders",
    product_price: "💰 Price",
    product_shipping: "🚚 Shipping",
    free_shipping: "Free",
    colors_available: "🎨 Colors",
    buy_now: "🛒 Buy now",
    no_products: "Sorry, no products found for your query. Try a different search.",
    ask_country: "What country are you from? I need this to show prices in your currency and calculate shipping.",
  },
  pl: {
    welcome: "Cześć, {name}! 👋\n\nJestem 🤖 BuyWise, twoim inteligentnym asystentem zakupów na AliExpress. 🛒",
    what_i_can: "Co potrafię:\n⭐ Szukać produktów według twojego zapytania\n💸 Pokazywać TOP-10 najlepszych ofert\n🔔 Powiadamiać o zniżkach i obniżkach cen\n🌍 Dobierać produkty dopasowane do twojego kraju i waluty",
    start_prompt: "Aby zacząć, wpisz nazwę produktu lub użyj poleceń:",
    search_button: "🔍 Szukaj produktu",
    top_button: "🔥 TOP-10 dzisiaj",
    settings_button: "⚙️ Ustawienia",
    select_country: "Wybierz swój kraj dostawy:",
    settings_saved: "✅ Ustawienia zapisane!",
    product_rating: "⭐ Ocena",
    product_orders: "🛒 Zamówień",
    product_price: "💰 Cena",
    product_shipping: "🚚 Dostawa",
    free_shipping: "Darmowa",
    colors_available: "🎨 Kolorów",
    buy_now: "🛒 Kup teraz",
    no_products: "Niestety nie znaleziono produktów. Spróbuj innego wyszukiwania.",
    ask_country: "Z jakiego kraju jesteś? Potrzebuję tego do pokazania cen w twojej walucie i obliczenia dostawy.",
  },
  fr: {
    welcome: "Bonjour, {name}! 👋\n\nJe suis 🤖 BuyWise, votre assistant intelligent pour les bonnes affaires sur AliExpress. 🛒",
    what_i_can: "Ce que je peux faire:\n⭐ Rechercher des produits selon votre demande\n💸 Afficher le TOP-10 des meilleures offres\n🔔 Notifier des réductions et baisses de prix\n🌍 Trouver des produits adaptés à votre pays et devise",
    start_prompt: "Pour commencer, tapez un nom de produit ou utilisez les commandes:",
    search_button: "🔍 Rechercher",
    top_button: "🔥 TOP-10 aujourd'hui",
    settings_button: "⚙️ Paramètres",
    select_country: "Sélectionnez votre pays de livraison:",
    settings_saved: "✅ Paramètres enregistrés!",
    product_rating: "⭐ Note",
    product_orders: "🛒 Commandes",
    product_price: "💰 Prix",
    product_shipping: "🚚 Livraison",
    free_shipping: "Gratuite",
    colors_available: "🎨 Couleurs",
    buy_now: "🛒 Acheter",
    no_products: "Désolé, aucun produit trouvé. Essayez une autre recherche.",
    ask_country: "De quel pays êtes-vous? J'en ai besoin pour afficher les prix dans votre devise.",
  },
  es: {
    welcome: "¡Hola, {name}! 👋\n\nSoy 🤖 BuyWise, tu asistente inteligente para ofertas en AliExpress. 🛒",
    what_i_can: "Lo que puedo hacer:\n⭐ Buscar productos según tu consulta\n💸 Mostrar TOP-10 mejores ofertas\n🔔 Notificar sobre descuentos y bajadas de precio\n🌍 Encontrar productos adaptados a tu país y moneda",
    start_prompt: "Para empezar, escribe un producto o usa los comandos:",
    search_button: "🔍 Buscar producto",
    top_button: "🔥 TOP-10 hoy",
    settings_button: "⚙️ Configuración",
    select_country: "Selecciona tu país de envío:",
    settings_saved: "✅ ¡Configuración guardada!",
    product_rating: "⭐ Valoración",
    product_orders: "🛒 Pedidos",
    product_price: "💰 Precio",
    product_shipping: "🚚 Envío",
    free_shipping: "Gratis",
    colors_available: "🎨 Colores",
    buy_now: "🛒 Comprar",
    no_products: "Lo siento, no se encontraron productos. Intenta otra búsqueda.",
    ask_country: "¿De qué país eres? Lo necesito para mostrar precios en tu moneda.",
  },
  it: {
    welcome: "Ciao, {name}! 👋\n\nSono 🤖 BuyWise, il tuo assistente intelligente per offerte su AliExpress. 🛒",
    what_i_can: "Cosa posso fare:\n⭐ Cercare prodotti secondo la tua richiesta\n💸 Mostrare TOP-10 migliori offerte\n🔔 Notificare sconti e cali di prezzo\n🌍 Trovare prodotti adatti al tuo paese e valuta",
    start_prompt: "Per iniziare, digita un prodotto o usa i comandi:",
    search_button: "🔍 Cerca prodotto",
    top_button: "🔥 TOP-10 oggi",
    settings_button: "⚙️ Impostazioni",
    select_country: "Seleziona il tuo paese di spedizione:",
    settings_saved: "✅ Impostazioni salvate!",
    product_rating: "⭐ Valutazione",
    product_orders: "🛒 Ordini",
    product_price: "💰 Prezzo",
    product_shipping: "🚚 Spedizione",
    free_shipping: "Gratuita",
    colors_available: "🎨 Colori",
    buy_now: "🛒 Acquista",
    no_products: "Spiacente, nessun prodotto trovato. Prova un'altra ricerca.",
    ask_country: "Di che paese sei? Mi serve per mostrare i prezzi nella tua valuta.",
  },
  cs: {
    welcome: "Ahoj, {name}! 👋\n\nJsem 🤖 BuyWise, tvůj chytrý asistent pro výhodné nákupy na AliExpress. 🛒",
    what_i_can: "Co umím:\n⭐ Hledat produkty podle tvého dotazu\n💸 Ukázat TOP-10 nejlepších nabídek\n🔔 Upozornit na slevy a snížení cen\n🌍 Najít produkty vhodné pro tvoji zemi a měnu",
    start_prompt: "Pro začátek napiš název produktu nebo použij příkazy:",
    search_button: "🔍 Hledat produkt",
    top_button: "🔥 TOP-10 dnes",
    settings_button: "⚙️ Nastavení",
    select_country: "Vyber svoji zemi pro doručení:",
    settings_saved: "✅ Nastavení uloženo!",
    product_rating: "⭐ Hodnocení",
    product_orders: "🛒 Objednávek",
    product_price: "💰 Cena",
    product_shipping: "🚚 Doprava",
    free_shipping: "Zdarma",
    colors_available: "🎨 Barev",
    buy_now: "🛒 Koupit",
    no_products: "Bohužel jsme nenašli žádné produkty. Zkus jiné hledání.",
    ask_country: "Z jaké jsi země? Potřebuji to pro zobrazení cen ve tvé měně.",
  },
  ro: {
    welcome: "Salut, {name}! 👋\n\nSunt 🤖 BuyWise, asistentul tău inteligent pentru oferte pe AliExpress. 🛒",
    what_i_can: "Ce pot face:\n⭐ Căuta produse după cererea ta\n💸 Arăta TOP-10 cele mai bune oferte\n🔔 Notifica despre reduceri și scăderi de preț\n🌍 Găsi produse potrivite țării și monedei tale",
    start_prompt: "Pentru a începe, scrie un produs sau folosește comenzile:",
    search_button: "🔍 Caută produs",
    top_button: "🔥 TOP-10 azi",
    settings_button: "⚙️ Setări",
    select_country: "Selectează țara ta pentru livrare:",
    settings_saved: "✅ Setări salvate!",
    product_rating: "⭐ Rating",
    product_orders: "🛒 Comenzi",
    product_price: "💰 Preț",
    product_shipping: "🚚 Livrare",
    free_shipping: "Gratuită",
    colors_available: "🎨 Culori",
    buy_now: "🛒 Cumpără",
    no_products: "Ne pare rău, nu s-au găsit produse. Încearcă altă căutare.",
    ask_country: "Din ce țară ești? Am nevoie pentru a afișa prețurile în moneda ta.",
  },
};

export const getUITextTool = createTool({
  id: "get-ui-text",
  description: "Gets localized UI text/button labels in user's language. Use this to get translated interface strings.",
  inputSchema: z.object({
    language: z.string().describe("Language code (uk, ru, de, en, pl, fr, es, it, cs, ro)"),
    key: z.string().describe("Translation key (welcome, what_i_can, search_button, etc.)"),
    nameReplacement: z.string().describe("Value to replace {name} placeholder. Use empty string if not needed."),
  }),
  outputSchema: z.object({
    text: z.string(),
    found: z.boolean(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [getUITextTool] Getting text:", context);
    
    const lang = context.language.toLowerCase();
    const translations = UI_TRANSLATIONS[lang] || UI_TRANSLATIONS["en"];
    let text = translations[context.key] || UI_TRANSLATIONS["en"][context.key] || context.key;
    
    if (context.nameReplacement) {
      text = text.replace(/\{name\}/g, context.nameReplacement);
    }
    
    logger?.info("✅ [getUITextTool] Returning text");
    return { text, found: !!translations[context.key] };
  },
});

export const translateTextTool = createTool({
  id: "translate-text",
  description: "Translates product descriptions or any text to user's language using AI. Caches translations for efficiency.",
  inputSchema: z.object({
    text: z.string().describe("Text to translate"),
    targetLanguage: z.string().describe("Target language code (uk, ru, de, en, pl, fr, es, it, cs, ro)"),
    productId: z.string().describe("Product ID for caching. Pass empty string if not caching."),
  }),
  outputSchema: z.object({
    translatedText: z.string(),
    fromCache: z.boolean(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [translateTextTool] Translating to:", context.targetLanguage);
    
    try {
      if (context.productId) {
        const [cached] = await db
          .select()
          .from(translationCache)
          .where(
            and(
              eq(translationCache.productId, context.productId),
              eq(translationCache.language, context.targetLanguage)
            )
          );
        
        if (cached) {
          logger?.info("✅ [translateTextTool] Found cached translation");
          return { translatedText: cached.translatedText, fromCache: true };
        }
      }
      
      const languageNames: Record<string, string> = {
        uk: "Ukrainian",
        ru: "Russian",
        de: "German",
        en: "English",
        pl: "Polish",
        fr: "French",
        es: "Spanish",
        it: "Italian",
        cs: "Czech",
        ro: "Romanian",
      };
      
      const targetLangName = languageNames[context.targetLanguage] || "English";
      
      const { text: translatedText } = await generateText({
        model: openai("gpt-4o-mini"),
        prompt: `Translate the following product description to ${targetLangName}. Keep it concise and natural. Only output the translation, nothing else.

Text to translate:
${context.text}`,
      });
      
      if (context.productId) {
        await db.insert(translationCache).values({
          productId: context.productId,
          language: context.targetLanguage,
          originalText: context.text,
          translatedText: translatedText,
        });
      }
      
      logger?.info("✅ [translateTextTool] Translation complete");
      return { translatedText, fromCache: false };
    } catch (error) {
      logger?.error("❌ [translateTextTool] Error:", error);
      return { translatedText: context.text, fromCache: false };
    }
  },
});

export const formatProductMessageTool = createTool({
  id: "format-product-message",
  description: "Formats a product into a nice Telegram message with all details in user's language. Use this to display products.",
  inputSchema: z.object({
    product: z.object({
      title: z.string(),
      price: z.number(),
      originalPrice: z.number(),
      currency: z.string(),
      discount: z.number(),
      rating: z.number(),
      orders: z.number(),
      imageUrl: z.string(),
      affiliateUrl: z.string(),
      freeShipping: z.boolean(),
      colors: z.number().describe("Number of color options. Use 1 if unknown."),
    }),
    language: z.string().describe("User's language code"),
    index: z.number().describe("Product number in list (1-10). Use 0 for no index display."),
  }),
  outputSchema: z.object({
    message: z.string(),
    imageUrl: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [formatProductMessageTool] Formatting product");
    
    const lang = context.language.toLowerCase();
    const t = UI_TRANSLATIONS[lang] || UI_TRANSLATIONS["en"];
    const p = context.product;
    
    const indexStr = context.index ? `#${context.index} ` : "";
    const discountStr = p.discount > 0 ? ` (-${p.discount}%)` : "";
    const priceStr = p.discount > 0 
      ? `~${p.originalPrice}~ → ${p.price} ${p.currency}${discountStr}`
      : `${p.price} ${p.currency}`;
    const shippingStr = p.freeShipping ? t.free_shipping : "";
    const colorsStr = p.colors && p.colors > 1 ? `${t.colors_available}: ${p.colors}` : "";
    
    const message = `${indexStr}📦 *${p.title}*

${t.product_rating}: ${p.rating.toFixed(1)} ⭐
${t.product_orders}: ${p.orders.toLocaleString()}
${t.product_price}: ${priceStr}
${shippingStr ? `${t.product_shipping}: ${shippingStr}` : ""}
${colorsStr}

[${t.buy_now}](${p.affiliateUrl})`;
    
    logger?.info("✅ [formatProductMessageTool] Product formatted");
    return { message: message.trim(), imageUrl: p.imageUrl };
  },
});
