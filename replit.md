# BuyWise Telegram Bot

## Overview

This is a Telegram bot for AliExpress affiliate product discovery, built with the Mastra AI framework. The bot helps users find top products from AliExpress with localized language, currency, and shipping options based on their country. It supports 10 languages (Ukrainian, Russian, German, Polish, English, French, Spanish, Italian, Czech, Romanian) and automatically determines currency from the user's country selection.

The application uses Mastra's agent and workflow system with Inngest for durable workflow execution, ensuring reliable message handling and automated daily product recommendations.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (December 2025)

### Referral Program
- Database: `referrals` table tracks referrer/referred relationships
- Users table: Added `referralCode`, `referredBy`, `firstName` fields
- Tools: `getReferralLinkTool` generates unique invite links, `processReferralTool` handles referral tracking
- Users can share `t.me/BuyWiseBot?start=CODE` links and see referral stats in profile

### Admin Panel & Support
- Admin ID: 7820995179 (username @bogdan_OP24) - ONLY admin account
- Admin access via /admin command ONLY (no button in main menu)
- Tools: `isAdmin` checks admin status, `getSupportInfoTool` provides localized support templates
- Support button links directly to admin with pre-filled message templates
- Broadcast feature: Admin clicks "📢 Broadcast" → writes text → sends to all users
- Database: `pendingAction` column tracks admin broadcast state

### Personalized Greetings
- Welcome messages use `{name}` placeholder for personalization
- `welcomeBack` messages for returning users
- All 10 languages updated with vibrant, emoji-rich messages

### Fully Localized Profile & Notification Toggle
- Profile buttons dynamically localized in all 10 languages
- LangTexts interface extended with: notifEnabled, notifDisabled, enableNotif, disableNotif, notifOn, notifOff, changeCountry, changeLang, backMenu
- Notification status shown in profile using localized text
- Toggle buttons show Enable/Disable based on user's current dailyTopEnabled status
- languageCode passed through workflow for dynamic button localization

### Scheduled Daily Broadcasts
- Cron function runs at 10:00 AM daily via Inngest
- Fetches real TOP-10 products per country using AliExpress API
- Sends localized messages with product photos and affiliate links
- Users can disable notifications via `toggle:daily_off` callback
- Notification settings toggle available in profile

### Category Browsing
- 7 categories: Electronics, Clothing, Home, Beauty, Gadgets, Gifts, Under $10
- Full localization in all 10 languages (catElectronics, catClothing, etc.)
- Categories button in main menu, callback handler "cat:electronics" etc.
- Under $10 uses maxPrice filter for budget-friendly items

### Search History
- Auto-saves searches to searchHistory table
- Displays last 5 searches with numbered buttons (1️⃣-5️⃣)
- Repeat callback handler triggers same search again
- LangTexts: recentSearches, noSearchHistory

### Referral Coupon System (Progressive Milestones)
- 4 milestone levels: 1 friend (3%), 3 friends (5%), 5 friends (10%), 10 friends (15% VIP)
- Automatic coupon generation at each milestone with notification to referrer
- Coupons page in profile showing all earned coupons and progress to next milestone
- Coupon codes format: BW{percent}-{userId}-{timestamp}
- Coupons table: userId, code, discountPercent, earnedForReferrals, isUsed, expiresAt
- LangTexts: myCoupons, couponsTitle, noCoupons, couponItem, nextMilestone, allMilestonesReached, newCouponEarned

### Price Drop Notifications
- Cron at 18:00 checks all favorites for price changes
- Notifies users if price dropped 5%+ with localized message
- Updates currentPrice in favorites table for tracking
- Localized in all 10 languages (title, dropped, viewBtn)

### Gamification & Analytics (January 2026)
- **Click Analytics**: `clickAnalytics` table tracks all user actions (search, view_hot_deals, add_favorite)
- **Points System**: Users earn points for activity (+1 per search, +10 first search, +15 first favorite, +25 first referral, +50 for 10 searches, +100 for 5 referrals)
- **Leaderboard**: Top 10 users by points displayed in main menu with medal emojis (🥇🥈🥉)
- **Achievements**: 5 achievement types stored in `achievements` table:
  - first_search, first_favorite, first_referral, searches_10, referrals_5
- **User Stats**: Personal statistics page showing searches, favorites, referrals, clicks, points, and streak
- **Hot Deals**: Dedicated button for products with high discounts (onlyDiscount filter)
- **Enhanced Profile**: New buttons for Coupons, Achievements, and Stats
- **Database**: Added `points`, `streak`, `lastActiveAt` columns to users table

