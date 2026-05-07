FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npm run start -- --port ${PORT:-3000}"]
