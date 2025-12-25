import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { buyWiseAgent } from "../agents/buyWiseAgent";
import { db } from "../../db";
import { users, favorites } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { searchProductsTool, getTopProductsTool } from "../tools/aliexpressSearchTool";

const productCache = new Map<string, { title: string; url: string; img: string; price: number }>();

const COUNTRY_BUTTONS = [
  [{ text: "🇺🇦 Україна", callback_data: "country:Ukraine" }, { text: "🇩🇪 Deutschland", callback_data: "country:Germany" }],
  [{ text: "🇵🇱 Polska", callback_data: "country:Poland" }, { text: "🇨🇿 Česko", callback_data: "country:Czechia" }],
  [{ text: "🇷🇴 România", callback_data: "country:Romania" }, { text: "🇫🇷 France", callback_data: "country:France" }],
  [{ text: "🇪🇸 España", callback_data: "country:Spain" }, { text: "🇮🇹 Italia", callback_data: "country:Italy" }],
  [{ text: "🇬🇧 UK", callback_data: "country:UK" }, { text: "🇺🇸 USA", callback_data: "country:USA" }],
];

const MAIN_MENU_BUTTONS = [
  [{ text: "🔍 Пошук", callback_data: "action:search" }, { text: "🔥 ТОП-10", callback_data: "action:top10" }],
  [{ text: "❤️ Обране", callback_data: "action:favorites" }, { text: "👤 Профіль", callback_data: "action:profile" }],
  [{ text: "🌐 Мова", callback_data: "action:language" }, { text: "💬 Підтримка", callback_data: "action:support" }],
];

const PROFILE_BUTTONS = [
  [{ text: "🌍 Змінити країну", callback_data: "settings:country" }],
  [{ text: "🌐 Змінити мову", callback_data: "action:language" }],
  [{ text: "🔙 Меню", callback_data: "action:menu" }],
];

const LANGUAGE_BUTTONS = [
  [{ text: "🇺🇦 Українська", callback_data: "lang:uk" }, { text: "🇷🇺 Русский", callback_data: "lang:ru" }],
  [{ text: "🇬🇧 English", callback_data: "lang:en" }, { text: "🇩🇪 Deutsch", callback_data: "lang:de" }],
  [{ text: "🇵🇱 Polski", callback_data: "lang:pl" }, { text: "🇫🇷 Français", callback_data: "lang:fr" }],
  [{ text: "🇪🇸 Español", callback_data: "lang:es" }, { text: "🇮🇹 Italiano", callback_data: "lang:it" }],
  [{ text: "🇨🇿 Čeština", callback_data: "lang:cs" }, { text: "🇷🇴 Română", callback_data: "lang:ro" }],
  [{ text: "🔙 Назад", callback_data: "action:menu" }],
];

const BACK_BUTTON = [
  [{ text: "🔙 Меню", callback_data: "action:menu" }],
];

interface LangTexts {
  welcome: string;
  chooseCountry: string;
  chooseLang: string;
  ready: string;
  search: string;
  profile: string;
  support: string;
  langChanged: string;
  noFavorites: string;
}

