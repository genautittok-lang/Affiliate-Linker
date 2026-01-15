import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { db } from "../../db";
import { users, searchHistory, favorites, referrals, coupons } from "../../db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { searchProductsTool, getTopProductsTool } from "../tools/aliexpressSearchTool";

const ADMIN_ID = "8210587392";

const LANG_TEXTS: Record<string, any> = {
  uk: {
    welcome: "Привіт, {name}! 🛍️ Я допоможу знайти найкращі товари з AliExpress. Обери країну:",
    welcomeBack: "З поверненням, {name}! 🎉 Готовий шукати?",
    mainMenu: "📱 Головне меню",
    search: "🔍 Пошук", top10: "🔥 ТОП-10", categories: "📂 Категорії", favorites: "❤️ Обране",
    profile: "👤 Профіль", support: "💬 Підтримка", back: "🔙 Меню",
    searchPrompt: "Що шукаємо? Напиши назву товару:",
    resultsFor: "🔍 Результати для",
    noResults: "😔 Нічого не знайдено. Спробуй інший запит.",
    buy: "🛒 Купити",
    catElectronics: "📱 Електроніка", catClothing: "👗 Одяг", catHome: "🏠 Дім",
    catBeauty: "💄 Краса", catGadgets: "🔌 Гаджети", catGifts: "🎁 Подарунки", catUnder10: "💰 До $10",
    favEmpty: "❤️ У тебе поки немає обраних товарів",
    favAdded: "✅ Додано в обране!",
    favRemoved: "❌ Видалено з обраного",
    profileTitle: "👤 Твій профіль",
    country: "🌍 Країна", language: "🌐 Мова", notifications: "🔔 Сповіщення",
    changeCountry: "🌍 Змінити країну", changeLang: "🌐 Змінити мову",
    notifOn: "🔔 Увімкнено", notifOff: "🔕 Вимкнено",
    enableNotif: "🔔 Увімкнути", disableNotif: "🔕 Вимкнути",
    referral: "👥 Запросити друзів",
    referralTitle: "🎁 Твоє реферальне посилання:",
    referralStats: "👥 Запрошено: {count} друзів",
    couponEarned: "🎉 Ти отримав купон на знижку!",
    couponProgress: "Ще {left} друзів до купона",
    yourCoupon: "🏷️ Твій купон: {code}",
    supportMsg: "💬 Зв'яжись з підтримкою:",
    recentSearches: "🕐 Нещодавні пошуки:",
    noSearchHistory: "Історія пошуку порожня",
    topTitle: "🔥 ТОП-10 товарів сьогодні:",
    countrySelected: "✅ Країну обрано! Тепер можна шукати.",
    langSelected: "✅ Мову змінено!",
    error: "❌ Помилка. Спробуй ще раз.",
  },
  ru: {
    welcome: "Привет, {name}! 🛍️ Я помогу найти лучшие товары с AliExpress. Выбери страну:",
    welcomeBack: "С возвращением, {name}! 🎉 Готов искать?",
    mainMenu: "📱 Главное меню",
    search: "🔍 Поиск", top10: "🔥 ТОП-10", categories: "📂 Категории", favorites: "❤️ Избранное",
    profile: "👤 Профиль", support: "💬 Поддержка", back: "🔙 Меню",
    searchPrompt: "Что ищем? Напиши название товара:",
    resultsFor: "🔍 Результаты для",
    noResults: "😔 Ничего не найдено. Попробуй другой запрос.",
    buy: "🛒 Купить",
    catElectronics: "📱 Электроника", catClothing: "👗 Одежда", catHome: "🏠 Дом",
    catBeauty: "💄 Красота", catGadgets: "🔌 Гаджеты", catGifts: "🎁 Подарки", catUnder10: "💰 До $10",
    favEmpty: "❤️ У тебя пока нет избранных товаров",
    favAdded: "✅ Добавлено в избранное!",
    favRemoved: "❌ Удалено из избранного",
    profileTitle: "👤 Твой профиль",
    country: "🌍 Страна", language: "🌐 Язык", notifications: "🔔 Уведомления",
    changeCountry: "🌍 Изменить страну", changeLang: "🌐 Изменить язык",
    notifOn: "🔔 Включено", notifOff: "🔕 Выключено",
    enableNotif: "🔔 Включить", disableNotif: "🔕 Выключить",
    referral: "👥 Пригласить друзей",
    referralTitle: "🎁 Твоя реферальная ссылка:",
    referralStats: "👥 Приглашено: {count} друзей",
    couponEarned: "🎉 Ты получил купон на скидку!",
    couponProgress: "Ещё {left} друзей до купона",
    yourCoupon: "🏷️ Твой купон: {code}",
    supportMsg: "💬 Свяжись с поддержкой:",
    recentSearches: "🕐 Недавние поиски:",
    noSearchHistory: "История поиска пуста",
    topTitle: "🔥 ТОП-10 товаров сегодня:",
    countrySelected: "✅ Страна выбрана! Теперь можно искать.",
    langSelected: "✅ Язык изменён!",
    error: "❌ Ошибка. Попробуй ещё раз.",
  },
  en: {
    welcome: "Hi {name}! 🛍️ I'll help you find the best AliExpress deals. Choose your country:",
    welcomeBack: "Welcome back, {name}! 🎉 Ready to shop?",
    mainMenu: "📱 Main Menu",
    search: "🔍 Search", top10: "🔥 TOP-10", categories: "📂 Categories", favorites: "❤️ Favorites",
    profile: "👤 Profile", support: "💬 Support", back: "🔙 Menu",
    searchPrompt: "What are you looking for?",
    resultsFor: "🔍 Results for",
    noResults: "😔 Nothing found. Try another query.",
    buy: "🛒 Buy",
    catElectronics: "📱 Electronics", catClothing: "👗 Clothing", catHome: "🏠 Home",
    catBeauty: "💄 Beauty", catGadgets: "🔌 Gadgets", catGifts: "🎁 Gifts", catUnder10: "💰 Under $10",
    favEmpty: "❤️ No favorites yet",
    favAdded: "✅ Added to favorites!",
    favRemoved: "❌ Removed from favorites",
    profileTitle: "👤 Your Profile",
    country: "🌍 Country", language: "🌐 Language", notifications: "🔔 Notifications",
    changeCountry: "🌍 Change Country", changeLang: "🌐 Change Language",
    notifOn: "🔔 On", notifOff: "🔕 Off",
    enableNotif: "🔔 Enable", disableNotif: "🔕 Disable",
    referral: "👥 Invite Friends",
    referralTitle: "🎁 Your referral link:",
    referralStats: "👥 Invited: {count} friends",
    couponEarned: "🎉 You earned a discount coupon!",
    couponProgress: "{left} more friends for coupon",
    yourCoupon: "🏷️ Your coupon: {code}",
    supportMsg: "💬 Contact support:",
    recentSearches: "🕐 Recent searches:",
    noSearchHistory: "No search history",
    topTitle: "🔥 TOP-10 deals today:",
    countrySelected: "✅ Country selected! Ready to search.",
    langSelected: "✅ Language changed!",
    error: "❌ Error. Please try again.",
  },
  de: {
    welcome: "Hallo {name}! 🛍️ Ich helfe dir, die besten AliExpress-Angebote zu finden. Wähle dein Land:",
    welcomeBack: "Willkommen zurück, {name}! 🎉",
    mainMenu: "📱 Hauptmenü",
    search: "🔍 Suche", top10: "🔥 TOP-10", categories: "📂 Kategorien", favorites: "❤️ Favoriten",
    profile: "👤 Profil", support: "💬 Support", back: "🔙 Menü",
    searchPrompt: "Was suchst du?",
    resultsFor: "🔍 Ergebnisse für",
    noResults: "😔 Nichts gefunden.",
    buy: "🛒 Kaufen",
    catElectronics: "📱 Elektronik", catClothing: "👗 Kleidung", catHome: "🏠 Zuhause",
    catBeauty: "💄 Schönheit", catGadgets: "🔌 Gadgets", catGifts: "🎁 Geschenke", catUnder10: "💰 Unter $10",
    favEmpty: "❤️ Noch keine Favoriten",
    favAdded: "✅ Zu Favoriten hinzugefügt!",
    favRemoved: "❌ Aus Favoriten entfernt",
    profileTitle: "👤 Dein Profil",
    country: "🌍 Land", language: "🌐 Sprache", notifications: "🔔 Benachrichtigungen",
    changeCountry: "🌍 Land ändern", changeLang: "🌐 Sprache ändern",
    notifOn: "🔔 An", notifOff: "🔕 Aus",
    enableNotif: "🔔 Aktivieren", disableNotif: "🔕 Deaktivieren",
    referral: "👥 Freunde einladen",
    referralTitle: "🎁 Dein Empfehlungslink:",
    referralStats: "👥 Eingeladen: {count} Freunde",
    couponEarned: "🎉 Du hast einen Rabattcoupon erhalten!",
    couponProgress: "Noch {left} Freunde bis zum Coupon",
    yourCoupon: "🏷️ Dein Coupon: {code}",
    supportMsg: "💬 Kontaktiere Support:",
    recentSearches: "🕐 Letzte Suchen:",
    noSearchHistory: "Kein Suchverlauf",
    topTitle: "🔥 TOP-10 Angebote heute:",
    countrySelected: "✅ Land ausgewählt!",
    langSelected: "✅ Sprache geändert!",
    error: "❌ Fehler. Bitte erneut versuchen.",
  },
  pl: {
    welcome: "Cześć {name}! 🛍️ Pomogę Ci znaleźć najlepsze oferty. Wybierz kraj:",
    welcomeBack: "Witaj ponownie, {name}! 🎉",
    mainMenu: "📱 Menu główne",
    search: "🔍 Szukaj", top10: "🔥 TOP-10", categories: "📂 Kategorie", favorites: "❤️ Ulubione",
    profile: "👤 Profil", support: "💬 Wsparcie", back: "🔙 Menu",
    searchPrompt: "Czego szukasz?",
    resultsFor: "🔍 Wyniki dla",
    noResults: "😔 Nic nie znaleziono.",
    buy: "🛒 Kup",
    catElectronics: "📱 Elektronika", catClothing: "👗 Odzież", catHome: "🏠 Dom",
    catBeauty: "💄 Uroda", catGadgets: "🔌 Gadżety", catGifts: "🎁 Prezenty", catUnder10: "💰 Do $10",
    favEmpty: "❤️ Brak ulubionych",
    favAdded: "✅ Dodano do ulubionych!",
    favRemoved: "❌ Usunięto z ulubionych",
    profileTitle: "👤 Twój profil",
    country: "🌍 Kraj", language: "🌐 Język", notifications: "🔔 Powiadomienia",
    changeCountry: "🌍 Zmień kraj", changeLang: "🌐 Zmień język",
    notifOn: "🔔 Wł.", notifOff: "🔕 Wył.",
    enableNotif: "🔔 Włącz", disableNotif: "🔕 Wyłącz",
    referral: "👥 Zaproś znajomych",
    referralTitle: "🎁 Twój link polecający:",
    referralStats: "👥 Zaproszono: {count} znajomych",
    couponEarned: "🎉 Otrzymałeś kupon rabatowy!",
    couponProgress: "Jeszcze {left} znajomych do kuponu",
    yourCoupon: "🏷️ Twój kupon: {code}",
    supportMsg: "💬 Skontaktuj się z pomocą:",
    recentSearches: "🕐 Ostatnie wyszukiwania:",
    noSearchHistory: "Brak historii wyszukiwania",
    topTitle: "🔥 TOP-10 ofert dzisiaj:",
    countrySelected: "✅ Kraj wybrany!",
    langSelected: "✅ Język zmieniony!",
    error: "❌ Błąd. Spróbuj ponownie.",
  },
  fr: {
    welcome: "Salut {name}! 🛍️ Je t'aide à trouver les meilleures offres. Choisis ton pays:",
    welcomeBack: "Content de te revoir, {name}! 🎉",
    mainMenu: "📱 Menu principal",
    search: "🔍 Rechercher", top10: "🔥 TOP-10", categories: "📂 Catégories", favorites: "❤️ Favoris",
    profile: "👤 Profil", support: "💬 Support", back: "🔙 Menu",
    searchPrompt: "Que cherches-tu?",
    resultsFor: "🔍 Résultats pour",
    noResults: "😔 Rien trouvé.",
    buy: "🛒 Acheter",
    catElectronics: "📱 Électronique", catClothing: "👗 Vêtements", catHome: "🏠 Maison",
    catBeauty: "💄 Beauté", catGadgets: "🔌 Gadgets", catGifts: "🎁 Cadeaux", catUnder10: "💰 Moins de $10",
    favEmpty: "❤️ Pas de favoris",
    favAdded: "✅ Ajouté aux favoris!",
    favRemoved: "❌ Supprimé des favoris",
    profileTitle: "👤 Ton profil",
    country: "🌍 Pays", language: "🌐 Langue", notifications: "🔔 Notifications",
    changeCountry: "🌍 Changer de pays", changeLang: "🌐 Changer de langue",
    notifOn: "🔔 Activé", notifOff: "🔕 Désactivé",
    enableNotif: "🔔 Activer", disableNotif: "🔕 Désactiver",
    referral: "👥 Inviter des amis",
    referralTitle: "🎁 Ton lien de parrainage:",
    referralStats: "👥 Invités: {count} amis",
    couponEarned: "🎉 Tu as gagné un coupon!",
    couponProgress: "Encore {left} amis pour le coupon",
    yourCoupon: "🏷️ Ton coupon: {code}",
    supportMsg: "💬 Contacte le support:",
    recentSearches: "🕐 Recherches récentes:",
    noSearchHistory: "Pas d'historique",
    topTitle: "🔥 TOP-10 offres du jour:",
    countrySelected: "✅ Pays sélectionné!",
    langSelected: "✅ Langue changée!",
    error: "❌ Erreur. Réessaie.",
  },
  es: {
    welcome: "¡Hola {name}! 🛍️ Te ayudo a encontrar las mejores ofertas. Elige tu país:",
    welcomeBack: "¡Bienvenido de nuevo, {name}! 🎉",
    mainMenu: "📱 Menú principal",
    search: "🔍 Buscar", top10: "🔥 TOP-10", categories: "📂 Categorías", favorites: "❤️ Favoritos",
    profile: "👤 Perfil", support: "💬 Soporte", back: "🔙 Menú",
    searchPrompt: "¿Qué buscas?",
    resultsFor: "🔍 Resultados para",
    noResults: "😔 Nada encontrado.",
    buy: "🛒 Comprar",
    catElectronics: "📱 Electrónica", catClothing: "👗 Ropa", catHome: "🏠 Hogar",
    catBeauty: "💄 Belleza", catGadgets: "🔌 Gadgets", catGifts: "🎁 Regalos", catUnder10: "💰 Menos de $10",
    favEmpty: "❤️ Sin favoritos",
    favAdded: "✅ ¡Añadido a favoritos!",
    favRemoved: "❌ Eliminado de favoritos",
    profileTitle: "👤 Tu perfil",
    country: "🌍 País", language: "🌐 Idioma", notifications: "🔔 Notificaciones",
    changeCountry: "🌍 Cambiar país", changeLang: "🌐 Cambiar idioma",
    notifOn: "🔔 Activado", notifOff: "🔕 Desactivado",
    enableNotif: "🔔 Activar", disableNotif: "🔕 Desactivar",
    referral: "👥 Invitar amigos",
    referralTitle: "🎁 Tu enlace de referido:",
    referralStats: "👥 Invitados: {count} amigos",
    couponEarned: "🎉 ¡Ganaste un cupón!",
    couponProgress: "Faltan {left} amigos para el cupón",
    yourCoupon: "🏷️ Tu cupón: {code}",
    supportMsg: "💬 Contacta soporte:",
    recentSearches: "🕐 Búsquedas recientes:",
    noSearchHistory: "Sin historial",
    topTitle: "🔥 TOP-10 ofertas de hoy:",
    countrySelected: "✅ ¡País seleccionado!",
    langSelected: "✅ ¡Idioma cambiado!",
    error: "❌ Error. Inténtalo de nuevo.",
  },
  it: {
    welcome: "Ciao {name}! 🛍️ Ti aiuto a trovare le migliori offerte. Scegli il tuo paese:",
    welcomeBack: "Bentornato, {name}! 🎉",
    mainMenu: "📱 Menu principale",
    search: "🔍 Cerca", top10: "🔥 TOP-10", categories: "📂 Categorie", favorites: "❤️ Preferiti",
    profile: "👤 Profilo", support: "💬 Supporto", back: "🔙 Menu",
    searchPrompt: "Cosa cerchi?",
    resultsFor: "🔍 Risultati per",
    noResults: "😔 Niente trovato.",
    buy: "🛒 Compra",
    catElectronics: "📱 Elettronica", catClothing: "👗 Abbigliamento", catHome: "🏠 Casa",
    catBeauty: "💄 Bellezza", catGadgets: "🔌 Gadget", catGifts: "🎁 Regali", catUnder10: "💰 Sotto $10",
    favEmpty: "❤️ Nessun preferito",
    favAdded: "✅ Aggiunto ai preferiti!",
    favRemoved: "❌ Rimosso dai preferiti",
    profileTitle: "👤 Il tuo profilo",
    country: "🌍 Paese", language: "🌐 Lingua", notifications: "🔔 Notifiche",
    changeCountry: "🌍 Cambia paese", changeLang: "🌐 Cambia lingua",
    notifOn: "🔔 Attivo", notifOff: "🔕 Disattivo",
    enableNotif: "🔔 Attiva", disableNotif: "🔕 Disattiva",
    referral: "👥 Invita amici",
    referralTitle: "🎁 Il tuo link referral:",
    referralStats: "👥 Invitati: {count} amici",
    couponEarned: "🎉 Hai guadagnato un coupon!",
    couponProgress: "Altri {left} amici per il coupon",
    yourCoupon: "🏷️ Il tuo coupon: {code}",
    supportMsg: "💬 Contatta supporto:",
    recentSearches: "🕐 Ricerche recenti:",
    noSearchHistory: "Nessuna cronologia",
    topTitle: "🔥 TOP-10 offerte di oggi:",
    countrySelected: "✅ Paese selezionato!",
    langSelected: "✅ Lingua cambiata!",
    error: "❌ Errore. Riprova.",
  },
  cs: {
    welcome: "Ahoj {name}! 🛍️ Pomohu ti najít nejlepší nabídky. Vyber svou zemi:",
    welcomeBack: "Vítej zpět, {name}! 🎉",
    mainMenu: "📱 Hlavní menu",
    search: "🔍 Hledat", top10: "🔥 TOP-10", categories: "📂 Kategorie", favorites: "❤️ Oblíbené",
    profile: "👤 Profil", support: "💬 Podpora", back: "🔙 Menu",
    searchPrompt: "Co hledáš?",
    resultsFor: "🔍 Výsledky pro",
    noResults: "😔 Nic nenalezeno.",
    buy: "🛒 Koupit",
    catElectronics: "📱 Elektronika", catClothing: "👗 Oblečení", catHome: "🏠 Domov",
    catBeauty: "💄 Krása", catGadgets: "🔌 Gadgety", catGifts: "🎁 Dárky", catUnder10: "💰 Do $10",
    favEmpty: "❤️ Žádné oblíbené",
    favAdded: "✅ Přidáno do oblíbených!",
    favRemoved: "❌ Odebráno z oblíbených",
    profileTitle: "👤 Tvůj profil",
    country: "🌍 Země", language: "🌐 Jazyk", notifications: "🔔 Oznámení",
    changeCountry: "🌍 Změnit zemi", changeLang: "🌐 Změnit jazyk",
    notifOn: "🔔 Zapnuto", notifOff: "🔕 Vypnuto",
    enableNotif: "🔔 Zapnout", disableNotif: "🔕 Vypnout",
    referral: "👥 Pozvat přátele",
    referralTitle: "🎁 Tvůj referenční odkaz:",
    referralStats: "👥 Pozváno: {count} přátel",
    couponEarned: "🎉 Získal jsi kupon!",
    couponProgress: "Ještě {left} přátel do kuponu",
    yourCoupon: "🏷️ Tvůj kupon: {code}",
    supportMsg: "💬 Kontaktuj podporu:",
    recentSearches: "🕐 Poslední hledání:",
    noSearchHistory: "Žádná historie",
    topTitle: "🔥 TOP-10 nabídek dnes:",
    countrySelected: "✅ Země vybrána!",
    langSelected: "✅ Jazyk změněn!",
    error: "❌ Chyba. Zkus to znovu.",
  },
  ro: {
    welcome: "Salut {name}! 🛍️ Te ajut să găsești cele mai bune oferte. Alege țara:",
    welcomeBack: "Bine ai revenit, {name}! 🎉",
    mainMenu: "📱 Meniu principal",
    search: "🔍 Caută", top10: "🔥 TOP-10", categories: "📂 Categorii", favorites: "❤️ Favorite",
    profile: "👤 Profil", support: "💬 Suport", back: "🔙 Meniu",
    searchPrompt: "Ce cauți?",
    resultsFor: "🔍 Rezultate pentru",
    noResults: "😔 Nimic găsit.",
    buy: "🛒 Cumpără",
    catElectronics: "📱 Electronică", catClothing: "👗 Îmbrăcăminte", catHome: "🏠 Casă",
    catBeauty: "💄 Frumusețe", catGadgets: "🔌 Gadgeturi", catGifts: "🎁 Cadouri", catUnder10: "💰 Sub $10",
    favEmpty: "❤️ Niciun favorit",
    favAdded: "✅ Adăugat la favorite!",
    favRemoved: "❌ Eliminat din favorite",
    profileTitle: "👤 Profilul tău",
    country: "🌍 Țară", language: "🌐 Limbă", notifications: "🔔 Notificări",
    changeCountry: "🌍 Schimbă țara", changeLang: "🌐 Schimbă limba",
    notifOn: "🔔 Activat", notifOff: "🔕 Dezactivat",
    enableNotif: "🔔 Activează", disableNotif: "🔕 Dezactivează",
    referral: "👥 Invită prieteni",
    referralTitle: "🎁 Linkul tău de referință:",
    referralStats: "👥 Invitați: {count} prieteni",
    couponEarned: "🎉 Ai câștigat un cupon!",
    couponProgress: "Încă {left} prieteni pentru cupon",
    yourCoupon: "🏷️ Cuponul tău: {code}",
    supportMsg: "💬 Contactează suportul:",
    recentSearches: "🕐 Căutări recente:",
    noSearchHistory: "Fără istoric",
    topTitle: "🔥 TOP-10 oferte azi:",
    countrySelected: "✅ Țară selectată!",
    langSelected: "✅ Limba schimbată!",
    error: "❌ Eroare. Încearcă din nou.",
  },
};

