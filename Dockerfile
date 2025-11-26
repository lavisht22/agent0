FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
ENV CI=true
RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build
RUN pnpm --filter runner build
RUN pnpm deploy --filter=runner --prod --legacy /prod/runner

FROM base AS runner
WORKDIR /app
COPY --from=build /prod/runner /app
COPY --from=build /usr/src/app/apps/runner/dist /app/dist
COPY --from=build /usr/src/app/apps/web/dist /app/public

ENV PORT=8080
EXPOSE 8080
CMD [ "node", "dist/index.js" ]
