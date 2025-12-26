import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { buyWiseAgent } from "../agents/buyWiseAgent";
import { db } from "../../db";
import { users, favorites, referrals } from "../../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { searchProductsTool, getTopProductsTool } from "../tools/aliexpressSearchTool";
import { getReferralLinkTool, processReferralTool } from "../tools/referralTool";
import { isAdmin, getSupportInfoTool } from "../tools/adminTool";

const productCache = new Map<string, { title: string; url: string; img: string; price: number }>();
const searchCache = new Map<string, { query: string; page: number; isTop: boolean }>();

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
  [{ text: "🎁 Рефералка", callback_data: "action:referral" }, { text: "🌐 Мова", callback_data: "action:language" }],
  [{ text: "💬 Підтримка", callback_data: "action:support" }],
];

const PROFILE_BUTTONS = [
  [{ text: "🌍 Змінити країну", callback_data: "settings:country" }],
  [{ text: "🌐 Змінити мову", callback_data: "action:language" }],
  [{ text: "🔔 Сповіщення ТОП-10", callback_data: "toggle:daily_on" }],
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
  welcomeBack: string;
  chooseCountry: string;
  chooseLang: string;
  ready: string;
  search: string;
  profile: string;
  support: string;
  langChanged: string;
  noFavorites: string;
  referral: string;
  referralStats: string;
  notifEnabled: string;
  notifDisabled: string;
  enableNotif: string;
  disableNotif: string;
  notifOn: string;
  notifOff: string;
  changeCountry: string;
  changeLang: string;
  backMenu: string;
}

