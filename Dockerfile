FROM node:20-slim

# Встановлюємо все необхідне, включно з Python
RUN apt-get update && apt-get install -y \
  openssl \
  ca-certificates \
  curl \
  python3 \
  python-is-python3 \
  && rm -rf /var/lib/apt/lists/*

# Робоча директорія
WORKDIR /app

# Копіюємо залежності
COPY package*.json ./
RUN npm install

# Копіюємо весь код
COPY . .

# Білд Mastra
RUN npm run build

# Порт (Mastra зазвичай 5000)
EXPOSE 5000

# Healthcheck (не обовʼязково, але корисно)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:5000/ || exit 1

# Старт сервера
CMD ["npx", "mastra", "start"]