const LANG_TEXTS: Record<string, LangTexts> = {
  uk: {
    welcome: "👋 <b>Вітаю!</b> Я BuyWise - твій помічник для пошуку найкращих товарів на AliExpress.\n\n🔍 Шукай товари\n🔥 Дивись ТОП пропозиції\n❤️ Зберігай улюблене",
    chooseCountry: "🌍 Оберіть вашу країну для доставки:",
    chooseLang: "🌐 Оберіть мову:",
    ready: "✅ Готово! Тепер можу шукати товари для вас.",
    search: "🔍 <b>Пошук товарів</b>\n\nНапишіть що шукаєте:\n• навушники bluetooth\n• чохол iPhone 15\n• кросівки Nike",
    profile: "👤 <b>Ваш профіль</b>\n\n🌍 Країна: <b>{country}</b>\n💰 Валюта: <b>{currency}</b>\n🌐 Мова: <b>{language}</b>\n👤 Ім'я: <b>{name}</b>",
    support: "💬 <b>Підтримка</b>\n\nЯкщо у вас виникли питання або пропозиції, напишіть нам:\n\n📧 Email: support@buywise.bot\n💬 Telegram: @buywisesupport",
    langChanged: "✅ Мову змінено на Українську",
    noFavorites: "❤️ У вас поки немає обраних товарів.\n\nДодайте товари в обране натиснувши ❤️ під товаром.",
  },
  ru: {
    welcome: "👋 <b>Привет!</b> Я BuyWise - твой помощник для поиска лучших товаров на AliExpress.\n\n🔍 Ищи товары\n🔥 Смотри ТОП предложения\n❤️ Сохраняй избранное",
    chooseCountry: "🌍 Выберите вашу страну для доставки:",
    chooseLang: "🌐 Выберите язык:",
    ready: "✅ Готово! Теперь могу искать товары для вас.",
    search: "🔍 <b>Поиск товаров</b>\n\nНапишите что ищете:\n• наушники bluetooth\n• чехол iPhone 15\n• кроссовки Nike",
    profile: "👤 <b>Ваш профиль</b>\n\n🌍 Страна: <b>{country}</b>\n💰 Валюта: <b>{currency}</b>\n🌐 Язык: <b>{language}</b>\n👤 Имя: <b>{name}</b>",
    support: "💬 <b>Поддержка</b>\n\nЕсли у вас возникли вопросы или предложения, напишите нам:\n\n📧 Email: support@buywise.bot\n💬 Telegram: @buywisesupport",
    langChanged: "✅ Язык изменен на Русский",
    noFavorites: "❤️ У вас пока нет избранных товаров.\n\nДобавьте товары в избранное нажав ❤️ под товаром.",
  },
  en: {
    welcome: "👋 <b>Hello!</b> I'm BuyWise - your assistant for finding the best deals on AliExpress.\n\n🔍 Search products\n🔥 View TOP deals\n❤️ Save favorites",
    chooseCountry: "🌍 Choose your country for shipping:",
    chooseLang: "🌐 Choose your language:",
    ready: "✅ Done! Now I can search products for you.",
    search: "🔍 <b>Product Search</b>\n\nTell me what you're looking for:\n• bluetooth headphones\n• iPhone 15 case\n• Nike sneakers",
    profile: "👤 <b>Your Profile</b>\n\n🌍 Country: <b>{country}</b>\n💰 Currency: <b>{currency}</b>\n🌐 Language: <b>{language}</b>\n👤 Name: <b>{name}</b>",
    support: "💬 <b>Support</b>\n\nIf you have questions or suggestions, contact us:\n\n📧 Email: support@buywise.bot\n💬 Telegram: @buywisesupport",
    langChanged: "✅ Language changed to English",
    noFavorites: "❤️ You don't have any favorites yet.\n\nAdd products to favorites by tapping ❤️ below a product.",
  },
  de: {
    welcome: "👋 <b>Hallo!</b> Ich bin BuyWise - dein Assistent für die besten Angebote auf AliExpress.\n\n🔍 Produkte suchen\n🔥 TOP Angebote\n❤️ Favoriten speichern",
    chooseCountry: "🌍 Wählen Sie Ihr Land für den Versand:",
    chooseLang: "🌐 Sprache wählen:",
    ready: "✅ Fertig! Jetzt kann ich Produkte für Sie suchen.",
    search: "🔍 <b>Produktsuche</b>\n\nSchreiben Sie was Sie suchen:\n• Bluetooth Kopfhörer\n• iPhone 15 Hülle\n• Nike Schuhe",
    profile: "👤 <b>Ihr Profil</b>\n\n🌍 Land: <b>{country}</b>\n💰 Währung: <b>{currency}</b>\n🌐 Sprache: <b>{language}</b>\n👤 Name: <b>{name}</b>",
    support: "💬 <b>Support</b>\n\nBei Fragen oder Vorschlägen kontaktieren Sie uns:\n\n📧 Email: support@buywise.bot\n💬 Telegram: @buywisesupport",
    langChanged: "✅ Sprache auf Deutsch geändert",
    noFavorites: "❤️ Sie haben noch keine Favoriten.\n\nFügen Sie Produkte zu Favoriten hinzu, indem Sie ❤️ unter einem Produkt tippen.",
  },
  pl: {
    welcome: "👋 <b>Cześć!</b> Jestem BuyWise - twój asystent do znajdowania najlepszych ofert na AliExpress.\n\n🔍 Szukaj produktów\n🔥 TOP oferty\n❤️ Zapisuj ulubione",
    chooseCountry: "🌍 Wybierz swój kraj dostawy:",
    chooseLang: "🌐 Wybierz język:",
    ready: "✅ Gotowe! Teraz mogę szukać produktów dla Ciebie.",
    search: "🔍 <b>Szukaj produktów</b>\n\nNapisz czego szukasz:\n• słuchawki bluetooth\n• etui iPhone 15\n• buty Nike",
    profile: "👤 <b>Twój profil</b>\n\n🌍 Kraj: <b>{country}</b>\n💰 Waluta: <b>{currency}</b>\n🌐 Język: <b>{language}</b>\n👤 Imię: <b>{name}</b>",
    support: "💬 <b>Wsparcie</b>\n\nJeśli masz pytania lub sugestie, skontaktuj się z nami:\n\n📧 Email: support@buywise.bot\n💬 Telegram: @buywisesupport",
    langChanged: "✅ Język zmieniony na Polski",
    noFavorites: "❤️ Nie masz jeszcze ulubionych.\n\nDodaj produkty do ulubionych, klikając ❤️ pod produktem.",
  },
  fr: {
    welcome: "👋 <b>Bonjour!</b> Je suis BuyWise - votre assistant pour trouver les meilleures offres sur AliExpress.\n\n🔍 Rechercher des produits\n🔥 TOP offres\n❤️ Sauvegarder les favoris",
    chooseCountry: "🌍 Choisissez votre pays de livraison:",
    chooseLang: "🌐 Choisissez votre langue:",
    ready: "✅ C'est fait! Je peux maintenant rechercher des produits pour vous.",
    search: "🔍 <b>Recherche de produits</b>\n\nDites-moi ce que vous cherchez:\n• écouteurs bluetooth\n• coque iPhone 15\n• baskets Nike",
    profile: "👤 <b>Votre profil</b>\n\n🌍 Pays: <b>{country}</b>\n💰 Devise: <b>{currency}</b>\n🌐 Langue: <b>{language}</b>\n👤 Nom: <b>{name}</b>",
    support: "💬 <b>Support</b>\n\nSi vous avez des questions ou des suggestions, contactez-nous:\n\n📧 Email: support@buywise.bot\n💬 Telegram: @buywisesupport",
    langChanged: "✅ Langue changée en Français",
    noFavorites: "❤️ Vous n'avez pas encore de favoris.\n\nAjoutez des produits aux favoris en appuyant sur ❤️ sous un produit.",
  },
  es: {
    welcome: "👋 <b>¡Hola!</b> Soy BuyWise - tu asistente para encontrar las mejores ofertas en AliExpress.\n\n🔍 Buscar productos\n🔥 TOP ofertas\n❤️ Guardar favoritos",
    chooseCountry: "🌍 Elige tu país de envío:",
    chooseLang: "🌐 Elige tu idioma:",
    ready: "✅ ¡Listo! Ahora puedo buscar productos para ti.",
    search: "🔍 <b>Buscar productos</b>\n\nDime qué buscas:\n• auriculares bluetooth\n• funda iPhone 15\n• zapatillas Nike",
    profile: "👤 <b>Tu perfil</b>\n\n🌍 País: <b>{country}</b>\n💰 Moneda: <b>{currency}</b>\n🌐 Idioma: <b>{language}</b>\n👤 Nombre: <b>{name}</b>",
    support: "💬 <b>Soporte</b>\n\nSi tienes preguntas o sugerencias, contáctanos:\n\n📧 Email: support@buywise.bot\n💬 Telegram: @buywisesupport",
    langChanged: "✅ Idioma cambiado a Español",
    noFavorites: "❤️ Aún no tienes favoritos.\n\nAñade productos a favoritos tocando ❤️ debajo de un producto.",
  },
  it: {
    welcome: "👋 <b>Ciao!</b> Sono BuyWise - il tuo assistente per trovare le migliori offerte su AliExpress.\n\n🔍 Cerca prodotti\n🔥 TOP offerte\n❤️ Salva preferiti",
    chooseCountry: "🌍 Scegli il tuo paese di spedizione:",
    chooseLang: "🌐 Scegli la lingua:",
    ready: "✅ Fatto! Ora posso cercare prodotti per te.",
    search: "🔍 <b>Cerca prodotti</b>\n\nDimmi cosa cerchi:\n• cuffie bluetooth\n• custodia iPhone 15\n• scarpe Nike",
    profile: "👤 <b>Il tuo profilo</b>\n\n🌍 Paese: <b>{country}</b>\n💰 Valuta: <b>{currency}</b>\n🌐 Lingua: <b>{language}</b>\n👤 Nome: <b>{name}</b>",
    support: "💬 <b>Supporto</b>\n\nSe hai domande o suggerimenti, contattaci:\n\n📧 Email: support@buywise.bot\n💬 Telegram: @buywisesupport",
    langChanged: "✅ Lingua cambiata in Italiano",
    noFavorites: "❤️ Non hai ancora preferiti.\n\nAggiungi prodotti ai preferiti toccando ❤️ sotto un prodotto.",
  },
  cs: {
    welcome: "👋 <b>Ahoj!</b> Jsem BuyWise - tvůj asistent pro hledání nejlepších nabídek na AliExpress.\n\n🔍 Hledat produkty\n🔥 TOP nabídky\n❤️ Uložit oblíbené",
    chooseCountry: "🌍 Vyber svou zemi pro doručení:",
    chooseLang: "🌐 Vyber jazyk:",
    ready: "✅ Hotovo! Teď můžu hledat produkty pro tebe.",
    search: "🔍 <b>Hledat produkty</b>\n\nŘekni mi, co hledáš:\n• bluetooth sluchátka\n• pouzdro iPhone 15\n• boty Nike",
    profile: "👤 <b>Tvůj profil</b>\n\n🌍 Země: <b>{country}</b>\n💰 Měna: <b>{currency}</b>\n🌐 Jazyk: <b>{language}</b>\n👤 Jméno: <b>{name}</b>",
    support: "💬 <b>Podpora</b>\n\nMáš-li dotazy nebo návrhy, kontaktuj nás:\n\n📧 Email: support@buywise.bot\n💬 Telegram: @buywisesupport",
    langChanged: "✅ Jazyk změněn na Češtinu",
    noFavorites: "❤️ Zatím nemáš oblíbené.\n\nPřidej produkty do oblíbených kliknutím na ❤️ pod produktem.",
  },
  ro: {
    welcome: "👋 <b>Bună!</b> Sunt BuyWise - asistentul tău pentru a găsi cele mai bune oferte pe AliExpress.\n\n🔍 Caută produse\n🔥 TOP oferte\n❤️ Salvează favorite",
    chooseCountry: "🌍 Alege țara ta de livrare:",
    chooseLang: "🌐 Alege limba:",
    ready: "✅ Gata! Acum pot căuta produse pentru tine.",
    search: "🔍 <b>Caută produse</b>\n\nSpune-mi ce cauți:\n• căști bluetooth\n• husă iPhone 15\n• pantofi Nike",
    profile: "👤 <b>Profilul tău</b>\n\n🌍 Țară: <b>{country}</b>\n💰 Monedă: <b>{currency}</b>\n🌐 Limbă: <b>{language}</b>\n👤 Nume: <b>{name}</b>",
    support: "💬 <b>Suport</b>\n\nDacă ai întrebări sau sugestii, contactează-ne:\n\n📧 Email: support@buywise.bot\n💬 Telegram: @buywisesupport",
    langChanged: "✅ Limba schimbată în Română",
    noFavorites: "❤️ Nu ai încă favorite.\n\nAdaugă produse la favorite atingând ❤️ sub un produs.",
  },
};

