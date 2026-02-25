FROM node:20-bookworm

# Instalación de dependencias del sistema, fuentes y herramientas de X11
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates xvfb xauth x11-xkb-utils x11-utils dbus-x11 \
    xfonts-base xfonts-75dpi xfonts-100dpi \
    libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libgbm1 \
    libasound2 libpangocairo-1.0-0 libxss1 libgtk-3-0 libxshmfence1 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Instalación de Google Chrome Estable
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' \
    && apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Variables de entorno para Puppeteer y Node 20
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV DISPLAY=:99
ENV NODE_VERSION=20

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 10000

# Comando de arranque: Limpia locks, inicia Xvfb en fondo, espera y arranca Node
CMD ["sh", "-c", "Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset & sleep 2 && node worker.js"]
