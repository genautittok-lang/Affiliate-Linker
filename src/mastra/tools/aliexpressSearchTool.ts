import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const QUALITY_MAPPING = {
  minimum: { minRating: 4.0, minOrders: 50 },
  low: { minRating: 4.0, minOrders: 50 },
  medium: { minRating: 4.3, minOrders: 100 },
  average: { minRating: 4.3, minOrders: 100 },
  high: { minRating: 4.7, minOrders: 300 },
  premium: { minRating: 4.7, minOrders: 300 },
};

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  originalPrice: number;
  currency: string;
  discount: number;
  rating: number;
  orders: number;
  imageUrl: string;
  productUrl: string;
  affiliateUrl: string;
  freeShipping: boolean;
  shippingTo: string;
  shippingCost: number;
  colors: number;
  seller: string;
}

function calculateScore(product: Product, preferCheaper: boolean = false): number {
  const priceWeight = preferCheaper ? 0.15 : 0.05;
  const ratingWeight = 0.35;
  const ordersWeight = 0.30;
  const discountWeight = 0.20;
  const freeShippingWeight = 0.10;
  
  const normalizedPrice = Math.min(product.price / 100, 1);
  const normalizedRating = product.rating / 5;
  const normalizedOrders = Math.min(Math.log10(product.orders + 1) / 5, 1);
  const normalizedDiscount = product.discount / 100;
  
  const score = 
    (normalizedRating * ratingWeight) +
    (normalizedOrders * ordersWeight) +
    (normalizedDiscount * discountWeight) +
    (product.freeShipping ? freeShippingWeight : 0) -
    (normalizedPrice * priceWeight);
  
  return Math.round(score * 1000) / 1000;
}

async function searchAliExpressAPI(
  query: string,
  country: string,
  currency: string,
  filters: {
    minRating?: number;
    maxPrice?: number;
    freeShipping?: boolean;
    onlyDiscount?: boolean;
  }
): Promise<Product[]> {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID;
  
  if (!appKey || !appSecret) {
    console.log("❌ [AliExpress] API keys not configured");
    return [];
  }
  
  try {
    const apiUrl = "https://api-sg.aliexpress.com/sync";
    const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    
    const params: Record<string, string> = {
      app_key: appKey,
      method: "aliexpress.affiliate.product.query",
      sign_method: "hmac-sha256",
      timestamp: timestamp,
      format: "json",
      v: "2.0",
      keywords: query,
      target_currency: currency,
      target_language: "en",
      ship_to_country: getCountryCode(country),
      page_no: "1",
      page_size: "40",
      sort: "SALE_PRICE_ASC",
    };
    
    if (trackingId) {
      params.tracking_id = trackingId;
    }
    if (filters.maxPrice) {
      params.max_sale_price = String(filters.maxPrice * 100);
    }
    if (filters.freeShipping) {
      params.delivery_days = "60";
    }
    
    const sortedParams = Object.keys(params).sort().map(key => `${key}${params[key]}`).join("");
    const crypto = await import("crypto");
    const sign = crypto.createHmac("sha256", appSecret).update(sortedParams).digest("hex").toUpperCase();
    params.sign = sign;
    
    console.log("🔑 [AliExpress] Request params:", JSON.stringify({ ...params, app_key: "***", sign: "***" }));
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams(params).toString(),
    });
    
    if (!response.ok) {
      console.log("❌ [AliExpress] API request failed:", response.statusText);
      return [];
    }
    
    const data = await response.json();
    console.log("📦 [AliExpress] API response:", JSON.stringify(data).slice(0, 500));
    
    const products = data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product || [];
    
    if (products.length === 0) {
      console.log("⚠️ [AliExpress] No products from API");
    }
    
    return products.map((p: any) => ({
      id: p.product_id,
      title: p.product_title,
      description: p.product_title,
      price: parseFloat(p.target_sale_price || p.target_original_price),
      originalPrice: parseFloat(p.target_original_price),
      currency: currency,
      discount: p.discount ? parseInt(p.discount.replace("%", "")) : 0,
      rating: parseFloat(p.evaluate_rate?.replace("%", "") || "0") / 20,
      orders: parseInt(p.lastest_volume || "0"),
      imageUrl: p.product_main_image_url,
      productUrl: p.product_detail_url,
      affiliateUrl: p.promotion_link || p.product_detail_url,
      freeShipping: p.ship_to_days ? true : false,
      shippingTo: country,
      shippingCost: 0,
      colors: 1,
      seller: p.shop_title || "AliExpress Seller",
    }));
  } catch (error) {
    console.error("❌ [AliExpress] API error:", error);
    return [];
  }
}

function getCountryCode(country: string): string {
  const codes: Record<string, string> = {
    "Ukraine": "UA", "Україна": "UA",
    "Germany": "DE", "Deutschland": "DE", "Німеччина": "DE",
    "Poland": "PL", "Polska": "PL", "Польща": "PL",
    "United Kingdom": "GB", "UK": "GB",
    "France": "FR", "Франція": "FR",
    "Spain": "ES", "España": "ES",
    "Italy": "IT", "Italia": "IT",
    "Czech Republic": "CZ", "Czechia": "CZ",
    "Romania": "RO", "România": "RO",
    "Russia": "RU", "Россия": "RU",
    "USA": "US", "United States": "US",
  };
  return codes[country] || "US";
}