const LANG_NAMES: Record<string, string> = {
  uk: "Українська",
  ru: "Русский", 
  en: "English",
  de: "Deutsch",
  pl: "Polski",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  cs: "Čeština",
  ro: "Română",
};

function getTexts(code: string): LangTexts {
  const lang = code?.toLowerCase().slice(0, 2) || "en";
  return LANG_TEXTS[lang] || LANG_TEXTS.en;
}

const processWithAgentStep = createStep({
  id: "process-with-agent",
  description: "Processes the incoming Telegram message using the BuyWise agent",
  
  inputSchema: z.object({
    telegramId: z.string(),
    userName: z.string().optional(),
    message: z.string(),
    chatId: z.string(),
    languageCode: z.string().optional(),
    isCallback: z.boolean().optional(),
    callbackData: z.string().optional(),
  }),
  
  outputSchema: z.object({
    response: z.string(),
    chatId: z.string(),
    success: z.boolean(),
    keyboard: z.string(),
    products: z.array(z.object({
      id: z.string(),
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
    })).optional(),
    telegramId: z.string().optional(),
  }),
  
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🚀 [Step 1] Processing", {
      telegramId: inputData.telegramId,
      message: inputData.message?.substring(0, 30),
      isCallback: inputData.isCallback,
    });
    
    const userLang = inputData.languageCode?.slice(0, 2) || "uk";
    
    try {
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, inputData.telegramId));
      
      const lang = existingUser?.language || userLang;
      const texts = getTexts(lang);
      
      if (inputData.isCallback && inputData.callbackData) {
        const [type, value] = inputData.callbackData.split(":");
        
        if (type === "country") {
          const COUNTRY_CURRENCY: Record<string, string> = {
            Ukraine: "UAH", Germany: "EUR", Poland: "PLN", Czechia: "CZK",
            Romania: "RON", France: "EUR", Spain: "EUR", Italy: "EUR", UK: "GBP", USA: "USD",
          };
          const currency = COUNTRY_CURRENCY[value] || "USD";
          
          if (existingUser) {
            await db.update(users).set({ 
              country: value, 
              currency, 
              updatedAt: new Date() 
            }).where(eq(users.telegramId, inputData.telegramId));
          } else {
            await db.insert(users).values({
              telegramId: inputData.telegramId,
              userName: inputData.userName || null,
              language: lang,
              country: value,
              currency,
              dailyTopEnabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          
          logger?.info("✅ [Step 1] Country saved:", value);
          return {
            response: texts.ready,
            chatId: inputData.chatId,
            success: true,
            keyboard: "main",
            telegramId: inputData.telegramId,
          };
        }
        
        if (type === "lang") {
          if (existingUser) {
            await db.update(users).set({ 
              language: value, 
              updatedAt: new Date() 
            }).where(eq(users.telegramId, inputData.telegramId));
          }
          const newTexts = getTexts(value);
          logger?.info("✅ [Step 1] Language changed:", value);
          return {
            response: newTexts.langChanged,
            chatId: inputData.chatId,
            success: true,
            keyboard: "main",
            telegramId: inputData.telegramId,
          };
        }
        
        if (type === "action") {
          switch (value) {
            case "search":
              return { response: texts.search, chatId: inputData.chatId, success: true, keyboard: "back", telegramId: inputData.telegramId };
            case "menu":
              return { response: "📱 <b>Головне меню</b>\n\nОберіть дію:", chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId };
            case "profile":
              if (existingUser) {
                const profileText = texts.profile
                  .replace("{country}", existingUser.country || "-")
                  .replace("{currency}", existingUser.currency)
                  .replace("{language}", LANG_NAMES[existingUser.language] || LANG_NAMES.en || existingUser.language)
                  .replace("{name}", existingUser.userName || inputData.userName || "-");
                return { response: profileText, chatId: inputData.chatId, success: true, keyboard: "profile", telegramId: inputData.telegramId };
              }
              return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId };
            case "language":
              return { response: texts.chooseLang, chatId: inputData.chatId, success: true, keyboard: "language", telegramId: inputData.telegramId };
            case "support":
              return { response: texts.support, chatId: inputData.chatId, success: true, keyboard: "back", telegramId: inputData.telegramId };
            case "favorites":
              if (!existingUser) {
                return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId };
              }
              const userFavs = await db
                .select()
                .from(favorites)
                .where(eq(favorites.userId, existingUser.id));
              
              if (userFavs.length === 0) {
                return { response: texts.noFavorites, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId };
              }
              
              const favProds = userFavs.map(f => ({
                id: f.productId,
                title: f.productTitle,
                price: f.currentPrice || 0,
                originalPrice: f.currentPrice || 0,
                currency: f.currency,
                discount: 0,
                rating: 0,
                orders: 0,
                imageUrl: f.productImage || "",
                affiliateUrl: f.productUrl,
                freeShipping: false,
              }));
              
              return {
                response: `❤️ <b>Обране (${favProds.length}):</b>`,
                chatId: inputData.chatId,
                success: true,
                keyboard: "main",
                products: favProds,
                telegramId: inputData.telegramId,
              };
            case "top10":
              break;
          }
        }
        
        if (type === "settings" && value === "country") {
          return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId };
        }
        
        if (type === "like") {
          if (!existingUser) {
            return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId };
          }
          
          const [existingFav] = await db
            .select()
            .from(favorites)
            .where(and(
              eq(favorites.userId, existingUser.id),
              eq(favorites.productId, value)
            ));
          
          if (existingFav) {
            await db.delete(favorites).where(eq(favorites.id, existingFav.id));
            logger?.info("✅ Removed from favorites:", value);
            return { response: "❌ Видалено з обраного", chatId: inputData.chatId, success: true, keyboard: "none", telegramId: inputData.telegramId };
          } else {
            const productInfo = productCache.get(value);
            await db.insert(favorites).values({
              userId: existingUser.id,
              productId: value,
              productTitle: productInfo?.title || "Product",
              productUrl: productInfo?.url || "",
              productImage: productInfo?.img || null,
              currentPrice: productInfo?.price || 0,
              currency: existingUser.currency,
              createdAt: new Date(),
            });
            logger?.info("✅ Added to favorites:", value);
            return { response: "❤️ Додано до обраного!", chatId: inputData.chatId, success: true, keyboard: "none", telegramId: inputData.telegramId };
          }
        }
      }
      
      const message = inputData.message || "";
      const texts2 = existingUser ? getTexts(existingUser.language) : getTexts(userLang);
      
      if (message === "/start") {
        if (!existingUser) {
          return {
            response: `${texts2.welcome}\n\n${texts2.chooseCountry}`,
            chatId: inputData.chatId,
            success: true,
            keyboard: "country",
            telegramId: inputData.telegramId,
          };
        }
        return {
          response: texts2.welcome,
          chatId: inputData.chatId,
          success: true,
          keyboard: "main",
          telegramId: inputData.telegramId,
        };
      }
      
      if (message === "/help") {
        return { response: texts2.support, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId };
      }
      
      if (message === "/profile") {
        if (existingUser) {
          const profileText = texts2.profile
            .replace("{country}", existingUser.country || "-")
            .replace("{currency}", existingUser.currency)
            .replace("{language}", LANG_NAMES[existingUser.language] || LANG_NAMES.en || existingUser.language)
            .replace("{name}", existingUser.userName || inputData.userName || "-");
          return { response: profileText, chatId: inputData.chatId, success: true, keyboard: "profile", telegramId: inputData.telegramId };
        }
        return { response: texts2.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId };
      }
      
      if (message === "/lang" || message === "/language") {
        return { response: texts2.chooseLang, chatId: inputData.chatId, success: true, keyboard: "language", telegramId: inputData.telegramId };
      }
      
      if (message === "/favorites" || message === "/fav") {
        if (!existingUser) {
          return { response: texts2.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId };
        }
        const userFavorites = await db
          .select()
          .from(favorites)
          .where(eq(favorites.userId, existingUser.id));
        
        if (userFavorites.length === 0) {
          return { response: texts2.noFavorites, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId };
        }
        
        const favProducts = userFavorites.map(f => ({
          id: f.productId,
          title: f.productTitle,
          price: f.currentPrice || 0,
          originalPrice: f.currentPrice || 0,
          currency: f.currency,
          discount: 0,
          rating: 0,
          orders: 0,
          imageUrl: f.productImage || "",
          affiliateUrl: f.productUrl,
          freeShipping: false,
        }));
        
        return {
          response: `❤️ <b>Ваші обрані товари (${favProducts.length}):</b>`,
          chatId: inputData.chatId,
          success: true,
          keyboard: "main",
          products: favProducts,
          telegramId: inputData.telegramId,
        };
      }
      
      if (!existingUser) {
        return {
          response: texts.chooseCountry,
          chatId: inputData.chatId,
          success: true,
          keyboard: "country",
          telegramId: inputData.telegramId,
        };
      }
      
      const isTop = message === "/top" || (inputData.isCallback && inputData.callbackData === "action:top10");
      const isSearch = message.length > 1 && !message.startsWith("/");
      
      if (isTop || isSearch) {
        logger?.info("🔍 [Step 1] Direct product search", { isTop, query: message });
        
        let products: any[] = [];
        
        if (isTop) {
          const result = await getTopProductsTool.execute({
            context: {
              country: existingUser.country,
              currency: existingUser.currency,
              category: "",
            },
            mastra,
            runtimeContext: {} as any,
          });
          if (result.success) {
            products = result.products.slice(0, 5);
          }
        } else {
          const result = await searchProductsTool.execute({
            context: {
              query: message,
              country: existingUser.country,
              currency: existingUser.currency,
              quality: "default",
              maxPrice: 0,
              freeShipping: false,
              onlyDiscount: false,
              preferCheaper: false,
            },
            mastra,
            runtimeContext: {} as any,
          });
          if (result.success) {
            products = result.products.slice(0, 5);
          }
        }
        
        logger?.info("✅ [Step 1] Products found", { count: products.length });
        
        if (products.length > 0) {
          const title = isTop ? `🔥 <b>ТОП-${products.length} товарів:</b>` : `🔍 <b>Знайдено ${products.length} товарів:</b>`;
          return {
            response: title,
            chatId: inputData.chatId,
            success: true,
            keyboard: "none",
            products,
            telegramId: inputData.telegramId,
          };
        }
        
        return {
          response: "😔 На жаль, нічого не знайдено. Спробуйте інший запит.",
          chatId: inputData.chatId,
          success: true,
          keyboard: "main",
          telegramId: inputData.telegramId,
        };
      }
      
      const fullPrompt = `[Telegram ID: ${inputData.telegramId}]\n[Language: ${inputData.languageCode || "uk"}]\n\nUser: ${message}`;
      
      const response = await buyWiseAgent.generateLegacy(fullPrompt, {
        resourceId: "telegram-bot",
        threadId: `telegram_${inputData.telegramId}`,
        maxSteps: 3,
      });
      
      const responseText = response.text || "Вибачте, сталася помилка. Спробуйте ще раз.";
      logger?.info("✅ [Step 1] Agent response", { length: responseText.length });
      
      return {
        response: responseText,
        chatId: inputData.chatId,
        success: true,
        keyboard: "main",
        telegramId: inputData.telegramId,
      };
    } catch (error) {
      logger?.error("❌ [Step 1] Error:", error);
      return {
        response: "Вибачте, сталася помилка. Спробуйте ще раз.",
        chatId: inputData.chatId,
        success: false,
        keyboard: "none",
        telegramId: inputData.telegramId,
      };
    }
  },
});

