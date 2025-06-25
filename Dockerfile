FROM oven/bun:alpine AS builder

COPY . .

RUN bun install
RUN bunx @tailwindcss/cli --minify -i ./src/frontend/index.css -o ./src/frontend/index-out.css
RUN mv ./src/frontend/index-out.css ./src/frontend/index.css
RUN bun build src/index.* --minify --target=bun --outdir=dist

FROM oven/bun:alpine

COPY --from=builder /home/bun/app/dist .

ENV NODE_ENV=production
CMD ["bun", "."]
