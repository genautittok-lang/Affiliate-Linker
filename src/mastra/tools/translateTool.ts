import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const openai = createOpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const translationCache = new Map<string, string>();

const SUPPORTED_LANGUAGES = ["uk", "ru", "de", "pl", "en", "fr", "es", "it", "cs", "ro"];

export const translateQueryTool = createTool({
  id: "translate-query",
  description: "Translates product search queries from any of 10 supported languages (Ukrainian, Russian, German, Polish, English, French, Spanish, Italian, Czech, Romanian) to English for AliExpress search.",
  inputSchema: z.object({
    query: z.string().describe("The search query in any language"),
    sourceLanguage: z.string().optional().describe("Source language code (uk, ru, de, pl, en, fr, es, it, cs, ro)"),
  }),
  outputSchema: z.object({
    translatedQuery: z.string(),
    detectedLanguage: z.string(),
    cached: z.boolean(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { query, sourceLanguage } = context;
    
    logger?.info(`🌐 [Translate] Input: "${query}", source: ${sourceLanguage || "auto"}`);
    
    if (/^[a-zA-Z0-9\s\-]+$/.test(query)) {
      logger?.info(`🌐 [Translate] Already English: "${query}"`);
      return { translatedQuery: query, detectedLanguage: "en", cached: false };
    }
    
    const cacheKey = query.toLowerCase().trim();
    if (translationCache.has(cacheKey)) {
      const cached = translationCache.get(cacheKey)!;
      logger?.info(`🌐 [Translate] Cache hit: "${query}" -> "${cached}"`);
      return { translatedQuery: cached, detectedLanguage: sourceLanguage || "auto", cached: true };
    }
    
    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        messages: [
          {
            role: "system",
            content: `You are a product search query translator. Translate the given query to English keywords suitable for AliExpress product search.
Rules:
- Output ONLY the translated keywords, nothing else
- Use common product terms (e.g., "sweater hoodie" not "knitted garment")
- Keep brand names as-is
- Add relevant search synonyms (2-4 words total)
- If input is already in English, return as-is
Examples:
"кофта" -> "sweater hoodie women"
"Kopfhörer bluetooth" -> "bluetooth headphones wireless"
"téléphone Samsung" -> "Samsung phone smartphone"`,
          },
          {
            role: "user",
            content: query,
          },
        ],
        maxTokens: 50,
      });
      
      const translated = result.text.trim().toLowerCase();
      logger?.info(`🌐 [Translate] AI result: "${query}" -> "${translated}"`);
      
      translationCache.set(cacheKey, translated);
      
      if (translationCache.size > 1000) {
        const firstKey = translationCache.keys().next().value;
        if (firstKey) translationCache.delete(firstKey);
      }
      
      return { translatedQuery: translated, detectedLanguage: sourceLanguage || "auto", cached: false };
      
    } catch (error) {
      logger?.error(`❌ [Translate] AI error:`, error);
      return { translatedQuery: query + " product", detectedLanguage: "unknown", cached: false };
    }
  },
});

export async function translateProductQuery(query: string): Promise<string> {
  if (/^[a-zA-Z0-9\s\-]+$/.test(query)) {
    return query;
  }
  
  const cacheKey = query.toLowerCase().trim();
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }
  
  try {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      messages: [
        {
          role: "system",
          content: `Translate to English product keywords for AliExpress. Output ONLY keywords, 2-4 words. Examples: "кофта" -> "sweater hoodie women", "Kopfhörer" -> "headphones wireless"`,
        },
        { role: "user", content: query },
      ],
      maxTokens: 30,
    });
    
    const translated = result.text.trim().toLowerCase();
    translationCache.set(cacheKey, translated);
    console.log(`🌐 [Translate] "${query}" -> "${translated}"`);
    return translated;
    
  } catch (error) {
    console.error(`❌ [Translate] Error:`, error);
    return query + " product";
  }
}

