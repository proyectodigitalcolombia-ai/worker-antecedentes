FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .

EXPOSE 10000
CMD ["node", "worker.js"]
