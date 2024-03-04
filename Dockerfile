FROM node:20
COPY . /build
WORKDIR /build
RUN corepack enable
RUN yarn install
RUN yarn build
RUN yarn postinstall:disable
RUN yarn workspaces focus --all --production

FROM node:20-alpine
COPY --from=0 /build/package.json /build/package.json
COPY --from=0 /build/dist /build/dist
COPY --from=0 /build/node_modules /build/node_modules
WORKDIR /build
CMD ["node", "dist/index.js"]