function generateDemoProducts(
  query: string,
  country: string,
  currency: string,
  filters: { minRating?: number; maxPrice?: number; freeShipping?: boolean; onlyDiscount?: boolean }
): Product[] {
  const baseProducts = [
    { name: "Premium Quality", basePrice: 15.99, rating: 4.8, orders: 5234, discount: 45, colors: 8 },
    { name: "Best Seller", basePrice: 12.49, rating: 4.7, orders: 12456, discount: 35, colors: 12 },
    { name: "Top Rated", basePrice: 18.99, rating: 4.9, orders: 3421, discount: 50, colors: 6 },
    { name: "Popular Choice", basePrice: 9.99, rating: 4.5, orders: 8765, discount: 30, colors: 10 },
    { name: "Value Pack", basePrice: 7.49, rating: 4.4, orders: 15678, discount: 40, colors: 5 },
    { name: "Economy Option", basePrice: 5.99, rating: 4.3, orders: 23456, discount: 25, colors: 4 },
    { name: "Deluxe Edition", basePrice: 24.99, rating: 4.8, orders: 2345, discount: 55, colors: 15 },
    { name: "Standard Pack", basePrice: 11.99, rating: 4.6, orders: 6789, discount: 20, colors: 8 },
    { name: "Mega Bundle", basePrice: 19.99, rating: 4.7, orders: 4567, discount: 60, colors: 20 },
    { name: "Starter Kit", basePrice: 8.49, rating: 4.4, orders: 9876, discount: 15, colors: 3 },
    { name: "Pro Version", basePrice: 29.99, rating: 4.9, orders: 1234, discount: 40, colors: 6 },
    { name: "Lite Edition", basePrice: 6.99, rating: 4.2, orders: 18765, discount: 35, colors: 4 },
  ];
  
  return baseProducts.map((p, i) => {
    const originalPrice = p.basePrice;
    const salePrice = originalPrice * (1 - p.discount / 100);
    const freeShipping = Math.random() > 0.4;
    
    return {
      id: `demo_${i}_${Date.now()}`,
      title: `${query} - ${p.name}`,
      description: `High quality ${query} with excellent reviews. ${p.name} edition with ${p.colors} color options available.`,
      price: Math.round(salePrice * 100) / 100,
      originalPrice: originalPrice,
      currency: currency,
      discount: p.discount,
      rating: p.rating,
      orders: p.orders,
      imageUrl: `https://picsum.photos/seed/${i + Date.now()}/400/400`,
      productUrl: `https://aliexpress.com/item/${i}.html`,
      affiliateUrl: `https://s.click.aliexpress.com/e/_${i}`,
      freeShipping: freeShipping,
      shippingTo: country,
      shippingCost: freeShipping ? 0 : Math.round(Math.random() * 5 * 100) / 100,
      colors: p.colors,
      seller: `TopSeller${i + 1}`,
    };
  }).filter(p => {
    if (filters.minRating && p.rating < filters.minRating) return false;
    if (filters.maxPrice && p.price > filters.maxPrice) return false;
    if (filters.freeShipping && !p.freeShipping) return false;
    if (filters.onlyDiscount && p.discount === 0) return false;
    return true;
  });
}

