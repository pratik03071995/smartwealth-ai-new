# Frontend Dockerfile for SmartWealth AI
FROM node:20-alpine AS build
WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY frontend/ .
RUN npm run build

FROM nginx:1.25-alpine
WORKDIR /usr/share/nginx/html

# Remove default static assets
RUN rm -rf ./*

COPY --from=build /app/dist .
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
