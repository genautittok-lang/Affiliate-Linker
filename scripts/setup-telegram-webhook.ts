#!/usr/bin/env npx tsx

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function setupWebhook() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("❌ TELEGRAM_BOT_TOKEN not found in environment variables");
    process.exit(1);
  }

  const webhookUrl = process.argv[2];
  
  if (!webhookUrl) {
    console.error("Usage: npx tsx scripts/setup-telegram-webhook.ts <WEBHOOK_URL>");
    console.error("Example: npx tsx scripts/setup-telegram-webhook.ts https://your-app.replit.app/api/webhooks/telegram/action");
    process.exit(1);
  }

  console.log(`🔧 Setting up Telegram webhook to: ${webhookUrl}`);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message"],
        }),
      }
    );

    const result = await response.json();
    
    if (result.ok) {
      console.log("✅ Webhook set up successfully!");
      console.log("📝 Result:", JSON.stringify(result, null, 2));
    } else {
      console.error("❌ Failed to set up webhook:", result.description);
      process.exit(1);
    }

    console.log("\n📋 Current webhook info:");
    const infoResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
    );
    const info = await infoResponse.json();
    console.log(JSON.stringify(info, null, 2));

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

setupWebhook();