### Pagination & UX Improvements (January 2026)
- **"More" Button**: After showing products, a "Ще" / "More" button appears to load additional items
- **Pagination Support**: Works for search, categories, TOP-10, hot deals, and search history repeats
- **Page Size**: 5 products per page for search/categories/hot deals, 10 for TOP-10
- **Message Editing**: Uses editMessageText instead of sendMessage for menu callbacks to reduce chat clutter
- **messageId Tracking**: Callbacks now include messageId for in-place message updates
- **Localized "More" Button**: Translations in all 10 languages (Ще/Ещё/More/Mehr/Więcej/Plus/Más/Altro/Další/Mai mult)

### Bug Fixes & Improvements (January 2026)
- **Unique Referral Codes**: `generateUniqueReferralCode()` async function with DB collision check and 5-retry logic
- **DB Constraint**: Unique constraint on `users.referralCode` column to prevent duplicates
- **Product Cache Table**: New `product_cache` table stores product data for favorites (productId, title, url, image, price, currency)
- **Favorites Fix**: Short callback format `fav:add:{productId}` avoids Telegram 64-byte limit; products fetched from cache
- **Admin Panel**: Enhanced with "Users by Country" (flag emojis), "Broadcast History" (last 10), improved button layout

## System Architecture

### Core Framework
- **Mastra Framework**: TypeScript-based AI agent framework providing agents, tools, workflows, and memory management
- **Inngest Integration**: Durable workflow execution layer that persists state and enables reliable step-by-step processing with automatic retries

### Agent Architecture
- **BuyWise Agent** (`src/mastra/agents/buyWiseAgent.ts`): Main AI agent handling user interactions, product searches, and personalized recommendations
- Uses OpenAI models through the AI SDK provider system
- Memory-enabled for conversation history and semantic recall

### Workflow System
- **Telegram Bot Workflow** (`src/mastra/workflows/telegramBotWorkflow.ts`): Orchestrates message processing through defined steps
- Workflows use `createWorkflow` and `createStep` with Zod schemas for type-safe input/output
- Steps can call agents via `mastra.getAgent()` and use `agent.generateLegacy()` for Replit Playground UI compatibility

### Trigger System
- **Telegram Triggers** (`src/triggers/telegramTriggers.ts`): Webhook-based message handling for incoming Telegram messages and callbacks
- **Daily Broadcast Cron** (`src/mastra/inngest/index.ts`): Inngest cron function for 10 AM broadcasts
- Triggers register API routes through the Inngest integration layer

### Database Layer
- **PostgreSQL** with Drizzle ORM for data persistence
- **Schema** (`src/db/schema.ts`): 
  - Users table (telegram ID, firstName, language, country, currency, dailyTopEnabled, referralCode, referredBy, points, streak, lastActiveAt)
  - Favorites table (product tracking with currentPrice/originalPrice for price drop detection)
  - Search history table
  - Translation cache table
  - Referrals table (referrer/referred relationships)
  - Broadcasts table (admin broadcast logs)
  - Coupons table (referral reward coupons)
  - Click analytics table (user action tracking)
  - Achievements table (user achievement tracking)
  - Hot deals table (discounted products cache)
- Shared storage instance for Mastra workflows and memory

### Entry Point
- **Main Mastra Instance** (`src/mastra/index.ts`): Registers agents, workflows, triggers, and configures Inngest serving
- Uses `PinoLogger` for structured logging
- Triggers must be registered before Mastra initialization

## External Dependencies

### AI/LLM Services
- **OpenAI API**: Primary language model provider via `@ai-sdk/openai`
- **OpenRouter**: Alternative model routing via `@openrouter/ai-sdk-provider`

### Messaging Platform
- **Telegram Bot API**: Webhook-based bot communication, requires `TELEGRAM_BOT_TOKEN` environment variable

### Database
- **PostgreSQL**: Primary data store via `postgres` driver and `drizzle-orm`
- **LibSQL**: Alternative storage option for Mastra memory via `@mastra/libsql`

### Workflow Orchestration
- **Inngest**: Durable execution platform for workflow reliability via `inngest` and `@mastra/inngest`
- Inngest dev server runs on port 3000, Mastra server on port 5000

### Required Environment Variables
- `TELEGRAM_BOT_TOKEN`: Telegram bot authentication
- `DATABASE_URL`: PostgreSQL connection string
- `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_TRACKING_ID`: AliExpress API credentials

## Railway Deployment

Project is ready for Railway hosting:
- `Dockerfile`: Production-ready container config with health checks
- `railway.json`: Railway-specific deployment configuration
- `.env.example`: Template for all required environment variables
- `RAILWAY_DEPLOY.md`: Step-by-step deployment instructions

Deploy steps:
1. Push code to GitHub
2. Connect Railway to GitHub repo
3. Add PostgreSQL database in Railway
4. Set environment variables
5. Set Telegram webhook to Railway URL
