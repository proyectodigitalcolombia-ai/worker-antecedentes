# Usamos la versión de Node que definimos en tus requerimientos
FROM node:20-slim

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer el puerto para el Health Check de Render
EXPOSE 10000

# Comando para arrancar
CMD ["npm", "start"]
