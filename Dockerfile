# 1. Usamos la versión de Node que definimos como variable
FROM node:20

# 2. Creamos la carpeta de la app
WORKDIR /app

# 3. Copiamos los archivos de dependencias
COPY package*.json ./

# 4. Instalamos las dependencias
RUN npm install

# 5. Copiamos el resto del código (worker.js)
COPY . .

# 6. Comando para iniciar el worker
CMD ["node", "worker.js"]
