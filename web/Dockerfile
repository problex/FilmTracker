FROM node:22-alpine

WORKDIR /app/web

ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE:-}

COPY web/package.json /app/web/package.json
RUN npm install

COPY web /app/web

RUN npm run build

EXPOSE 5173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]

