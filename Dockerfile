FROM oven/bun:1.3.8-alpine AS base

RUN apk upgrade --no-cache

RUN apk add --no-cache \
    openssh-client \
    docker-cli \
    docker-cli-compose \
    apprise

FROM base AS builder

COPY package.json bun.lock ./

RUN bun install

COPY . .

ENV NODE_ENV=production
RUN bunx @tailwindcss/cli --minify -i ./src/frontend/index.css -o ./src/frontend/index-out.css
RUN mv ./src/frontend/index-out.css ./src/frontend/index.css
RUN bun build src/index.ts --minify --target=bun --outdir=dist

ENV NODE_ENV=development
CMD ["sh", "-c", "crond -l 8 && bun dev"]

FROM base AS production

ARG TARGETPLATFORM

LABEL org.opencontainers.image.source=https://github.com/DigitallyRefined/containers-up
LABEL org.opencontainers.image.description="containers-up ${TARGETPLATFORM}"

COPY --from=builder /home/bun/app/src/backend/db/migrations/*.sql .
COPY --from=builder /home/bun/app/dist .

EXPOSE 3000
EXPOSE 3001

ENV NODE_ENV=production
CMD ["sh", "-c", "crond -l 8 && bun ."]
