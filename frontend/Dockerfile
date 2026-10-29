FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY angular.json tsconfig.json .postcssrc.json ./
COPY src ./src
RUN npm run build
FROM nginxinc/nginx-unprivileged:1.31-alpine
COPY --from=build /app/dist/taskcorp/browser /usr/share/nginx/html
EXPOSE 8080 8443
