import { getTranslation } from "./translateTool";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

export async function sendPhoto(
  chatId: string,
  photoUrl: string,
  caption: string,
  replyMarkup?: InlineKeyboard
): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.error("❌ [Telegram] BOT_TOKEN not set");
    return false;
  }

  try {
    const body: any = {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption,
      parse_mode: "HTML",
    };

    if (replyMarkup) {
      body.reply_markup = JSON.stringify(replyMarkup);
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("❌ [Telegram] sendPhoto failed:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("❌ [Telegram] sendPhoto error:", error);
    return false;
  }
}

export async function sendMessage(
  chatId: string,
  text: string,
  replyMarkup?: InlineKeyboard
): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.error("❌ [Telegram] BOT_TOKEN not set");
    return false;
  }

  try {
    const body: any = {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    if (replyMarkup) {
      body.reply_markup = JSON.stringify(replyMarkup);
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("❌ [Telegram] sendMessage failed:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("❌ [Telegram] sendMessage error:", error);
    return false;
  }
}

export async function editMessageReplyMarkup(
  chatId: string,
  messageId: string,
  replyMarkup: InlineKeyboard
): Promise<boolean> {
  if (!BOT_TOKEN) return false;

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: JSON.stringify(replyMarkup),
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export interface ProductCardData {
  id: string;
  title: string;
  price: number;
  originalPrice: number;
  currency: string;
  discount: number;
  rating: number;
  orders: number;
  imageUrl: string;
  affiliateUrl: string;
  isFavorite?: boolean;
}

export function formatProductCard(product: ProductCardData, lang: string = "uk"): string {
  const formattedOrders = product.orders >= 1000 
    ? `${(product.orders / 1000).toFixed(1)}K` 
    : String(product.orders);
  
  const priceText = product.discount > 0
    ? `<s>${product.originalPrice.toFixed(0)}</s> <b>${product.price.toFixed(0)} ${product.currency}</b> (-${product.discount}%)`
    : `<b>${product.price.toFixed(0)} ${product.currency}</b>`;

  return `📦 <b>${product.title}</b>\n\n⭐ ${product.rating.toFixed(1)} | 📦 ${formattedOrders} | ${priceText}`;
}

export function createProductKeyboard(
  product: ProductCardData,
  lang: string = "uk",
  currentIndex: number = 0,
  totalProducts: number = 1
): InlineKeyboard {
  const buttons: InlineButton[][] = [];
  
  buttons.push([
    { text: getTranslation(lang, "buy"), url: product.affiliateUrl },
    { 
      text: product.isFavorite ? getTranslation(lang, "unlike") : getTranslation(lang, "like"), 
      callback_data: `fav:${product.id}` 
    },
  ]);
  
  if (totalProducts > 1) {
    const navButtons: InlineButton[] = [];
    if (currentIndex > 0) {
      navButtons.push({ text: getTranslation(lang, "prev"), callback_data: `nav:${currentIndex - 1}` });
    }
    navButtons.push({ text: `${currentIndex + 1}/${totalProducts}`, callback_data: "noop" });
    if (currentIndex < totalProducts - 1) {
      navButtons.push({ text: getTranslation(lang, "next"), callback_data: `nav:${currentIndex + 1}` });
    }
    buttons.push(navButtons);
  }
  
  return { inline_keyboard: buttons };
}

export function createLanguageKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "🇺🇦 Українська", callback_data: "lang:uk" },
        { text: "🇷🇺 Русский", callback_data: "lang:ru" },
      ],
      [
        { text: "🇬🇧 English", callback_data: "lang:en" },
        { text: "🇩🇪 Deutsch", callback_data: "lang:de" },
      ],
      [
        { text: "🇵🇱 Polski", callback_data: "lang:pl" },
        { text: "🇫🇷 Français", callback_data: "lang:fr" },
      ],
      [
        { text: "🇪🇸 Español", callback_data: "lang:es" },
        { text: "🇮🇹 Italiano", callback_data: "lang:it" },
      ],
      [
        { text: "🇨🇿 Čeština", callback_data: "lang:cs" },
        { text: "🇷🇴 Română", callback_data: "lang:ro" },
      ],
    ],
  };
}

export function createCountryKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "🇺🇦 Ukraine", callback_data: "country:Ukraine:UAH" },
        { text: "🇵🇱 Poland", callback_data: "country:Poland:PLN" },
      ],
      [
        { text: "🇩🇪 Germany", callback_data: "country:Germany:EUR" },
        { text: "🇫🇷 France", callback_data: "country:France:EUR" },
      ],
      [
        { text: "🇪🇸 Spain", callback_data: "country:Spain:EUR" },
        { text: "🇮🇹 Italy", callback_data: "country:Italy:EUR" },
      ],
      [
        { text: "🇨🇿 Czech Republic", callback_data: "country:Czech Republic:CZK" },
        { text: "🇷🇴 Romania", callback_data: "country:Romania:RON" },
      ],
      [
        { text: "🇬🇧 UK", callback_data: "country:United Kingdom:GBP" },
        { text: "🇺🇸 USA", callback_data: "country:USA:USD" },
      ],
    ],
  };
}

export function createMainMenuKeyboard(lang: string = "uk"): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "🔥 TOP-10", callback_data: "cmd:top" },
        { text: "❤️ " + getTranslation(lang, "favorites").replace("❤️ ", ""), callback_data: "cmd:favorites" },
      ],
      [
        { text: "🌐 " + getTranslation(lang, "chooseLanguage").replace("🌐 ", ""), callback_data: "cmd:lang" },
        { text: getTranslation(lang, "settings"), callback_data: "cmd:settings" },
      ],
    ],
  };
}
