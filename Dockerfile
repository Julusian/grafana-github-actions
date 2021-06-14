FROM node:14
COPY . /build
WORKDIR /build
RUN yarn install && yarn build

FROM node:14-slim
COPY --from=0 /build/package.json /build/package.json
COPY --from=0 /build/dist /build/dist
WORKDIR /build
RUN yarn install --production
CMD ["node", "dist/index.js"]
