# syntax=docker/dockerfile:1

FROM node:22-alpine AS admin-ui
WORKDIR /app
COPY client/package.json client/package-lock.json* ./
RUN npm ci || npm install
COPY client/ ./
RUN npm run build:admin && npm run build:gate

FROM rust:1.88-alpine AS builder
WORKDIR /app

RUN apk add --no-cache musl-dev pkgconfig cmake clang clang-dev make git linux-headers

COPY Cargo.toml Cargo.lock ./
COPY src ./src

ENV CARGO_PROFILE_RELEASE_LTO=false
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=4

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target \
    cargo build --release --locked \
    && cp /app/target/release/kryivka_org /kryivka_org

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget \
    && adduser -D -H -u 1000 kryivka
WORKDIR /app
COPY --from=builder /kryivka_org /usr/local/bin/kryivka_org
COPY --from=admin-ui --chown=kryivka:kryivka /app/dist-admin /app/admin-dist
COPY --from=admin-ui --chown=kryivka:kryivka /app/dist-gate/admin-gate.js /app/admin-gate.js
ENV ADMIN_DIST=/app/admin-dist
ENV ADMIN_GATE_JS=/app/admin-gate.js
USER kryivka
EXPOSE 8082
HEALTHCHECK --interval=10s --timeout=5s --retries=12 \
    CMD wget -qO- http://127.0.0.1:8082/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/kryivka_org"]
