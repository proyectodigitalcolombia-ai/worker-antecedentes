# 1. Usamos la imagen oficial de Node.js versión 20
FROM node:20

# 2. Creamos la carpeta donde vivirá el código dentro del servidor
WORKDIR /app

# 3. Copiamos los archivos de configuración de dependencias
COPY package*.json ./

# 4. Instalamos las librerías (incluyendo el proxy-agent y jsdom)
RUN npm install

# 5. Copiamos el resto del código (tu worker.js)
COPY . .

# 6. Exponemos el puerto que usa Express
EXPOSE 10000

# 7. El comando para arrancar el Worker
CMD ["npm", "start"]
