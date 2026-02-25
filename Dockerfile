# Usamos la imagen oficial de Puppeteer que ya trae Chrome
FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root
WORKDIR /app

# Copiamos dependencias
COPY package*.json ./
RUN npm install

# Copiamos el resto del código
COPY . .

# Exponemos el puerto para el Health Check de Render
EXPOSE 10000

# Comando de arranque
CMD ["node", "worker.js"]
