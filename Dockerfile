FROM oven/bun:1.2.20-alpine AS builder

RUN apk add --no-cache \
    openssh-client \
    docker-cli \
    docker-cli-compose

COPY package.json bun.lock ./

RUN bun install

COPY . .

ENV NODE_ENV=production

RUN bunx @tailwindcss/cli --minify -i ./src/frontend/index.css -o ./src/frontend/index-out.css
RUN mv ./src/frontend/index-out.css ./src/frontend/index.css
RUN bun build src/index.tsx --minify --target=bun --outdir=dist/out
RUN bun build dist/out/index.js --compile --outfile dist/bin/containers-up

CMD ["bun", "dev"]

FROM alpine:3.22.1

ARG TARGETPLATFORM

LABEL org.opencontainers.image.source=https://github.com/DigitallyRefined/containers-up
LABEL org.opencontainers.image.description="containers-up ${TARGETPLATFORM}"

RUN apk add --no-cache \
    libgcc \
    libstdc++ \
    openssh-client \
    docker-cli \
    docker-cli-compose

WORKDIR /app

COPY --from=builder /home/bun/app/dist/bin/containers-up /usr/local/bin
COPY --from=builder /home/bun/app/dist/out .

EXPOSE 3000
EXPOSE 3001

ENV NODE_ENV=production
CMD ["containers-up"]
