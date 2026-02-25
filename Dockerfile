FROM node:20

# Instalamos librerías necesarias para que Chrome corra en Linux
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates procps libxss1 \
    libasound2 libnss3 lsb-release xdg-utils \
    fonts-liberation libgbm1 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx puppeteer install
COPY . .

# El worker también necesita un puerto para que Render lo vea "vivo"
EXPOSE 10000
CMD ["node", "worker.js"]
