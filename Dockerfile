FROM node:20-bookworm

# Actualizar e instalar dependencias esenciales
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    xvfb \
    # Dependencias de Chromium/Puppeteer
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
    # Fuentes para que no falle el renderizado
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Instalar Google Chrome estable de forma segura
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' \
    && apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Variable para que Puppeteer use el Chrome instalado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

COPY package*.json ./
RUN npm install

COPY . .

# Exponer el puerto del Health Check
EXPOSE 10000

# Ejecutar con Xvfb para simular pantalla real
CMD ["xvfb-run", "--server-args=-screen 0 1920x1080x24", "node", "worker.js"]
