# Usamos una versión específica y más ligera
FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root

# Evitamos que Puppeteer intente descargar Chrome otra vez (ya viene en la imagen)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

WORKDIR /app

COPY package*.json ./

# Instalación limpia
RUN npm install --omit=dev

COPY . .

EXPOSE 10000

CMD ["node", "worker.js"]
