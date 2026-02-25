# Usamos la imagen oficial de Puppeteer que ya viene con Chrome y dependencias de Linux
FROM ghcr.io/puppeteer/puppeteer:21.11.0

# Cambiamos a root para configurar el directorio y permisos
USER root

# Definimos el directorio de trabajo
WORKDIR /app

# Copiamos los archivos de dependencias primero para aprovechar la cache de Docker
COPY package*.json ./

# Instalamos las dependencias
RUN npm install

# Copiamos el resto del código del worker
COPY . .

# Exponemos el puerto 10000 para Render (Port Binding)
EXPOSE 10000

# Comando para arrancar el worker
CMD ["node", "worker.js"]
