FROM ghcr.io/puppeteer/puppeteer:21.11.0

# Cambiamos a root para instalar lo necesario
USER root

WORKDIR /app

# Copiamos archivos de dependencias
COPY package*.json ./
RUN npm install

# Copiamos el resto del código
COPY . .

# Comando de inicio (coincide con tu imagen)
CMD ["node", "worker.js"]
