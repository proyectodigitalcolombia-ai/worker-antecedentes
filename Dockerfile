FROM ghcr.io/puppeteer/puppeteer:latest

USER root

WORKDIR /app

# Instalamos dependencias del sistema necesarias
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    --no-install-recommends

# Copiamos archivos de dependencias
COPY package*.json ./

# Instalamos librerías de Node
RUN npm install

# Copiamos el resto del código
COPY . .

# Puerto que configuramos en Render
EXPOSE 10000

# Comando para arrancar el Worker
CMD ["node", "worker.js"]
