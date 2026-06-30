FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Pinned to the native build platform so the heavy compile (pnpm install, vite,
# tsc) runs ONCE on the runner's own arch instead of once per target platform
# under QEMU emulation. The output is pure JS / arch-independent prod deps, so
# both the amd64 and arm64 runtime images below COPY the same build result.
# NOTE: this derives from the external node image directly, not `base`. The
# --platform pin is only honored against an external image; `FROM base` would
# inherit the per-target platform and silently run the build twice.
FROM --platform=$BUILDPLATFORM node:20-slim AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
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

# Version reported by GET /api/v1/version. The publish workflow passes the git
# tag here; any other build (local) keeps "dev" — an untagged build genuinely
# isn't a release, so it shouldn't claim a version.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

ENV PORT=8080
EXPOSE 8080
CMD [ "node", "dist/index.js" ]
