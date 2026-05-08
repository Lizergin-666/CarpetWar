FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
RUN npm install --include=dev

COPY src ./src

EXPOSE 4000

CMD ["sh", "-c", "npm run start"]