export const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  uk: {
    welcome: "👋 Вітаю! Я BuyWise - твій помічник для пошуку товарів на AliExpress.",
    chooseCountry: "🌍 Оберіть країну доставки:",
    chooseLanguage: "🌐 Оберіть мову:",
    searchPrompt: "🔍 Що шукаємо? Напишіть назву товару:",
    noProducts: "😔 Товарів не знайдено. Спробуйте інший запит.",
    top10: "🔥 ТОП-10 товарів сьогодні:",
    favorites: "❤️ Ваші улюблені товари:",
    noFavorites: "У вас ще немає улюблених товарів.",
    addedToFavorites: "✅ Додано до улюблених!",
    removedFromFavorites: "❌ Видалено з улюблених.",
    buy: "🛒 Купити",
    like: "❤️",
    unlike: "💔",
    next: "➡️ Далі",
    prev: "⬅️ Назад",
    profile: "👤 Профіль",
    settings: "⚙️ Налаштування",
    help: "❓ Допомога",
    price: "💰",
    discount: "🏷️",
    rating: "⭐",
    orders: "📦",
  },
  ru: {
    welcome: "👋 Привет! Я BuyWise - твой помощник для поиска товаров на AliExpress.",
    chooseCountry: "🌍 Выберите страну доставки:",
    chooseLanguage: "🌐 Выберите язык:",
    searchPrompt: "🔍 Что ищем? Напишите название товара:",
    noProducts: "😔 Товаров не найдено. Попробуйте другой запрос.",
    top10: "🔥 ТОП-10 товаров сегодня:",
    favorites: "❤️ Ваши избранные товары:",
    noFavorites: "У вас пока нет избранных товаров.",
    addedToFavorites: "✅ Добавлено в избранное!",
    removedFromFavorites: "❌ Удалено из избранного.",
    buy: "🛒 Купить",
    like: "❤️",
    unlike: "💔",
    next: "➡️ Далее",
    prev: "⬅️ Назад",
    profile: "👤 Профиль",
    settings: "⚙️ Настройки",
    help: "❓ Помощь",
    price: "💰",
    discount: "🏷️",
    rating: "⭐",
    orders: "📦",
  },
  en: {
    welcome: "👋 Hi! I'm BuyWise - your AliExpress product search assistant.",
    chooseCountry: "🌍 Choose your delivery country:",
    chooseLanguage: "🌐 Choose language:",
    searchPrompt: "🔍 What are you looking for? Type a product name:",
    noProducts: "😔 No products found. Try a different query.",
    top10: "🔥 TOP-10 products today:",
    favorites: "❤️ Your favorite products:",
    noFavorites: "You don't have any favorites yet.",
    addedToFavorites: "✅ Added to favorites!",
    removedFromFavorites: "❌ Removed from favorites.",
    buy: "🛒 Buy",
    like: "❤️",
    unlike: "💔",
    next: "➡️ Next",
    prev: "⬅️ Back",
    profile: "👤 Profile",
    settings: "⚙️ Settings",
    help: "❓ Help",
    price: "💰",
    discount: "🏷️",
    rating: "⭐",
    orders: "📦",
  },
  de: {
    welcome: "👋 Hallo! Ich bin BuyWise - dein AliExpress Produktsuch-Assistent.",
    chooseCountry: "🌍 Wähle dein Lieferland:",
    chooseLanguage: "🌐 Sprache wählen:",
    searchPrompt: "🔍 Was suchst du? Gib einen Produktnamen ein:",
    noProducts: "😔 Keine Produkte gefunden. Versuche eine andere Suche.",
    top10: "🔥 TOP-10 Produkte heute:",
    favorites: "❤️ Deine Favoriten:",
    noFavorites: "Du hast noch keine Favoriten.",
    addedToFavorites: "✅ Zu Favoriten hinzugefügt!",
    removedFromFavorites: "❌ Aus Favoriten entfernt.",
    buy: "🛒 Kaufen",
    like: "❤️",
    unlike: "💔",
    next: "➡️ Weiter",
    prev: "⬅️ Zurück",
    profile: "👤 Profil",
    settings: "⚙️ Einstellungen",
    help: "❓ Hilfe",
    price: "💰",
    discount: "🏷️",
    rating: "⭐",
    orders: "📦",
  },
  pl: {
    welcome: "👋 Cześć! Jestem BuyWise - twój asystent do wyszukiwania produktów na AliExpress.",
    chooseCountry: "🌍 Wybierz kraj dostawy:",
    chooseLanguage: "🌐 Wybierz język:",
    searchPrompt: "🔍 Czego szukasz? Wpisz nazwę produktu:",
    noProducts: "😔 Nie znaleziono produktów. Spróbuj innego zapytania.",
    top10: "🔥 TOP-10 produktów dzisiaj:",
    favorites: "❤️ Twoje ulubione produkty:",
    noFavorites: "Nie masz jeszcze ulubionych produktów.",
    addedToFavorites: "✅ Dodano do ulubionych!",
    removedFromFavorites: "❌ Usunięto z ulubionych.",
    buy: "🛒 Kup",
    like: "❤️",
    unlike: "💔",
    next: "➡️ Dalej",
    prev: "⬅️ Wstecz",
    profile: "👤 Profil",
    settings: "⚙️ Ustawienia",
    help: "❓ Pomoc",
    price: "💰",
    discount: "🏷️",
    rating: "⭐",
    orders: "📦",
  },
  fr: {
    welcome: "👋 Salut! Je suis BuyWise - ton assistant de recherche de produits AliExpress.",
    chooseCountry: "🌍 Choisissez votre pays de livraison:",
    chooseLanguage: "🌐 Choisir la langue:",
    searchPrompt: "🔍 Que cherchez-vous? Tapez un nom de produit:",
    noProducts: "😔 Aucun produit trouvé. Essayez une autre recherche.",
    top10: "🔥 TOP-10 produits aujourd'hui:",
    favorites: "❤️ Vos produits favoris:",
    noFavorites: "Vous n'avez pas encore de favoris.",
    addedToFavorites: "✅ Ajouté aux favoris!",
    removedFromFavorites: "❌ Retiré des favoris.",
    buy: "🛒 Acheter",
    like: "❤️",
    unlike: "💔",
    next: "➡️ Suivant",
    prev: "⬅️ Retour",
    profile: "👤 Profil",
    settings: "⚙️ Paramètres",
    help: "❓ Aide",
    price: "💰",
    discount: "🏷️",
    rating: "⭐",
    orders: "📦",
  },
  es: {
    welcome: "👋 ¡Hola! Soy BuyWise - tu asistente de búsqueda de productos de AliExpress.",
    chooseCountry: "🌍 Elige tu país de envío:",
    chooseLanguage: "🌐 Elegir idioma:",
    searchPrompt: "🔍 ¿Qué buscas? Escribe un nombre de producto:",
    noProducts: "😔 No se encontraron productos. Prueba otra búsqueda.",
    top10: "🔥 TOP-10 productos hoy:",
    favorites: "❤️ Tus productos favoritos:",
    noFavorites: "Aún no tienes favoritos.",
    addedToFavorites: "✅ ¡Añadido a favoritos!",
    removedFromFavorites: "❌ Eliminado de favoritos.",
    buy: "🛒 Comprar",
    like: "❤️",
    unlike: "💔",
    next: "➡️ Siguiente",
    prev: "⬅️ Atrás",
    profile: "👤 Perfil",
    settings: "⚙️ Ajustes",
    help: "❓ Ayuda",
    price: "💰",
    discount: "🏷️",
    rating: "⭐",
    orders: "📦",
  },
  it: {
    welcome: "👋 Ciao! Sono BuyWise - il tuo assistente per la ricerca di prodotti AliExpress.",
    chooseCountry: "🌍 Scegli il tuo paese di spedizione:",
    chooseLanguage: "🌐 Scegli la lingua:",
    searchPrompt: "🔍 Cosa cerchi? Scrivi il nome di un prodotto:",
    noProducts: "😔 Nessun prodotto trovato. Prova un'altra ricerca.",
    top10: "🔥 TOP-10 prodotti oggi:",
    favorites: "❤️ I tuoi prodotti preferiti:",
    noFavorites: "Non hai ancora preferiti.",
    addedToFavorites: "✅ Aggiunto ai preferiti!",
    removedFromFavorites: "❌ Rimosso dai preferiti.",
    buy: "🛒 Acquista",
    like: "❤️",
    unlike: "💔",
    next: "➡️ Avanti",
    prev: "⬅️ Indietro",
    profile: "👤 Profilo",
    settings: "⚙️ Impostazioni",
    help: "❓ Aiuto",
    price: "💰",
    discount: "🏷️",
    rating: "⭐",
    orders: "📦",
  },
  cs: {
    welcome: "👋 Ahoj! Jsem BuyWise - tvůj asistent pro vyhledávání produktů na AliExpress.",
    chooseCountry: "🌍 Vyber zemi doručení:",
    chooseLanguage: "🌐 Vybrat jazyk:",
    searchPrompt: "🔍 Co hledáš? Napiš název produktu:",
    noProducts: "😔 Žádné produkty nenalezeny. Zkus jiný dotaz.",
    top10: "🔥 TOP-10 produktů dnes:",
    favorites: "❤️ Tvoje oblíbené produkty:",
    noFavorites: "Zatím nemáš žádné oblíbené.",
    addedToFavorites: "✅ Přidáno do oblíbených!",
    removedFromFavorites: "❌ Odebráno z oblíbených.",
    buy: "🛒 Koupit",
    like: "❤️",
    unlike: "💔",
    next: "➡️ Další",
    prev: "⬅️ Zpět",
    profile: "👤 Profil",
    settings: "⚙️ Nastavení",
    help: "❓ Nápověda",
    price: "💰",
    discount: "🏷️",
    rating: "⭐",
    orders: "📦",
  },
  ro: {
    welcome: "👋 Bună! Sunt BuyWise - asistentul tău pentru căutarea produselor pe AliExpress.",
    chooseCountry: "🌍 Alege țara de livrare:",
    chooseLanguage: "🌐 Alege limba:",
    searchPrompt: "🔍 Ce cauți? Scrie numele produsului:",
    noProducts: "😔 Nu s-au găsit produse. Încearcă altă căutare.",
    top10: "🔥 TOP-10 produse azi:",
    favorites: "❤️ Produsele tale preferate:",
    noFavorites: "Nu ai încă produse preferate.",
    addedToFavorites: "✅ Adăugat la preferate!",
    removedFromFavorites: "❌ Șters din preferate.",
    buy: "🛒 Cumpără",
    like: "❤️",
    unlike: "💔",
    next: "➡️ Următorul",
    prev: "⬅️ Înapoi",
    profile: "👤 Profil",
    settings: "⚙️ Setări",
    help: "❓ Ajutor",
    price: "💰",
    discount: "🏷️",
    rating: "⭐",
    orders: "📦",
  },
};

export function getTranslation(lang: string, key: string): string {
  const langCode = lang.substring(0, 2).toLowerCase();
  const translations = UI_TRANSLATIONS[langCode] || UI_TRANSLATIONS.en;
  return translations[key] || UI_TRANSLATIONS.en[key] || key;
}
