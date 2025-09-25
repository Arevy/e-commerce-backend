FROM node:20 AS deps

WORKDIR /app

ENV npm_config_oracle_skip_postinstall=1

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

FROM node:20
WORKDIR /app
ENV NODE_ENV=production
ENV npm_config_oracle_skip_postinstall=1

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY --from=deps /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/index.js"]