const COUNTRY_CURRENCY: Record<string, string> = {
  Ukraine: "UAH", Germany: "EUR", Poland: "PLN", Czechia: "CZK", Romania: "RON",
  France: "EUR", Spain: "EUR", Italy: "EUR", UK: "GBP", USA: "USD",
};

const COUNTRY_LANG: Record<string, string> = {
  Ukraine: "uk", Germany: "de", Poland: "pl", Czechia: "cs", Romania: "ro",
  France: "fr", Spain: "es", Italy: "it", UK: "en", USA: "en",
};

function getText(lang: string, key: string, params?: Record<string, any>): string {
  const texts = LANG_TEXTS[lang] || LANG_TEXTS.en;
  let text = texts[key] || LANG_TEXTS.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

function getMainMenuButtons(lang: string) {
  const t = LANG_TEXTS[lang] || LANG_TEXTS.en;
  return [
    [{ text: t.search, callback_data: "action:search" }, { text: t.top10, callback_data: "action:top10" }],
    [{ text: t.categories, callback_data: "action:categories" }, { text: t.favorites, callback_data: "action:favorites" }],
    [{ text: t.profile, callback_data: "action:profile" }, { text: t.support, callback_data: "action:support" }],
  ];
}

function getCategoryButtons(lang: string) {
  const t = LANG_TEXTS[lang] || LANG_TEXTS.en;
  return [
    [{ text: t.catElectronics, callback_data: "cat:electronics" }, { text: t.catClothing, callback_data: "cat:clothing" }],
    [{ text: t.catHome, callback_data: "cat:home" }, { text: t.catBeauty, callback_data: "cat:beauty" }],
    [{ text: t.catGadgets, callback_data: "cat:gadgets" }, { text: t.catGifts, callback_data: "cat:gifts" }],
    [{ text: t.catUnder10, callback_data: "cat:under10" }],
    [{ text: t.back, callback_data: "action:menu" }],
  ];
}

function getProfileButtons(lang: string, dailyTopEnabled: boolean) {
  const t = LANG_TEXTS[lang] || LANG_TEXTS.en;
  return [
    [{ text: t.changeCountry, callback_data: "action:change_country" }],
    [{ text: t.changeLang, callback_data: "action:change_lang" }],
    [{ text: dailyTopEnabled ? t.disableNotif : t.enableNotif, callback_data: dailyTopEnabled ? "toggle:daily_off" : "toggle:daily_on" }],
    [{ text: t.referral, callback_data: "action:referral" }],
    [{ text: t.back, callback_data: "action:menu" }],
  ];
}

function getLangButtons() {
  return [
    [{ text: "🇺🇦 Українська", callback_data: "lang:uk" }, { text: "🇷🇺 Русский", callback_data: "lang:ru" }],
    [{ text: "🇬🇧 English", callback_data: "lang:en" }, { text: "🇩🇪 Deutsch", callback_data: "lang:de" }],
    [{ text: "🇵🇱 Polski", callback_data: "lang:pl" }, { text: "🇫🇷 Français", callback_data: "lang:fr" }],
    [{ text: "🇪🇸 Español", callback_data: "lang:es" }, { text: "🇮🇹 Italiano", callback_data: "lang:it" }],
    [{ text: "🇨🇿 Čeština", callback_data: "lang:cs" }, { text: "🇷🇴 Română", callback_data: "lang:ro" }],
  ];
}

const COUNTRY_BUTTONS = [
  [{ text: "🇺🇦 Україна", callback_data: "country:Ukraine" }, { text: "🇩🇪 Deutschland", callback_data: "country:Germany" }],
  [{ text: "🇵🇱 Polska", callback_data: "country:Poland" }, { text: "🇨🇿 Česko", callback_data: "country:Czechia" }],
  [{ text: "🇷🇴 România", callback_data: "country:Romania" }, { text: "🇫🇷 France", callback_data: "country:France" }],
  [{ text: "🇪🇸 España", callback_data: "country:Spain" }, { text: "🇮🇹 Italia", callback_data: "country:Italy" }],
  [{ text: "🇬🇧 UK", callback_data: "country:UK" }, { text: "🇺🇸 USA", callback_data: "country:USA" }],
];

const CATEGORY_KEYWORDS: Record<string, string> = {
  electronics: "smartphone tablet headphones",
  clothing: "fashion dress shirt",
  home: "home decor kitchen",
  beauty: "makeup skincare beauty",
  gadgets: "gadgets tools accessories",
  gifts: "gift set present",
  under10: "deals",
};

const responseSchema = z.object({
  response: z.string(),
  chatId: z.string(),
  keyboard: z.string().optional(),
  lang: z.string().optional(),
  dailyTopEnabled: z.boolean().optional(),
  products: z.array(z.any()).optional(),
  favorites: z.array(z.any()).optional(),
  searchHistory: z.array(z.any()).optional(),
});

const processMessageStep = createStep({
  id: "process-message",
  inputSchema: z.object({
    message: z.string().optional(),
    chatId: z.string(),
    telegramId: z.string(),
    isCallback: z.boolean(),
    callbackData: z.string().optional(),
    userName: z.string().optional(),
    languageCode: z.string().optional(),
  }),
  outputSchema: responseSchema,
  execute: async ({ inputData, mastra }) => {
    const { message, chatId, telegramId, isCallback, callbackData, userName } = inputData;
    const firstName = userName || "Friend";

    try {
      let [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
      const lang = user?.language || "en";
      const t = (key: string, params?: any) => getText(lang, key, params);

      if (message?.startsWith("/start")) {
        const parts = message.split(" ");
        const refCode = parts[1];

        if (!user) {
          const newRefCode = "BW" + Math.random().toString(36).substr(2, 6).toUpperCase();
          let referredById: number | null = null;

          if (refCode) {
            const [referrer] = await db.select().from(users).where(eq(users.referralCode, refCode)).limit(1);
            if (referrer) referredById = referrer.id;
          }

          await db.insert(users).values({
            telegramId,
            firstName,
            language: "uk",
            country: "",
            currency: "USD",
            referralCode: newRefCode,
            referredBy: referredById,
          });

          if (referredById) {
            const [newUser] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
            if (newUser) {
              await db.insert(referrals).values({ referrerId: referredById, referredId: newUser.id });
              const refCount = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(eq(referrals.referrerId, referredById));
              if (refCount[0]?.count >= 5) {
                const [existingCoupon] = await db.select().from(coupons).where(eq(coupons.userId, referredById)).limit(1);
                if (!existingCoupon) {
                  const couponCode = `BW5-${referredById}-${Date.now().toString(36).toUpperCase()}`;
                  await db.insert(coupons).values({ userId: referredById, code: couponCode, discountPercent: 5, earnedForReferrals: 5 });
                }
              }
            }
          }

          return { response: t("welcome", { name: firstName }), chatId, keyboard: "country", lang: "uk" };
        }

        return { response: t("welcomeBack", { name: user.firstName || firstName }), chatId, keyboard: "main", lang };
      }

      if (!user) {
        return { response: getText("uk", "welcome", { name: firstName }), chatId, keyboard: "country", lang: "uk" };
      }

      if (isCallback && callbackData) {
        const [type, value] = callbackData.split(":");

        if (type === "country") {
          const currency = COUNTRY_CURRENCY[value] || "USD";
          const newLang = COUNTRY_LANG[value] || "en";
          await db.update(users).set({ country: value, currency, language: newLang }).where(eq(users.telegramId, telegramId));
          return { response: getText(newLang, "countrySelected"), chatId, keyboard: "main", lang: newLang };
        }

        if (type === "lang") {
          await db.update(users).set({ language: value }).where(eq(users.telegramId, telegramId));
          return { response: getText(value, "langSelected"), chatId, keyboard: "main", lang: value };
        }

        if (type === "toggle") {
          const enabled = value === "daily_on";
          await db.update(users).set({ dailyTopEnabled: enabled }).where(eq(users.telegramId, telegramId));
          return { response: enabled ? t("notifOn") : t("notifOff"), chatId, keyboard: "profile", lang, dailyTopEnabled: enabled };
        }

        if (type === "cat") {
          const keyword = CATEGORY_KEYWORDS[value] || "trending";
          const maxPrice = value === "under10" ? 10 : 0;
          const res = await searchProductsTool.execute({
            context: { query: keyword, country: user.country, currency: user.currency, quality: "default", maxPrice, freeShipping: false, onlyDiscount: false, preferCheaper: value === "under10" },
            mastra, runtimeContext: {} as any
          });
          return { response: `📂 ${value.toUpperCase()}:`, chatId, products: res.success ? res.products.slice(0, 5) : [], lang };
        }

        if (type === "fav" && value === "remove") {
          const productId = callbackData.split(":")[2];
          await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.productId, productId)));
          return { response: t("favRemoved"), chatId, keyboard: "main", lang };
        }

        if (type === "repeat") {
          const historyIndex = parseInt(value);
          const history = await db.select().from(searchHistory).where(eq(searchHistory.userId, user.id)).orderBy(desc(searchHistory.createdAt)).limit(5);
          if (history[historyIndex]) {
            const query = history[historyIndex].query;
            const res = await searchProductsTool.execute({
              context: { query, country: user.country, currency: user.currency, quality: "default", maxPrice: 0, freeShipping: false, onlyDiscount: false, preferCheaper: false },
              mastra, runtimeContext: {} as any
            });
            return { response: `${t("resultsFor")} "${query}":`, chatId, products: res.success ? res.products.slice(0, 5) : [], lang };
          }
        }

        if (type === "action") {
          switch (value) {
            case "menu":
              return { response: t("mainMenu"), chatId, keyboard: "main", lang };

            case "search":
              return { response: t("searchPrompt"), chatId, keyboard: "back", lang };

            case "top10":
              const res = await getTopProductsTool.execute({
                context: { country: user.country, currency: user.currency, category: "" },
                mastra, runtimeContext: {} as any
              });
              return { response: t("topTitle"), chatId, products: res.success ? res.products.slice(0, 10) : [], lang };

            case "categories":
              return { response: t("categories"), chatId, keyboard: "categories", lang };

            case "favorites":
              const favs = await db.select().from(favorites).where(eq(favorites.userId, user.id)).orderBy(desc(favorites.createdAt)).limit(10);
              if (favs.length === 0) {
                return { response: t("favEmpty"), chatId, keyboard: "main", lang };
              }
              return { response: t("favorites"), chatId, favorites: favs, lang };

            case "profile":
              const [currentUser] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
              const profileText = `${t("profileTitle")}\n\n${t("country")}: ${currentUser.country || "-"}\n${t("language")}: ${currentUser.language}\n${t("notifications")}: ${currentUser.dailyTopEnabled ? t("notifOn") : t("notifOff")}`;
              return { response: profileText, chatId, keyboard: "profile", lang, dailyTopEnabled: currentUser.dailyTopEnabled };

            case "support":
              return { response: `${t("supportMsg")}\n\n@SYNTRAM`, chatId, keyboard: "support", lang };

            case "change_country":
              return { response: t("changeCountry"), chatId, keyboard: "country", lang };

            case "change_lang":
              return { response: t("changeLang"), chatId, keyboard: "lang", lang };

            case "referral":
              const refCount = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(eq(referrals.referrerId, user.id));
              const count = Number(refCount[0]?.count || 0);
              const [coupon] = await db.select().from(coupons).where(eq(coupons.userId, user.id)).limit(1);
              
              let refText = `${t("referralTitle")}\n\nhttps://t.me/BuyWiseBot?start=${user.referralCode}\n\n${t("referralStats", { count })}`;
              if (coupon) {
                refText += `\n\n${t("yourCoupon", { code: coupon.code })}`;
              } else if (count < 5) {
                refText += `\n\n${t("couponProgress", { left: 5 - count })}`;
              }
              return { response: refText, chatId, keyboard: "main", lang };

            case "history":
              const history = await db.select().from(searchHistory).where(eq(searchHistory.userId, user.id)).orderBy(desc(searchHistory.createdAt)).limit(5);
              if (history.length === 0) {
                return { response: t("noSearchHistory"), chatId, keyboard: "main", lang };
              }
              return { response: t("recentSearches"), chatId, searchHistory: history, lang };
          }
        }
      }

      if (message && message.length > 1 && !message.startsWith("/")) {
        await db.insert(searchHistory).values({ userId: user.id, query: message, createdAt: new Date() });
        const res = await searchProductsTool.execute({
          context: { query: message, country: user.country, currency: user.currency, quality: "default", maxPrice: 0, freeShipping: false, onlyDiscount: false, preferCheaper: false },
          mastra, runtimeContext: {} as any
        });
        if (res.products.length === 0) {
          return { response: t("noResults"), chatId, keyboard: "main", lang };
        }
        return { response: `${t("resultsFor")} "${message}":`, chatId, products: res.products.slice(0, 5), lang };
      }

      return { response: t("mainMenu"), chatId, keyboard: "main", lang };
    } catch (e) {
      console.error("❌ [processMessageStep] Error:", e);
      return { response: getText("uk", "error"), chatId, keyboard: "main", lang: "uk" };
    }
  }
});