const LANG_TEXTS: Record<string, LangTexts> = {
  uk: {
    welcome: "🎉 <b>Вітаю, {name}!</b> 🛍️\n\nЯ <b>BuyWise</b> - твій персональний помічник для пошуку найкращих товарів на AliExpress! 🌟\n\n🔍 <b>Шукай</b> - знайду найкраще\n🔥 <b>ТОП-10</b> - хіти продажів\n❤️ <b>Обране</b> - твої знахідки\n🎁 <b>Рефералка</b> - запрошуй друзів\n\n<i>Готовий до шопінгу?</i> 👇",
    welcomeBack: "👋 <b>З поверненням, {name}!</b> 🌟\n\nРадий бачити тебе знову! Що шукаємо сьогодні? 🛍️",
    chooseCountry: "🌍 <b>Оберіть вашу країну</b>\n\nЦе допоможе показувати правильні ціни та доставку:",
    chooseLang: "🌐 <b>Оберіть мову:</b>",
    ready: "🎊 <b>Чудово!</b> Тепер я готовий шукати найкращі пропозиції для тебе! 🛒\n\n<i>Напиши що шукаєш або натисни кнопку нижче</i> 👇",
    search: "🔍 <b>Пошук товарів</b>\n\n✨ Напишіть що шукаєте:\n• навушники bluetooth 🎧\n• чохол iPhone 15 📱\n• кросівки Nike 👟",
    profile: "👤 <b>Ваш профіль</b>\n\n🌍 Країна: <b>{country}</b>\n💰 Валюта: <b>{currency}</b>\n🌐 Мова: <b>{language}</b>\n👤 Ім'я: <b>{name}</b>\n🎁 Рефералів: <b>{referrals}</b>",
    support: "💬 <b>Підтримка</b>\n\n❓ Є питання чи пропозиції?\n🐛 Знайшли помилку?\n💡 Маєте ідею?\n\n👇 <b>Напишіть нашому адміну:</b>",
    langChanged: "✅ Мову змінено на Українську 🇺🇦",
    noFavorites: "❤️ У вас поки немає обраних товарів.\n\n<i>Додайте товари в обране натиснувши</i> ❤️ <i>під товаром.</i>",
    referral: "🎁 <b>Реферальна програма</b>\n\n📎 Твоє унікальне посилання:\n<code>{link}</code>\n\n👥 Запрошено друзів: <b>{count}</b>\n\n<i>Поділись посиланням з друзями!</i>",
    referralStats: "📊 <b>Твоя статистика</b>\n\n👥 Запрошено друзів: <b>{count}</b>\n🔗 Твій код: <code>{code}</code>",
    notifEnabled: "🔔 Сповіщення увімкнено",
    notifDisabled: "🔕 Сповіщення вимкнено",
    enableNotif: "🔔 Увімкнути ТОП-10",
    disableNotif: "🔕 Вимкнути ТОП-10",
    notifOn: "🔔 Щоденні сповіщення увімкнено!\n\nВи отримуватимете TOP-10 товарів о 10:00.",
    notifOff: "🔕 Щоденні сповіщення вимкнено.\n\nВи можете увімкнути їх знову в профілі.",
    changeCountry: "🌍 Змінити країну",
    changeLang: "🌐 Змінити мову",
    backMenu: "🔙 Меню",
  },
  ru: {
    welcome: "🎉 <b>Привет, {name}!</b> 🛍️\n\nЯ <b>BuyWise</b> - твой персональный помощник для поиска лучших товаров на AliExpress! 🌟\n\n🔍 <b>Поиск</b> - найду лучшее\n🔥 <b>ТОП-10</b> - хиты продаж\n❤️ <b>Избранное</b> - твои находки\n🎁 <b>Реферал</b> - приглашай друзей\n\n<i>Готов к шопингу?</i> 👇",
    welcomeBack: "👋 <b>С возвращением, {name}!</b> 🌟\n\nРад тебя видеть снова! Что ищем сегодня? 🛍️",
    chooseCountry: "🌍 <b>Выберите вашу страну</b>\n\nЭто поможет показывать правильные цены и доставку:",
    chooseLang: "🌐 <b>Выберите язык:</b>",
    ready: "🎊 <b>Отлично!</b> Теперь я готов искать лучшие предложения для тебя! 🛒\n\n<i>Напиши что ищешь или нажми кнопку ниже</i> 👇",
    search: "🔍 <b>Поиск товаров</b>\n\n✨ Напишите что ищете:\n• наушники bluetooth 🎧\n• чехол iPhone 15 📱\n• кроссовки Nike 👟",
    profile: "👤 <b>Ваш профиль</b>\n\n🌍 Страна: <b>{country}</b>\n💰 Валюта: <b>{currency}</b>\n🌐 Язык: <b>{language}</b>\n👤 Имя: <b>{name}</b>\n🎁 Рефералов: <b>{referrals}</b>",
    support: "💬 <b>Поддержка</b>\n\n❓ Есть вопросы или предложения?\n🐛 Нашли ошибку?\n💡 Есть идея?\n\n👇 <b>Напишите нашему админу:</b>",
    langChanged: "✅ Язык изменен на Русский 🇷🇺",
    noFavorites: "❤️ У вас пока нет избранных товаров.\n\n<i>Добавьте товары в избранное нажав</i> ❤️ <i>под товаром.</i>",
    referral: "🎁 <b>Реферальная программа</b>\n\n📎 Твоя уникальная ссылка:\n<code>{link}</code>\n\n👥 Приглашено друзей: <b>{count}</b>\n\n<i>Поделись ссылкой с друзьями!</i>",
    referralStats: "📊 <b>Твоя статистика</b>\n\n👥 Приглашено друзей: <b>{count}</b>\n🔗 Твой код: <code>{code}</code>",
    notifEnabled: "🔔 Уведомления включены",
    notifDisabled: "🔕 Уведомления отключены",
    enableNotif: "🔔 Включить ТОП-10",
    disableNotif: "🔕 Отключить ТОП-10",
    notifOn: "🔔 Ежедневные уведомления включены!\n\nВы будете получать TOP-10 товаров в 10:00.",
    notifOff: "🔕 Ежедневные уведомления отключены.\n\nВы можете включить их снова в профиле.",
    changeCountry: "🌍 Изменить страну",
    changeLang: "🌐 Изменить язык",
    backMenu: "🔙 Меню",
  },
  en: {
    welcome: "🎉 <b>Hello, {name}!</b> 🛍️\n\nI'm <b>BuyWise</b> - your personal assistant for finding the best deals on AliExpress! 🌟\n\n🔍 <b>Search</b> - I'll find the best\n🔥 <b>TOP-10</b> - bestsellers\n❤️ <b>Favorites</b> - your finds\n🎁 <b>Referral</b> - invite friends\n\n<i>Ready to shop?</i> 👇",
    welcomeBack: "👋 <b>Welcome back, {name}!</b> 🌟\n\nGreat to see you again! What are we looking for today? 🛍️",
    chooseCountry: "🌍 <b>Choose your country</b>\n\nThis helps show correct prices and shipping:",
    chooseLang: "🌐 <b>Choose your language:</b>",
    ready: "🎊 <b>Awesome!</b> Now I'm ready to find the best deals for you! 🛒\n\n<i>Type what you're looking for or tap a button below</i> 👇",
    search: "🔍 <b>Product Search</b>\n\n✨ Tell me what you're looking for:\n• bluetooth headphones 🎧\n• iPhone 15 case 📱\n• Nike sneakers 👟",
    profile: "👤 <b>Your Profile</b>\n\n🌍 Country: <b>{country}</b>\n💰 Currency: <b>{currency}</b>\n🌐 Language: <b>{language}</b>\n👤 Name: <b>{name}</b>\n🎁 Referrals: <b>{referrals}</b>",
    support: "💬 <b>Support</b>\n\n❓ Questions or suggestions?\n🐛 Found a bug?\n💡 Got an idea?\n\n👇 <b>Contact our admin:</b>",
    langChanged: "✅ Language changed to English 🇬🇧",
    noFavorites: "❤️ You don't have any favorites yet.\n\n<i>Add products to favorites by tapping</i> ❤️ <i>below a product.</i>",
    referral: "🎁 <b>Referral Program</b>\n\n📎 Your unique link:\n<code>{link}</code>\n\n👥 Friends invited: <b>{count}</b>\n\n<i>Share this link with friends!</i>",
    referralStats: "📊 <b>Your Stats</b>\n\n👥 Friends invited: <b>{count}</b>\n🔗 Your code: <code>{code}</code>",
    notifEnabled: "🔔 Notifications enabled",
    notifDisabled: "🔕 Notifications disabled",
    enableNotif: "🔔 Enable TOP-10",
    disableNotif: "🔕 Disable TOP-10",
    notifOn: "🔔 Daily notifications enabled!\n\nYou'll receive TOP-10 products at 10:00 AM.",
    notifOff: "🔕 Daily notifications disabled.\n\nYou can enable them again in your profile.",
    changeCountry: "🌍 Change country",
    changeLang: "🌐 Change language",
    backMenu: "🔙 Menu",
  },
  de: {
    welcome: "🎉 <b>Hallo, {name}!</b> 🛍️\n\nIch bin <b>BuyWise</b> - dein persönlicher Assistent für die besten Angebote auf AliExpress! 🌟\n\n🔍 <b>Suche</b> - finde das Beste\n🔥 <b>TOP-10</b> - Bestseller\n❤️ <b>Favoriten</b> - deine Funde\n🎁 <b>Empfehlung</b> - lade Freunde ein\n\n<i>Bereit zum Shoppen?</i> 👇",
    welcomeBack: "👋 <b>Willkommen zurück, {name}!</b> 🌟\n\nSchön dich wiederzusehen! Was suchen wir heute? 🛍️",
    chooseCountry: "🌍 <b>Wähle dein Land</b>\n\nDas hilft, korrekte Preise und Versand anzuzeigen:",
    chooseLang: "🌐 <b>Sprache wählen:</b>",
    ready: "🎊 <b>Super!</b> Jetzt bin ich bereit, die besten Angebote für dich zu finden! 🛒\n\n<i>Schreib was du suchst oder tippe auf einen Button</i> 👇",
    search: "🔍 <b>Produktsuche</b>\n\n✨ Schreib was du suchst:\n• Bluetooth Kopfhörer 🎧\n• iPhone 15 Hülle 📱\n• Nike Schuhe 👟",
    profile: "👤 <b>Dein Profil</b>\n\n🌍 Land: <b>{country}</b>\n💰 Währung: <b>{currency}</b>\n🌐 Sprache: <b>{language}</b>\n👤 Name: <b>{name}</b>\n🎁 Empfehlungen: <b>{referrals}</b>",
    support: "💬 <b>Support</b>\n\n❓ Fragen oder Vorschläge?\n🐛 Fehler gefunden?\n💡 Idee?\n\n👇 <b>Kontaktiere unseren Admin:</b>",
    langChanged: "✅ Sprache auf Deutsch geändert 🇩🇪",
    noFavorites: "❤️ Du hast noch keine Favoriten.\n\n<i>Füge Produkte zu Favoriten hinzu, indem du</i> ❤️ <i>unter einem Produkt tippst.</i>",
    referral: "🎁 <b>Empfehlungsprogramm</b>\n\n📎 Dein einzigartiger Link:\n<code>{link}</code>\n\n👥 Eingeladene Freunde: <b>{count}</b>\n\n<i>Teile diesen Link mit Freunden!</i>",
    referralStats: "📊 <b>Deine Statistik</b>\n\n👥 Eingeladene Freunde: <b>{count}</b>\n🔗 Dein Code: <code>{code}</code>",
    notifEnabled: "🔔 Benachrichtigungen aktiviert",
    notifDisabled: "🔕 Benachrichtigungen deaktiviert",
    enableNotif: "🔔 TOP-10 aktivieren",
    disableNotif: "🔕 TOP-10 deaktivieren",
    notifOn: "🔔 Tägliche Benachrichtigungen aktiviert!\n\nDu erhältst TOP-10 Produkte um 10:00 Uhr.",
    notifOff: "🔕 Tägliche Benachrichtigungen deaktiviert.\n\nDu kannst sie im Profil wieder aktivieren.",
    changeCountry: "🌍 Land ändern",
    changeLang: "🌐 Sprache ändern",
    backMenu: "🔙 Menü",
  },
  pl: {
    welcome: "🎉 <b>Cześć, {name}!</b> 🛍️\n\nJestem <b>BuyWise</b> - Twój osobisty asystent do znajdowania najlepszych ofert na AliExpress! 🌟\n\n🔍 <b>Szukaj</b> - znajdę najlepsze\n🔥 <b>TOP-10</b> - bestsellery\n❤️ <b>Ulubione</b> - Twoje znaleziska\n🎁 <b>Polecenia</b> - zaproś znajomych\n\n<i>Gotowy na zakupy?</i> 👇",
    welcomeBack: "👋 <b>Witaj ponownie, {name}!</b> 🌟\n\nMiło Cię znowu widzieć! Czego szukamy dziś? 🛍️",
    chooseCountry: "🌍 <b>Wybierz swój kraj</b>\n\nTo pomoże pokazać prawidłowe ceny i dostawę:",
    chooseLang: "🌐 <b>Wybierz język:</b>",
    ready: "🎊 <b>Świetnie!</b> Teraz jestem gotowy, aby znaleźć najlepsze oferty dla Ciebie! 🛒\n\n<i>Napisz czego szukasz lub kliknij przycisk poniżej</i> 👇",
    search: "🔍 <b>Szukaj produktów</b>\n\n✨ Napisz czego szukasz:\n• słuchawki bluetooth 🎧\n• etui iPhone 15 📱\n• buty Nike 👟",
    profile: "👤 <b>Twój profil</b>\n\n🌍 Kraj: <b>{country}</b>\n💰 Waluta: <b>{currency}</b>\n🌐 Język: <b>{language}</b>\n👤 Imię: <b>{name}</b>\n🎁 Poleceni: <b>{referrals}</b>",
    support: "💬 <b>Wsparcie</b>\n\n❓ Pytania lub sugestie?\n🐛 Znalazłeś błąd?\n💡 Masz pomysł?\n\n👇 <b>Skontaktuj się z naszym adminem:</b>",
    langChanged: "✅ Język zmieniony na Polski 🇵🇱",
    noFavorites: "❤️ Nie masz jeszcze ulubionych.\n\n<i>Dodaj produkty do ulubionych, klikając</i> ❤️ <i>pod produktem.</i>",
    referral: "🎁 <b>Program poleceń</b>\n\n📎 Twój unikalny link:\n<code>{link}</code>\n\n👥 Zaproszeni znajomi: <b>{count}</b>\n\n<i>Podziel się tym linkiem ze znajomymi!</i>",
    referralStats: "📊 <b>Twoja statystyka</b>\n\n👥 Zaproszeni znajomi: <b>{count}</b>\n🔗 Twój kod: <code>{code}</code>",
    notifEnabled: "🔔 Powiadomienia włączone",
    notifDisabled: "🔕 Powiadomienia wyłączone",
    enableNotif: "🔔 Włącz TOP-10",
    disableNotif: "🔕 Wyłącz TOP-10",
    notifOn: "🔔 Codzienne powiadomienia włączone!\n\nOtrzymasz TOP-10 produktów o 10:00.",
    notifOff: "🔕 Codzienne powiadomienia wyłączone.\n\nMożesz je włączyć ponownie w profilu.",
    changeCountry: "🌍 Zmień kraj",
    changeLang: "🌐 Zmień język",
    backMenu: "🔙 Menu",
  },
  fr: {
    welcome: "🎉 <b>Bonjour, {name}!</b> 🛍️\n\nJe suis <b>BuyWise</b> - votre assistant personnel pour trouver les meilleures offres sur AliExpress! 🌟\n\n🔍 <b>Recherche</b> - je trouve le meilleur\n🔥 <b>TOP-10</b> - best-sellers\n❤️ <b>Favoris</b> - vos trouvailles\n🎁 <b>Parrainage</b> - invitez des amis\n\n<i>Prêt à faire du shopping?</i> 👇",
    welcomeBack: "👋 <b>Bon retour, {name}!</b> 🌟\n\nRavi de vous revoir! Que cherchons-nous aujourd'hui? 🛍️",
    chooseCountry: "🌍 <b>Choisissez votre pays</b>\n\nCela aide à afficher les bons prix et la livraison:",
    chooseLang: "🌐 <b>Choisissez votre langue:</b>",
    ready: "🎊 <b>Génial!</b> Maintenant je suis prêt à trouver les meilleures offres pour vous! 🛒\n\n<i>Écrivez ce que vous cherchez ou appuyez sur un bouton</i> 👇",
    search: "🔍 <b>Recherche de produits</b>\n\n✨ Dites-moi ce que vous cherchez:\n• écouteurs bluetooth 🎧\n• coque iPhone 15 📱\n• baskets Nike 👟",
    profile: "👤 <b>Votre profil</b>\n\n🌍 Pays: <b>{country}</b>\n💰 Devise: <b>{currency}</b>\n🌐 Langue: <b>{language}</b>\n👤 Nom: <b>{name}</b>\n🎁 Parrainages: <b>{referrals}</b>",
    support: "💬 <b>Support</b>\n\n❓ Questions ou suggestions?\n🐛 Bug trouvé?\n💡 Une idée?\n\n👇 <b>Contactez notre admin:</b>",
    langChanged: "✅ Langue changée en Français 🇫🇷",
    noFavorites: "❤️ Vous n'avez pas encore de favoris.\n\n<i>Ajoutez des produits aux favoris en appuyant sur</i> ❤️ <i>sous un produit.</i>",
    referral: "🎁 <b>Programme de parrainage</b>\n\n📎 Votre lien unique:\n<code>{link}</code>\n\n👥 Amis invités: <b>{count}</b>\n\n<i>Partagez ce lien avec vos amis!</i>",
    referralStats: "📊 <b>Vos statistiques</b>\n\n👥 Amis invités: <b>{count}</b>\n🔗 Votre code: <code>{code}</code>",
    notifEnabled: "🔔 Notifications activées",
    notifDisabled: "🔕 Notifications désactivées",
    enableNotif: "🔔 Activer TOP-10",
    disableNotif: "🔕 Désactiver TOP-10",
    notifOn: "🔔 Notifications quotidiennes activées!\n\nVous recevrez le TOP-10 des produits à 10h00.",
    notifOff: "🔕 Notifications quotidiennes désactivées.\n\nVous pouvez les réactiver dans votre profil.",
    changeCountry: "🌍 Changer de pays",
    changeLang: "🌐 Changer de langue",
    backMenu: "🔙 Menu",
  },
  es: {
    welcome: "🎉 <b>¡Hola, {name}!</b> 🛍️\n\nSoy <b>BuyWise</b> - tu asistente personal para encontrar las mejores ofertas en AliExpress! 🌟\n\n🔍 <b>Buscar</b> - encuentro lo mejor\n🔥 <b>TOP-10</b> - más vendidos\n❤️ <b>Favoritos</b> - tus hallazgos\n🎁 <b>Referidos</b> - invita amigos\n\n<i>¿Listo para comprar?</i> 👇",
    welcomeBack: "👋 <b>¡Bienvenido de nuevo, {name}!</b> 🌟\n\n¡Qué alegría verte! ¿Qué buscamos hoy? 🛍️",
    chooseCountry: "🌍 <b>Elige tu país</b>\n\nEsto ayuda a mostrar precios y envío correctos:",
    chooseLang: "🌐 <b>Elige tu idioma:</b>",
    ready: "🎊 <b>¡Genial!</b> ¡Ahora estoy listo para encontrar las mejores ofertas para ti! 🛒\n\n<i>Escribe qué buscas o toca un botón</i> 👇",
    search: "🔍 <b>Buscar productos</b>\n\n✨ Dime qué buscas:\n• auriculares bluetooth 🎧\n• funda iPhone 15 📱\n• zapatillas Nike 👟",
    profile: "👤 <b>Tu perfil</b>\n\n🌍 País: <b>{country}</b>\n💰 Moneda: <b>{currency}</b>\n🌐 Idioma: <b>{language}</b>\n👤 Nombre: <b>{name}</b>\n🎁 Referidos: <b>{referrals}</b>",
    support: "💬 <b>Soporte</b>\n\n❓ ¿Preguntas o sugerencias?\n🐛 ¿Encontraste un error?\n💡 ¿Tienes una idea?\n\n👇 <b>Contacta a nuestro admin:</b>",
    langChanged: "✅ Idioma cambiado a Español 🇪🇸",
    noFavorites: "❤️ Aún no tienes favoritos.\n\n<i>Añade productos a favoritos tocando</i> ❤️ <i>debajo de un producto.</i>",
    referral: "🎁 <b>Programa de referidos</b>\n\n📎 Tu enlace único:\n<code>{link}</code>\n\n👥 Amigos invitados: <b>{count}</b>\n\n<i>¡Comparte este enlace con amigos!</i>",
    referralStats: "📊 <b>Tus estadísticas</b>\n\n👥 Amigos invitados: <b>{count}</b>\n🔗 Tu código: <code>{code}</code>",
    notifEnabled: "🔔 Notificaciones activadas",
    notifDisabled: "🔕 Notificaciones desactivadas",
    enableNotif: "🔔 Activar TOP-10",
    disableNotif: "🔕 Desactivar TOP-10",
    notifOn: "🔔 ¡Notificaciones diarias activadas!\n\nRecibirás TOP-10 productos a las 10:00.",
    notifOff: "🔕 Notificaciones diarias desactivadas.\n\nPuedes activarlas de nuevo en tu perfil.",
    changeCountry: "🌍 Cambiar país",
    changeLang: "🌐 Cambiar idioma",
    backMenu: "🔙 Menú",
  },
  it: {
    welcome: "🎉 <b>Ciao, {name}!</b> 🛍️\n\nSono <b>BuyWise</b> - il tuo assistente personale per trovare le migliori offerte su AliExpress! 🌟\n\n🔍 <b>Cerca</b> - trovo il meglio\n🔥 <b>TOP-10</b> - bestseller\n❤️ <b>Preferiti</b> - le tue scoperte\n🎁 <b>Referral</b> - invita amici\n\n<i>Pronto per lo shopping?</i> 👇",
    welcomeBack: "👋 <b>Bentornato, {name}!</b> 🌟\n\nFelice di rivederti! Cosa cerchiamo oggi? 🛍️",
    chooseCountry: "🌍 <b>Scegli il tuo paese</b>\n\nQuesto aiuta a mostrare prezzi e spedizione corretti:",
    chooseLang: "🌐 <b>Scegli la lingua:</b>",
    ready: "🎊 <b>Fantastico!</b> Ora sono pronto a trovare le migliori offerte per te! 🛒\n\n<i>Scrivi cosa cerchi o tocca un pulsante</i> 👇",
    search: "🔍 <b>Cerca prodotti</b>\n\n✨ Dimmi cosa cerchi:\n• cuffie bluetooth 🎧\n• custodia iPhone 15 📱\n• scarpe Nike 👟",
    profile: "👤 <b>Il tuo profilo</b>\n\n🌍 Paese: <b>{country}</b>\n💰 Valuta: <b>{currency}</b>\n🌐 Lingua: <b>{language}</b>\n👤 Nome: <b>{name}</b>\n🎁 Referral: <b>{referrals}</b>",
    support: "💬 <b>Supporto</b>\n\n❓ Domande o suggerimenti?\n🐛 Bug trovato?\n💡 Un'idea?\n\n👇 <b>Contatta il nostro admin:</b>",
    langChanged: "✅ Lingua cambiata in Italiano 🇮🇹",
    noFavorites: "❤️ Non hai ancora preferiti.\n\n<i>Aggiungi prodotti ai preferiti toccando</i> ❤️ <i>sotto un prodotto.</i>",
    referral: "🎁 <b>Programma referral</b>\n\n📎 Il tuo link unico:\n<code>{link}</code>\n\n👥 Amici invitati: <b>{count}</b>\n\n<i>Condividi questo link con gli amici!</i>",
    referralStats: "📊 <b>Le tue statistiche</b>\n\n👥 Amici invitati: <b>{count}</b>\n🔗 Il tuo codice: <code>{code}</code>",
    notifEnabled: "🔔 Notifiche attivate",
    notifDisabled: "🔕 Notifiche disattivate",
    enableNotif: "🔔 Attiva TOP-10",
    disableNotif: "🔕 Disattiva TOP-10",
    notifOn: "🔔 Notifiche giornaliere attivate!\n\nRiceverai i TOP-10 prodotti alle 10:00.",
    notifOff: "🔕 Notifiche giornaliere disattivate.\n\nPuoi riattivarle nel profilo.",
    changeCountry: "🌍 Cambia paese",
    changeLang: "🌐 Cambia lingua",
    backMenu: "🔙 Menu",
  },
  cs: {
    welcome: "🎉 <b>Ahoj, {name}!</b> 🛍️\n\nJsem <b>BuyWise</b> - tvůj osobní asistent pro hledání nejlepších nabídek na AliExpress! 🌟\n\n🔍 <b>Hledat</b> - najdu nejlepší\n🔥 <b>TOP-10</b> - bestsellery\n❤️ <b>Oblíbené</b> - tvoje nálezy\n🎁 <b>Doporučení</b> - pozvi přátele\n\n<i>Připraven nakupovat?</i> 👇",
    welcomeBack: "👋 <b>Vítej zpět, {name}!</b> 🌟\n\nRád tě zase vidím! Co hledáme dnes? 🛍️",
    chooseCountry: "🌍 <b>Vyber svou zemi</b>\n\nTo pomůže zobrazit správné ceny a dopravu:",
    chooseLang: "🌐 <b>Vyber jazyk:</b>",
    ready: "🎊 <b>Skvělé!</b> Teď jsem připraven najít nejlepší nabídky pro tebe! 🛒\n\n<i>Napiš co hledáš nebo klikni na tlačítko</i> 👇",
    search: "🔍 <b>Hledat produkty</b>\n\n✨ Řekni mi, co hledáš:\n• bluetooth sluchátka 🎧\n• pouzdro iPhone 15 📱\n• boty Nike 👟",
    profile: "👤 <b>Tvůj profil</b>\n\n🌍 Země: <b>{country}</b>\n💰 Měna: <b>{currency}</b>\n🌐 Jazyk: <b>{language}</b>\n👤 Jméno: <b>{name}</b>\n🎁 Doporučení: <b>{referrals}</b>",
    support: "💬 <b>Podpora</b>\n\n❓ Otázky nebo návrhy?\n🐛 Našel jsi chybu?\n💡 Máš nápad?\n\n👇 <b>Kontaktuj našeho admina:</b>",
    langChanged: "✅ Jazyk změněn na Češtinu 🇨🇿",
    noFavorites: "❤️ Zatím nemáš oblíbené.\n\n<i>Přidej produkty do oblíbených kliknutím na</i> ❤️ <i>pod produktem.</i>",
    referral: "🎁 <b>Program doporučení</b>\n\n📎 Tvůj unikátní odkaz:\n<code>{link}</code>\n\n👥 Pozvaní přátelé: <b>{count}</b>\n\n<i>Sdílej tento odkaz s přáteli!</i>",
    referralStats: "📊 <b>Tvá statistika</b>\n\n👥 Pozvaní přátelé: <b>{count}</b>\n🔗 Tvůj kód: <code>{code}</code>",
    notifEnabled: "🔔 Upozornění zapnuta",
    notifDisabled: "🔕 Upozornění vypnuta",
    enableNotif: "🔔 Zapnout TOP-10",
    disableNotif: "🔕 Vypnout TOP-10",
    notifOn: "🔔 Denní upozornění zapnuta!\n\nBudeš dostávat TOP-10 produktů v 10:00.",
    notifOff: "🔕 Denní upozornění vypnuta.\n\nMůžeš je zapnout v profilu.",
    changeCountry: "🌍 Změnit zemi",
    changeLang: "🌐 Změnit jazyk",
    backMenu: "🔙 Menu",
  },
  ro: {
    welcome: "🎉 <b>Bună, {name}!</b> 🛍️\n\nSunt <b>BuyWise</b> - asistentul tău personal pentru a găsi cele mai bune oferte pe AliExpress! 🌟\n\n🔍 <b>Caută</b> - găsesc cel mai bun\n🔥 <b>TOP-10</b> - bestsellere\n❤️ <b>Favorite</b> - descoperirile tale\n🎁 <b>Referral</b> - invită prieteni\n\n<i>Gata de shopping?</i> 👇",
    welcomeBack: "👋 <b>Bine ai revenit, {name}!</b> 🌟\n\nMă bucur să te văd din nou! Ce căutăm azi? 🛍️",
    chooseCountry: "🌍 <b>Alege țara ta</b>\n\nAcest lucru ajută la afișarea prețurilor și livrării corecte:",
    chooseLang: "🌐 <b>Alege limba:</b>",
    ready: "🎊 <b>Minunat!</b> Acum sunt gata să găsesc cele mai bune oferte pentru tine! 🛒\n\n<i>Scrie ce cauți sau apasă un buton</i> 👇",
    search: "🔍 <b>Caută produse</b>\n\n✨ Spune-mi ce cauți:\n• căști bluetooth 🎧\n• husă iPhone 15 📱\n• pantofi Nike 👟",
    profile: "👤 <b>Profilul tău</b>\n\n🌍 Țară: <b>{country}</b>\n💰 Monedă: <b>{currency}</b>\n🌐 Limbă: <b>{language}</b>\n👤 Nume: <b>{name}</b>\n🎁 Referral-uri: <b>{referrals}</b>",
    support: "💬 <b>Suport</b>\n\n❓ Întrebări sau sugestii?\n🐛 Ai găsit un bug?\n💡 Ai o idee?\n\n👇 <b>Contactează adminul nostru:</b>",
    langChanged: "✅ Limba schimbată în Română 🇷🇴",
    noFavorites: "❤️ Nu ai încă favorite.\n\n<i>Adaugă produse la favorite atingând</i> ❤️ <i>sub un produs.</i>",
    referral: "🎁 <b>Program referral</b>\n\n📎 Link-ul tău unic:\n<code>{link}</code>\n\n👥 Prieteni invitați: <b>{count}</b>\n\n<i>Partajează acest link cu prietenii!</i>",
    referralStats: "📊 <b>Statisticile tale</b>\n\n👥 Prieteni invitați: <b>{count}</b>\n🔗 Codul tău: <code>{code}</code>",
    notifEnabled: "🔔 Notificări activate",
    notifDisabled: "🔕 Notificări dezactivate",
    enableNotif: "🔔 Activează TOP-10",
    disableNotif: "🔕 Dezactivează TOP-10",
    notifOn: "🔔 Notificări zilnice activate!\n\nVei primi TOP-10 produse la ora 10:00.",
    notifOff: "🔕 Notificări zilnice dezactivate.\n\nLe poți reactiva în profil.",
    changeCountry: "🌍 Schimbă țara",
    changeLang: "🌐 Schimbă limba",
    backMenu: "🔙 Meniu",
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
    languageCode: z.string().optional(),
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
    hasMore: z.boolean().optional(),
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
      const languageCode = lang;
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
            languageCode,
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
            languageCode: value,
          };
        }
        
        if (type === "action") {
          switch (value) {
            case "search":
              return { response: texts.search, chatId: inputData.chatId, success: true, keyboard: "back", telegramId: inputData.telegramId, languageCode };
            case "menu":
              return { response: "📱 <b>Головне меню</b>\n\nОберіть дію:", chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode };
            case "profile":
              if (existingUser) {
                const refCountResult = await db.select({ count: sql<number>`count(*)` })
                  .from(referrals)
                  .where(eq(referrals.referrerId, existingUser.id));
                const refCount = Number(refCountResult[0]?.count || 0);
                const notifStatusText = existingUser.dailyTopEnabled ? texts.notifEnabled : texts.notifDisabled;
                const profileText = texts.profile
                  .replace("{country}", existingUser.country || "-")
                  .replace("{currency}", existingUser.currency)
                  .replace("{language}", LANG_NAMES[existingUser.language] || LANG_NAMES.en || existingUser.language)
                  .replace("{name}", existingUser.userName || existingUser.firstName || inputData.userName || "-")
                  .replace("{referrals}", String(refCount))
                  + `\n${notifStatusText}`;
                return { 
                  response: profileText, 
                  chatId: inputData.chatId, 
                  success: true, 
                  keyboard: existingUser.dailyTopEnabled ? "profile_notif_on" : "profile_notif_off", 
                  telegramId: inputData.telegramId,
                  languageCode,
                };
              }
              return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode };
            case "language":
              return { response: texts.chooseLang, chatId: inputData.chatId, success: true, keyboard: "language", telegramId: inputData.telegramId, languageCode };
            case "referral":
              if (!existingUser) {
                return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode };
              }
              const refResult = await getReferralLinkTool.execute({
                context: { telegramId: inputData.telegramId, botUsername: "BuyWiseBot" },
                mastra,
                runtimeContext: {} as any,
              });
              if (refResult.success) {
                const refText = texts.referral
                  .replace("{link}", refResult.referralLink || "")
                  .replace("{count}", String(refResult.referralCount || 0));
                return { response: refText, chatId: inputData.chatId, success: true, keyboard: "back", telegramId: inputData.telegramId, languageCode };
              }
              return { response: "❌ Помилка отримання реферального посилання", chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode };
            case "support":
              const supportResult = await getSupportInfoTool.execute({
                context: { language: lang, userName: existingUser?.userName || existingUser?.firstName || inputData.userName },
                mastra,
                runtimeContext: {} as any,
              });
              return { 
                response: texts.support, 
                chatId: inputData.chatId, 
                success: true, 
                keyboard: "support",
                telegramId: inputData.telegramId 
              };
            case "favorites":
              if (!existingUser) {
                return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode };
              }
              const userFavs = await db
                .select()
                .from(favorites)
                .where(eq(favorites.userId, existingUser.id));
              
              if (userFavs.length === 0) {
                return { response: texts.noFavorites, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode };
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
          return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode };
        }
        
        if (type === "like") {
          if (!existingUser) {
            return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode };
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
            return { response: "❌ Видалено з обраного", chatId: inputData.chatId, success: true, keyboard: "none", telegramId: inputData.telegramId, languageCode };
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
            return { response: "❤️ Додано до обраного!", chatId: inputData.chatId, success: true, keyboard: "none", telegramId: inputData.telegramId, languageCode };
          }
        }
        
        if (type === "toggle") {
          if (value === "daily_off") {
            if (existingUser) {
              await db.update(users).set({ 
                dailyTopEnabled: false, 
                updatedAt: new Date() 
              }).where(eq(users.telegramId, inputData.telegramId));
              logger?.info("✅ Daily notifications disabled for:", inputData.telegramId);
              return { response: texts.notifOff, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode };
            }
          }
          if (value === "daily_on") {
            if (existingUser) {
              await db.update(users).set({ 
                dailyTopEnabled: true, 
                updatedAt: new Date() 
              }).where(eq(users.telegramId, inputData.telegramId));
              logger?.info("✅ Daily notifications enabled for:", inputData.telegramId);
              return { response: texts.notifOn, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode };
            }
          }
        }
        
        if (type === "more") {
          if (!existingUser) {
            return { response: texts.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode };
          }
          
          const cached = searchCache.get(inputData.telegramId);
          if (cached) {
            const nextPage = cached.page + 1;
            let products: any[] = [];
            
            if (cached.isTop) {
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
                const start = nextPage * 5;
                products = result.products.slice(start, start + 5);
              }
            } else {
              const result = await searchProductsTool.execute({
                context: {
                  query: cached.query,
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
                const start = nextPage * 5;
                products = result.products.slice(start, start + 5);
              }
            }
            
            if (products.length > 0) {
              searchCache.set(inputData.telegramId, { ...cached, page: nextPage });
              return {
                response: `📦 <b>Ще ${products.length} товарів:</b>`,
                chatId: inputData.chatId,
                success: true,
                keyboard: "none",
                products,
                hasMore: products.length >= 5,
                telegramId: inputData.telegramId,
              };
            } else {
              return { response: "😔 Більше товарів не знайдено", chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode };
            }
          }
          return { response: "🔍 Введіть новий пошуковий запит", chatId: inputData.chatId, success: true, keyboard: "back", telegramId: inputData.telegramId, languageCode };
        }
      }
      
      const message = inputData.message || "";
      const texts2 = existingUser ? getTexts(existingUser.language) : getTexts(userLang);
      
      if (message.startsWith("/start")) {
        const userName = inputData.userName || existingUser?.firstName || existingUser?.userName || "";
        const displayName = userName || "друже";
        
        const parts = message.split(" ");
        const referralCode = parts.length > 1 ? parts[1] : null;
        
        if (!existingUser) {
          const welcomeText = texts2.welcome.replace("{name}", displayName);
          
          await db.insert(users).values({
            telegramId: inputData.telegramId,
            userName: inputData.userName || null,
            firstName: displayName,
            language: userLang,
            country: "",
            currency: "USD",
            dailyTopEnabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }).onConflictDoNothing();
          
          if (referralCode) {
            setTimeout(async () => {
              try {
                await processReferralTool.execute({
                  context: { newUserTelegramId: inputData.telegramId, referralCode },
                  mastra,
                  runtimeContext: {} as any,
                });
              } catch (e) {
                logger?.error("Referral processing failed:", e);
              }
            }, 1000);
          }
          
          return {
            response: `${welcomeText}\n\n${texts2.chooseCountry}`,
            chatId: inputData.chatId,
            success: true,
            keyboard: "country",
            telegramId: inputData.telegramId,
          };
        }
        
        const welcomeBackText = texts2.welcomeBack.replace("{name}", displayName);
        return {
          response: welcomeBackText,
          chatId: inputData.chatId,
          success: true,
          keyboard: "main",
          telegramId: inputData.telegramId,
        };
      }
      
      if (message === "/help") {
        return { response: texts2.support, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode };
      }
      
      if (message === "/profile") {
        if (existingUser) {
          const refCountResult2 = await db.select({ count: sql<number>`count(*)` })
            .from(referrals)
            .where(eq(referrals.referrerId, existingUser.id));
          const refCount2 = Number(refCountResult2[0]?.count || 0);
          const notifStatusText2 = existingUser.dailyTopEnabled ? texts2.notifEnabled : texts2.notifDisabled;
          const profileText = texts2.profile
            .replace("{country}", existingUser.country || "-")
            .replace("{currency}", existingUser.currency)
            .replace("{language}", LANG_NAMES[existingUser.language] || LANG_NAMES.en || existingUser.language)
            .replace("{name}", existingUser.userName || existingUser.firstName || inputData.userName || "-")
            .replace("{referrals}", String(refCount2))
            + `\n${notifStatusText2}`;
          return { response: profileText, chatId: inputData.chatId, success: true, keyboard: existingUser.dailyTopEnabled ? "profile_notif_on" : "profile_notif_off", telegramId: inputData.telegramId, languageCode };
        }
        return { response: texts2.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode };
      }
      
      if (message === "/referral" || message === "/ref") {
        if (!existingUser) {
          return { response: texts2.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode };
        }
        const refResult2 = await getReferralLinkTool.execute({
          context: { telegramId: inputData.telegramId, botUsername: "BuyWiseBot" },
          mastra,
          runtimeContext: {} as any,
        });
        if (refResult2.success) {
          const refText2 = texts2.referral
            .replace("{link}", refResult2.referralLink || "")
            .replace("{count}", String(refResult2.referralCount || 0));
          return { response: refText2, chatId: inputData.chatId, success: true, keyboard: "back", telegramId: inputData.telegramId, languageCode };
        }
        return { response: "Error getting referral link", chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode };
      }
      
      if (message === "/lang" || message === "/language") {
        return { response: texts2.chooseLang, chatId: inputData.chatId, success: true, keyboard: "language", telegramId: inputData.telegramId, languageCode };
      }
      
      if (message === "/favorites" || message === "/fav") {
        if (!existingUser) {
          return { response: texts2.chooseCountry, chatId: inputData.chatId, success: true, keyboard: "country", telegramId: inputData.telegramId, languageCode };
        }
        const userFavorites = await db
          .select()
          .from(favorites)
          .where(eq(favorites.userId, existingUser.id));
        
        if (userFavorites.length === 0) {
          return { response: texts2.noFavorites, chatId: inputData.chatId, success: true, keyboard: "main", telegramId: inputData.telegramId, languageCode };
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
      
      const isTop = message === "/top" || (inputData.isCallback === true && inputData.callbackData === "action:top10");
      const isSearch = message.length > 1 && !message.startsWith("/");
      
      if (isTop || isSearch) {
        logger?.info("🔍 [Step 1] Direct product search", { isTop, query: message });
        
        let products: any[] = [];
        let totalProducts = 0;
        
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
            totalProducts = result.products.length;
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
            totalProducts = result.products.length;
            products = result.products.slice(0, 5);
          }
        }
        
        logger?.info("✅ [Step 1] Products found", { count: products.length, total: totalProducts });
        
        if (products.length > 0) {
          searchCache.set(inputData.telegramId, { query: message, page: 0, isTop });
          const hasMore = totalProducts > 5;
          const title = isTop ? `🔥 <b>ТОП-${products.length} товарів:</b>` : `🔍 <b>Знайдено ${products.length} товарів:</b>`;
          return {
            response: title,
            chatId: inputData.chatId,
            success: true,
            keyboard: "none",
            products,
            hasMore,
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
    languageCode: z.string().optional(),
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
    hasMore: z.boolean().optional(),
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
      const texts = getTexts(inputData.languageCode || "en");
      
      const SUPPORT_BUTTONS = [
        [{ text: "✍️ Support", url: "https://t.me/SYNTRAM" }],
        [{ text: texts.backMenu, callback_data: "action:menu" }],
      ];
      const PROFILE_BUTTONS_NOTIF_ON = [
        [{ text: texts.changeCountry, callback_data: "settings:country" }],
        [{ text: texts.changeLang, callback_data: "action:language" }],
        [{ text: texts.disableNotif, callback_data: "toggle:daily_off" }],
        [{ text: texts.backMenu, callback_data: "action:menu" }],
      ];
      const PROFILE_BUTTONS_NOTIF_OFF = [
        [{ text: texts.changeCountry, callback_data: "settings:country" }],
        [{ text: texts.changeLang, callback_data: "action:language" }],
        [{ text: texts.enableNotif, callback_data: "toggle:daily_on" }],
        [{ text: texts.backMenu, callback_data: "action:menu" }],
      ];
      switch (inputData.keyboard) {
        case "country": inlineKeyboard = COUNTRY_BUTTONS; break;
        case "main": inlineKeyboard = MAIN_MENU_BUTTONS; break;
        case "profile": inlineKeyboard = PROFILE_BUTTONS; break;
        case "profile_notif_on": inlineKeyboard = PROFILE_BUTTONS_NOTIF_ON; break;
        case "profile_notif_off": inlineKeyboard = PROFILE_BUTTONS_NOTIF_OFF; break;
        case "language": inlineKeyboard = LANGUAGE_BUTTONS; break;
        case "back": inlineKeyboard = BACK_BUTTON; break;
        case "support": inlineKeyboard = SUPPORT_BUTTONS; break;
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
        
        if (inputData.hasMore) {
          const moreButtons = [
            [{ text: "➡️ Показати ще", callback_data: "more:next" }],
            [{ text: "🔙 Меню", callback_data: "action:menu" }],
          ];
          await sendMessage("⬇️ Натисніть щоб побачити більше товарів:", moreButtons);
        } else {
          await sendMessage("📱 Головне меню:", MAIN_MENU_BUTTONS);
        }
        
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
