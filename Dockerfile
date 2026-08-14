FROM node:24-alpine AS build
RUN sed -i 's|https://dl-cdn.alpinelinux.org/alpine|https://mirrors.aliyun.com/alpine|g' /etc/apk/repositories \
    && apk add --no-cache python3 make g++ \
    && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs .prettierrc.json vitest.config.mjs ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm config set registry https://registry.npmmirror.com \
    && pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm rebuild esbuild \
    && SQLITE_BUILD_DIR="$(dirname "$(find node_modules/.pnpm -path '*/better-sqlite3/binding.gyp' -print -quit)")" \
    && NODE_GYP_BIN="$(find /root/.cache/node/corepack -path '*/node-gyp/bin/node-gyp.js' -print -quit)" \
    && test -n "$SQLITE_BUILD_DIR" \
    && test -n "$NODE_GYP_BIN" \
    && cd "$SQLITE_BUILD_DIR" \
    && node "$NODE_GYP_BIN" rebuild --nodedir=/usr/local
RUN pnpm build

FROM node:24-alpine AS runtime
RUN corepack enable && addgroup -S game && adduser -S game -G game
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/contracts/src ./packages/contracts/src
RUN mkdir -p /app/data && chown -R game:game /app
USER game
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/app/data/game.db
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/server/dist/index.js"]
