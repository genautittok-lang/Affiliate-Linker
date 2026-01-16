# Use Node.js 20 as base
FROM node:20-slim

# Install OpenSSL and curl for Prisma/Drizzle and healthchecks
RUN apt-get update && apt-get install -y openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Expose port (Railway will set PORT env var)
EXPOSE 5000

# Health check - use root endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:5000/ || exit 1

# Start command
CMD ["npx", "mastra", "start"]
