FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app ./
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@open-lagrange/web", "--", "-p", "3000"]