const sendToTelegramStep = createStep({
  id: "send-to-telegram",
  description: "Sends the response with inline buttons to Telegram",
  
  inputSchema: z.object({
    response: z.string(),
    chatId: z.string(),
    success: z.boolean(),
    keyboard: z.string(),
    products: z.array(z.object({
      id: z.string(),
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
    })).optional(),
    telegramId: z.string().optional(),
  }),
  
  outputSchema: z.object({
    sent: z.boolean(),
    messageId: z.number().optional(),
    error: z.string().optional(),
  }),
  
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📤 [Step 2] Sending to Telegram", { 
      chatId: inputData.chatId, 
      keyboard: inputData.keyboard,
      productsCount: inputData.products?.length || 0,
    });
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return { sent: false, error: "Bot token not configured" };
    }
    
    const sendMessage = async (text: string, keyboard?: any) => {
      const body: any = {
        chat_id: inputData.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      };
      if (keyboard) {
        body.reply_markup = { inline_keyboard: keyboard };
      }
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    };
    
    const sendPhoto = async (photoUrl: string, caption: string, keyboard: any) => {
      const body = {
        chat_id: inputData.chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard },
      };
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    };
    
    try {
      let inlineKeyboard = null;
      switch (inputData.keyboard) {
        case "country": inlineKeyboard = COUNTRY_BUTTONS; break;
        case "main": inlineKeyboard = MAIN_MENU_BUTTONS; break;
        case "profile": inlineKeyboard = PROFILE_BUTTONS; break;
        case "language": inlineKeyboard = LANGUAGE_BUTTONS; break;
        case "back": inlineKeyboard = BACK_BUTTON; break;
      }
      
      if (inputData.products && inputData.products.length > 0) {
        await sendMessage(inputData.response);
        
        for (const product of inputData.products) {
          const discount = product.discount > 0 ? ` <s>${product.originalPrice}</s> -${product.discount}%` : "";
          const shipping = product.freeShipping ? "🚚 Free" : "";
          const rating = product.rating > 0 ? `⭐ ${product.rating.toFixed(1)}` : "";
          const orders = product.orders > 0 ? `🛒 ${product.orders >= 1000 ? (product.orders / 1000).toFixed(1) + "K" : product.orders}` : "";
          
          const caption = `📦 <b>${product.title.slice(0, 100)}</b>\n\n💰 <b>${product.price} ${product.currency}</b>${discount}\n${[rating, orders, shipping].filter(Boolean).join(" | ")}`;
          
          productCache.set(product.id, {
            title: product.title.slice(0, 100),
            url: product.affiliateUrl,
            img: product.imageUrl,
            price: product.price,
          });
          
          const productButtons = [
            [
              { text: "🛒 Купити", url: product.affiliateUrl },
              { text: "❤️", callback_data: `like:${product.id.slice(0, 50)}` },
            ],
          ];
          
          if (product.imageUrl && !product.imageUrl.includes("placeholder")) {
            const photoResult = await sendPhoto(product.imageUrl, caption, productButtons);
            if (!photoResult.ok) {
              logger?.warn("⚠️ Photo failed, sending text", { error: photoResult.description });
              await sendMessage(caption, productButtons);
            }
          } else {
            await sendMessage(caption, productButtons);
          }
          
          await new Promise(r => setTimeout(r, 100));
        }
        
        await sendMessage("📱 Головне меню:", MAIN_MENU_BUTTONS);
        logger?.info("✅ [Step 2] Products sent");
        return { sent: true };
      }
      
      const result = await sendMessage(inputData.response, inlineKeyboard);
      
      if (result.ok) {
        logger?.info("✅ [Step 2] Sent successfully");
        return { sent: true, messageId: result.result?.message_id };
      } else {
        const plainResult = await sendMessage(inputData.response.replace(/<[^>]*>/g, ""), inlineKeyboard);
        if (plainResult.ok) {
          return { sent: true, messageId: plainResult.result?.message_id };
        }
        logger?.error("❌ [Step 2] Telegram error:", result);
        return { sent: false, error: result.description };
      }
    } catch (error) {
      logger?.error("❌ [Step 2] Error:", error);
      return { sent: false, error: String(error) };
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
    isCallback: z.boolean().optional(),
    callbackData: z.string().optional(),
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
