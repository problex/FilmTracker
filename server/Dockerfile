FROM node:22-alpine

WORKDIR /app/server

RUN apk add --no-cache postgresql-client chromium nss freetype harfbuzz ca-certificates ttf-freefont

COPY server/package.json /app/server/package.json
RUN npm install

COPY server /app/server

ENV NODE_ENV=production
EXPOSE 4000

RUN npm run build

CMD ["sh", "-c", "until pg_isready -h db -p 5432 -U filmtracker; do echo \"waiting for db...\"; sleep 1; done && npm run db:migrate && npm run db:seed && npm run start"]

