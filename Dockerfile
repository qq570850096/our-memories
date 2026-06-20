# syntax=docker/dockerfile:1

FROM node:22-alpine AS admin-builder

WORKDIR /src

COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/package.json
RUN npm ci --workspace @map-of-us/admin --include-workspace-root=false

COPY apps/admin apps/admin
RUN npm run build -w @map-of-us/admin

FROM golang:1.22-alpine AS builder

WORKDIR /src/backend

RUN apk add --no-cache ca-certificates tzdata

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/our-memories-api ./main.go

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
  && addgroup -S app \
  && adduser -S app -G app \
  && mkdir -p /app/data \
  && chown -R app:app /app

WORKDIR /app

COPY --from=builder /out/our-memories-api ./our-memories-api
COPY --from=admin-builder /src/apps/admin/out ./public/admin

ENV PORT=8080 \
  DATABASE_PATH=/app/data/ourMemories.db \
  AUTO_SEED=true

USER app

EXPOSE 8080
VOLUME ["/app/data"]

CMD ["./our-memories-api"]
