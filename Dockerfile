FROM oven/bun:1.2.20-alpine AS base

RUN apk add --no-cache \
    openssh-client \
    docker-cli \
    docker-cli-compose

FROM base AS builder

COPY package.json bun.lock ./

RUN bun install

COPY . .

ENV NODE_ENV=production
RUN bunx @tailwindcss/cli --minify -i ./src/frontend/index.css -o ./src/frontend/index-out.css
RUN mv ./src/frontend/index-out.css ./src/frontend/index.css
RUN bun build src/index.tsx --minify --target=bun --outdir=dist

ENV NODE_ENV=development
CMD ["bun", "dev"]

FROM base AS production

ARG TARGETPLATFORM

LABEL org.opencontainers.image.source=https://github.com/DigitallyRefined/containers-up
LABEL org.opencontainers.image.description="containers-up ${TARGETPLATFORM}"

COPY --from=builder /home/bun/app/dist .

EXPOSE 3000
EXPOSE 3001

ENV NODE_ENV=production
CMD ["bun", "."]
