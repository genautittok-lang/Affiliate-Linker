# Use Node.js 20 as base
FROM node:20-slim

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

# Start command
CMD ["npm", "start"]
