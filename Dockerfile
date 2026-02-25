# Usamos una imagen que ya tiene Chrome y Node instalados
FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root

WORKDIR /app

# Copiamos solo lo necesario primero para aprovechar el cache
COPY package*.json ./
RUN npm install

# Copiamos el resto del código
COPY . .

# El puerto que configuraste en Render
EXPOSE 10000

# Comando para iniciar
CMD ["node", "worker.js"]