const sendToTelegramStep = createStep({
  id: "send-to-telegram",
  inputSchema: responseSchema,
  outputSchema: z.object({ sent: z.boolean() }),
  execute: async ({ inputData }) => {
    const data = inputData;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || !data || data.chatId === "unknown") return { sent: false };

    const lang = data.lang || "uk";
    const t = LANG_TEXTS[lang] || LANG_TEXTS.en;

    try {
      let kb: any = null;
      
      switch (data.keyboard) {
        case "main":
          kb = { inline_keyboard: getMainMenuButtons(lang) };
          break;
        case "country":
          kb = { inline_keyboard: COUNTRY_BUTTONS };
          break;
        case "back":
          kb = { inline_keyboard: [[{ text: t.back, callback_data: "action:menu" }]] };
          break;
        case "categories":
          kb = { inline_keyboard: getCategoryButtons(lang) };
          break;
        case "profile":
          kb = { inline_keyboard: getProfileButtons(lang, data.dailyTopEnabled ?? true) };
          break;
        case "lang":
          kb = { inline_keyboard: [...getLangButtons(), [{ text: t.back, callback_data: "action:menu" }]] };
          break;
        case "support":
          kb = { inline_keyboard: [
            [{ text: "💬 @SYNTRAM", url: "https://t.me/SYNTRAM" }],
            [{ text: t.back, callback_data: "action:menu" }]
          ]};
          break;
      }

      if (data.products && data.products.length > 0) {
        for (const p of data.products) {
          const discount = p.discount > 0 ? ` (-${p.discount}%)` : "";
          const text = `<b>${p.title}</b>\n\n💰 ${p.price} ${p.currency}${discount}\n⭐ ${p.rating?.toFixed(1) || "4.5"} | 📦 ${p.orders || 0} sold`;
          const mk = { inline_keyboard: [[{ text: t.buy, url: p.affiliateUrl }]] };
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: data.chatId, text, parse_mode: "HTML", reply_markup: mk })
          });
        }
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: data.chatId, text: t.mainMenu, reply_markup: { inline_keyboard: getMainMenuButtons(lang) } })
        });
        return { sent: true };
      }

      if (data.favorites && data.favorites.length > 0) {
        for (const f of data.favorites) {
          const text = `❤️ <b>${f.productTitle}</b>\n💰 ${f.currentPrice} ${f.currency}`;
          const mk = { inline_keyboard: [
            [{ text: t.buy, url: f.productUrl }],
            [{ text: "❌ Remove", callback_data: `fav:remove:${f.productId}` }]
          ]};
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: data.chatId, text, parse_mode: "HTML", reply_markup: mk })
          });
        }
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: data.chatId, text: t.mainMenu, reply_markup: { inline_keyboard: getMainMenuButtons(lang) } })
        });
        return { sent: true };
      }

      if (data.searchHistory && data.searchHistory.length > 0) {
        const buttons = data.searchHistory.map((h: any, i: number) => [{ text: `${i + 1}️⃣ ${h.query}`, callback_data: `repeat:${i}` }]);
        buttons.push([{ text: t.back, callback_data: "action:menu" }]);
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: data.chatId, text: data.response, reply_markup: { inline_keyboard: buttons } })
        });
        return { sent: true };
      }

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: data.chatId, text: data.response, parse_mode: "HTML", reply_markup: kb })
      });
      return { sent: true };
    } catch (e) {
      console.error("❌ [sendToTelegramStep] Error:", e);
      return { sent: false };
    }
  }
});

export const telegramBotWorkflow = createWorkflow({ id: "telegram-bot-workflow" })
  .then(processMessageStep)
  .then(sendToTelegramStep)
  .commit();
