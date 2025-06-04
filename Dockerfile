FROM node:22

WORKDIR /app

COPY package*.json ./

RUN npm install nodemon -g

COPY . /app

RUN npm install

CMD ["node", "server.js"]
