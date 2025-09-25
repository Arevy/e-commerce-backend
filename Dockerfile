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
ENV ORACLE_CLIENT_DIR=/opt/oracle/instantclient
ENV LD_LIBRARY_PATH=${ORACLE_CLIENT_DIR}
ENV PATH=${ORACLE_CLIENT_DIR}:${PATH}

RUN apt-get update \
  && apt-get install -y --no-install-recommends libaio1 \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p ${ORACLE_CLIENT_DIR}

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY --from=deps /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/index.js"]
