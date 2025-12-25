# BuyWise Telegram Bot

## Overview

This is a Telegram bot for AliExpress affiliate product discovery, built with the Mastra AI framework. The bot helps users find top products from AliExpress with localized language, currency, and shipping options based on their country. It supports 10 languages (Ukrainian, Russian, German, Polish, English, French, Spanish, Italian, Czech, Romanian) and automatically determines currency from the user's country selection.

The application uses Mastra's agent and workflow system with Inngest for durable workflow execution, ensuring reliable message handling and automated daily product recommendations.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **Cron Triggers** (`src/triggers/cronTriggers.ts`): Time-based automation for daily product recommendations
- Triggers register API routes through the Inngest integration layer

### Database Layer
- **PostgreSQL** with Drizzle ORM for data persistence
- **Schema** (`src/db/schema.ts`): Users table (telegram ID, language, country, currency, preferences), favorites, search history, translation cache
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
- `OPENAI_API_KEY`: OpenAI API access