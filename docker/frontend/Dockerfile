# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
COPY client/package.json client/package-lock.json* ./
RUN npm ci || npm install
COPY client/ ./
ARG VITE_API_ORIGIN=
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN
RUN npm run build

FROM alpine:3.22
RUN apk add --no-cache nginx nginx-mod-http-headers-more wget \
    && mkdir -p /run/nginx /usr/share/nginx/errors \
    && rm -f /etc/nginx/http.d/default.conf
ARG FRONTEND_MODE=standalone
COPY docker/frontend/nginx.main.conf /etc/nginx/nginx.conf
COPY docker/frontend/proxy_api.conf /etc/nginx/proxy_api.conf
COPY docker/frontend/nginx.conf /tmp/nginx.standalone.conf
COPY docker/frontend/nginx.cdn.conf /tmp/nginx.cdn.conf
COPY docker/frontend/error.html /usr/share/nginx/errors/error.html
RUN if [ "$FRONTEND_MODE" = "cdn" ]; then \
      cp /tmp/nginx.cdn.conf /etc/nginx/http.d/default.conf; \
    else \
      cp /tmp/nginx.standalone.conf /etc/nginx/http.d/default.conf; \
    fi
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD wget -qO- http://127.0.0.1/ || wget -qO- http://127.0.0.1/api/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
