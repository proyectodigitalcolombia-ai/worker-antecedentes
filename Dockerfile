# 1. Usamos la imagen completa de Node 20 basada en Debian Bookworm
FROM node:20-bookworm

# 2. Instalamos dependencias del sistema para Chrome y Xvfb
# Se incluyen fuentes y librerías de renderizado para evitar errores en el portal de la Policía
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    xvfb \
    libnss3 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxss1 \
    libgtk-3-0 \
    libxshmfence1 \
    libglu1-mesa \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# 3. Instalamos Google Chrome Estable de forma segura (método GPG moderno)
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' \
    && apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 4. Configuramos el directorio de trabajo
WORKDIR /app

# 5. Variables de entorno críticas
# Forzamos a Puppeteer a usar el Chrome que acabamos de instalar
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
# Recordamos tu preferencia: Node versión 20
ENV NODE_VERSION=20

# 6. Instalamos las dependencias de Node
COPY package*.json ./
RUN npm install

# 7. Copiamos el resto del código (worker.js, etc.)
COPY . .

# 8. Exponemos el puerto para el Health Check de Render
EXPOSE 10000

# 9. COMANDO DE ARRANQUE (Xvfb + Node)
# Este comando crea la pantalla virtual :99 antes de lanzar tu worker
CMD ["xvfb-run", "--server-args=-screen 0 1920x1080x24", "node", "worker.js"]
