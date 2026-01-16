# BuyWise Telegram Bot - Railway Deployment Guide

## Quick Deploy to Railway

### 1. Prerequisites
- Railway account (https://railway.app)
- GitHub repository with this code
- Telegram Bot Token from @BotFather
- AliExpress API credentials

### 2. Deploy Steps

#### Option A: Deploy from GitHub
1. Go to Railway dashboard
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will automatically detect Dockerfile

#### Option B: Deploy with Railway CLI
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### 3. Configure Environment Variables

In Railway dashboard → Your Project → Variables, add:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `DATABASE_URL` | Auto-set when you add PostgreSQL |
| `ALIEXPRESS_APP_KEY` | Your AliExpress API key |
| `ALIEXPRESS_APP_SECRET` | Your AliExpress API secret |
| `ALIEXPRESS_TRACKING_ID` | Your AliExpress tracking ID |
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `PORT` | Set to `5000` |

### 4. Add PostgreSQL Database

1. In Railway dashboard, click "New" → "Database" → "PostgreSQL"
2. Railway automatically sets `DATABASE_URL`
3. Run database migrations (first deploy will handle this)

### 5. Set Telegram Webhook

After deployment, set your webhook:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<YOUR_RAILWAY_URL>/api/inngest/telegram-message"}'
```

Replace:
- `<YOUR_BOT_TOKEN>` with your Telegram bot token
- `<YOUR_RAILWAY_URL>` with your Railway deployment URL

### 6. Verify Deployment

Check webhook status:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

### Domain

Railway provides a free domain: `your-app.up.railway.app`

You can add a custom domain in Railway settings.

## Troubleshooting

### Bot not responding
- Check Railway logs for errors
- Verify webhook is set correctly
- Ensure all environment variables are configured

### Database errors
- Railway PostgreSQL may take a minute to initialize
- Check `DATABASE_URL` is set correctly

### Build failures
- Check Dockerfile syntax
- Ensure all dependencies are in package.json
