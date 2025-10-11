# @TODO Remove this stage bun to upgrades to Alpine Linux 3.22
FROM alpine:3.22 AS bun-alpine

# Disable the runtime transpiler cache by default inside Docker containers.
# On ephemeral containers, the cache is not useful
ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=${BUN_RUNTIME_TRANSPILER_CACHE_PATH}

# Ensure `bun install -g` works
ARG BUN_INSTALL_BIN=/usr/local/bin
ENV BUN_INSTALL_BIN=${BUN_INSTALL_BIN}

COPY --from=oven/bun:1.3.0-alpine /usr/local/bin/bun /usr/local/bin/
COPY --from=oven/bun:1.3.0-alpine /usr/local/bin/docker-entrypoint.sh /usr/local/bin/
RUN mkdir -p /usr/local/bun-node-fallback-bin && ln -s /usr/local/bin/bun /usr/local/bun-node-fallback-bin/node
ENV PATH "${PATH}:/usr/local/bun-node-fallback-bin"

# Temporarily use the `build`-stage /tmp folder to access the glibc APKs:
RUN --mount=type=bind,from=oven/bun:1.3.0-alpine,source=/tmp,target=/tmp \
    addgroup -g 1000 bun \
    && adduser -u 1000 -G bun -s /bin/sh -D bun \
    && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
    && apk add libgcc libstdc++ \
    && which bun \
    && which bunx \
    && bun --version

WORKDIR /home/bun/app
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/local/bin/bun"]

FROM bun-alpine AS base

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
