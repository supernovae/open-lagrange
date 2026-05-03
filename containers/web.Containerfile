FROM node:24-bookworm-slim AS deps
WORKDIR /app
ARG OPEN_LAGRANGE_API_URL=http://open-lagrange-api:4317
ENV OPEN_LAGRANGE_API_URL=$OPEN_LAGRANGE_API_URL
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG OPEN_LAGRANGE_API_URL=http://open-lagrange-api:4317
ENV OPEN_LAGRANGE_API_URL=$OPEN_LAGRANGE_API_URL
COPY --from=deps /app ./
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@open-lagrange/web", "--", "-p", "3000"]
