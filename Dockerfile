FROM oven/bun:1.2.19-alpine AS builder

ARG TARGETPLATFORM

LABEL org.opencontainers.image.source=https://github.com/DigitallyRefined/containers-up
LABEL org.opencontainers.image.description="containers-up ${TARGETPLATFORM}"

RUN apk add --no-cache \
    openssh \
    docker \
    docker-compose

COPY package.json bun.lock ./

RUN bun install

COPY . .

RUN bunx @tailwindcss/cli --minify -i ./src/frontend/index.css -o ./src/frontend/index-out.css
RUN mv ./src/frontend/index-out.css ./src/frontend/index.css
RUN bun build src/index.* --minify --target=bun --outdir=dist

CMD ["bun", "dev"]

FROM builder

RUN rm -rf /home/bun/app && mkdir /home/bun/app

COPY --from=builder /home/bun/app/dist .

EXPOSE 3000
EXPOSE 3001

ENV NODE_ENV=production
CMD ["bun", "."]