export const searchProductsTool = createTool({
  id: "search-aliexpress-products",
  description: "Searches AliExpress for products based on query and filters. Returns TOP-10 products scored by rating, orders, discount, and price. Use this when user wants to find products on AliExpress.",
  inputSchema: z.object({
    query: z.string().describe("Product search query (e.g., 'cotton socks size 43')"),
    country: z.string().describe("Country for shipping (e.g., 'Germany', 'Ukraine')"),
    currency: z.string().describe("Currency for prices (e.g., 'EUR', 'UAH', 'USD')"),
    quality: z.enum(["minimum", "low", "medium", "average", "high", "premium", "default"])
      .describe("Quality level filter: minimum/low (rating>=4.0, orders>=50), medium/average (4.3-4.6, orders>=100), high/premium (rating>=4.7, orders>=300), default (rating>=4.5)"),
    maxPrice: z.number().describe("Maximum price filter. Use 0 for no limit."),
    freeShipping: z.boolean().describe("Only show products with free shipping. Use false if not specified."),
    onlyDiscount: z.boolean().describe("Only show discounted products. Use false if not specified."),
    preferCheaper: z.boolean().describe("Give more weight to cheaper products in scoring. Use false if not specified."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    products: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      price: z.number(),
      originalPrice: z.number(),
      currency: z.string(),
      discount: z.number(),
      rating: z.number(),
      orders: z.number(),
      imageUrl: z.string(),
      affiliateUrl: z.string(),
      freeShipping: z.boolean(),
      shippingTo: z.string(),
      colors: z.number(),
      score: z.number(),
    })),
    totalFound: z.number(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [searchProductsTool] Searching:", context);
    
    try {
      const qualityFilter = context.quality && context.quality !== "default" ? QUALITY_MAPPING[context.quality as keyof typeof QUALITY_MAPPING] : { minRating: 4.5, minOrders: 50 };
      
      const products = await searchAliExpressAPI(
        context.query,
        context.country,
        context.currency,
        {
          minRating: qualityFilter.minRating,
          maxPrice: context.maxPrice,
          freeShipping: context.freeShipping,
          onlyDiscount: context.onlyDiscount,
        }
      );
      
      let filteredProducts = products.filter(p => 
        p.rating >= qualityFilter.minRating && p.orders >= qualityFilter.minOrders
      );
      
      const scoredProducts = filteredProducts.map(p => ({
        ...p,
        score: calculateScore(p, context.preferCheaper),
      }));
      
      scoredProducts.sort((a, b) => b.score - a.score);
      const top10 = scoredProducts.slice(0, 10);
      
      logger?.info(`✅ [searchProductsTool] Found ${top10.length} products`);
      
      return {
        success: true,
        products: top10.map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          price: p.price,
          originalPrice: p.originalPrice,
          currency: p.currency,
          discount: p.discount,
          rating: p.rating,
          orders: p.orders,
          imageUrl: p.imageUrl,
          affiliateUrl: p.affiliateUrl,
          freeShipping: p.freeShipping,
          shippingTo: p.shippingTo,
          colors: p.colors,
          score: p.score,
        })),
        totalFound: products.length,
        message: `Found ${top10.length} top products for "${context.query}"`,
      };
    } catch (error) {
      logger?.error("❌ [searchProductsTool] Error:", error);
      return {
        success: false,
        products: [],
        totalFound: 0,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

export const getTopProductsTool = createTool({
  id: "get-top-products-today",
  description: "Gets today's TOP-10 trending products from AliExpress based on user's country. Use this for daily recommendations.",
  inputSchema: z.object({
    country: z.string().describe("User's country for shipping"),
    currency: z.string().describe("User's currency"),
    category: z.string().describe("Product category filter. Use empty string for trending products across all categories."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
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
    })),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [getTopProductsTool] Getting top products for:", context.country);
    
    try {
      const trendingQueries = ["bestseller", "trending", "hot deals", "popular"];
      const randomQuery = trendingQueries[Math.floor(Math.random() * trendingQueries.length)];
      
      const products = await searchAliExpressAPI(
        context.category || randomQuery,
        context.country,
        context.currency,
        { minRating: 4.5 }
      );
      
      const scoredProducts = products
        .filter(p => p.rating >= 4.5 && p.orders >= 100)
        .map(p => ({ ...p, score: calculateScore(p) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      
      logger?.info(`✅ [getTopProductsTool] Found ${scoredProducts.length} top products`);
      
      return {
        success: true,
        products: scoredProducts.map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          originalPrice: p.originalPrice,
          currency: p.currency,
          discount: p.discount,
          rating: p.rating,
          orders: p.orders,
          imageUrl: p.imageUrl,
          affiliateUrl: p.affiliateUrl,
          freeShipping: p.freeShipping,
        })),
        message: `Here are today's TOP-10 deals for ${context.country}!`,
      };
    } catch (error) {
      logger?.error("❌ [getTopProductsTool] Error:", error);
      return {
        success: false,
        products: [],
        message: `Error getting top products: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

export const getBestUnderPriceTool = createTool({
  id: "get-best-under-price",
  description: "Gets best products under a specific price. Use this when user says '/best 20' or 'best under 50 euros'.",
  inputSchema: z.object({
    maxPrice: z.number().describe("Maximum price limit"),
    country: z.string().describe("User's country"),
    currency: z.string().describe("User's currency"),
    category: z.string().describe("Product category. Use empty string for general deals."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    products: z.array(z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
      currency: z.string(),
      discount: z.number(),
      rating: z.number(),
      affiliateUrl: z.string(),
    })),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [getBestUnderPriceTool] Getting best under:", context.maxPrice);
    
    try {
      const products = await searchAliExpressAPI(
        context.category || "deals",
        context.country,
        context.currency,
        { maxPrice: context.maxPrice, minRating: 4.3 }
      );
      
      const filtered = products
        .filter(p => p.price <= context.maxPrice && p.rating >= 4.3)
        .map(p => ({ ...p, score: calculateScore(p, true) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      
      logger?.info(`✅ [getBestUnderPriceTool] Found ${filtered.length} products`);
      
      return {
        success: true,
        products: filtered.map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          currency: p.currency,
          discount: p.discount,
          rating: p.rating,
          affiliateUrl: p.affiliateUrl,
        })),
        message: `Best products under ${context.maxPrice} ${context.currency}`,
      };
    } catch (error) {
      logger?.error("❌ [getBestUnderPriceTool] Error:", error);
      return {
        success: false,
        products: [],
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
