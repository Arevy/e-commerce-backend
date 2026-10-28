FROM node:22.23.4-bookworm-slim AS dependencies

WORKDIR /app

ENV npm_config_oracle_skip_postinstall=1

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile && yarn cache clean

FROM dependencies AS development
COPY . .
EXPOSE 4000
CMD ["sh", "-c", "node scripts/wait-for-services.cjs && exec yarn dev"]

FROM dependencies AS build
COPY . .
RUN yarn build

FROM node:22.23.4-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV npm_config_oracle_skip_postinstall=1

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile && yarn cache clean

COPY --from=build /app/dist ./dist
COPY scripts ./scripts
COPY migrations ./migrations
COPY data ./data

EXPOSE 4000
CMD ["node", "dist/index.js"]
