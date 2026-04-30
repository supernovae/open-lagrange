export function localComposeTemplate(input: { readonly sourceRoot: string }): string {
  return `name: open-lagrange

services:
  postgres:
    image: postgres:15.6
    environment:
      POSTGRES_USER: hatchet
      POSTGRES_PASSWORD: hatchet
      POSTGRES_DB: hatchet
    ports:
      - "5435:5432"
    volumes:
      - hatchet_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -d hatchet -U hatchet"]
      interval: 10s
      timeout: 10s
      retries: 5

  rabbitmq:
    image: rabbitmq:4-management
    user: rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: user
      RABBITMQ_DEFAULT_PASS: password
    ports:
      - "5673:5672"
      - "15673:15672"
    healthcheck:
      test: ["CMD", "rabbitmqctl", "status"]
      interval: 10s
      timeout: 10s
      retries: 5

  hatchet-migration:
    image: ghcr.io/hatchet-dev/hatchet/hatchet-migrate:latest
    command: /hatchet/hatchet-migrate
    environment:
      DATABASE_URL: postgres://hatchet:hatchet@postgres:5432/hatchet
    depends_on:
      postgres:
        condition: service_healthy

  hatchet-config:
    image: ghcr.io/hatchet-dev/hatchet/hatchet-admin:latest
    command: /hatchet/hatchet-admin quickstart --skip certs --generated-config-dir /hatchet/config --overwrite=false
    environment:
      DATABASE_URL: postgres://hatchet:hatchet@postgres:5432/hatchet
      SERVER_MSGQUEUE_RABBITMQ_URL: amqp://user:password@rabbitmq:5672/
      SERVER_AUTH_COOKIE_DOMAIN: localhost:8080
      SERVER_AUTH_COOKIE_INSECURE: "t"
      SERVER_GRPC_BIND_ADDRESS: 0.0.0.0
      SERVER_GRPC_INSECURE: "t"
      SERVER_GRPC_BROADCAST_ADDRESS: localhost:7077
      SERVER_DEFAULT_ENGINE_VERSION: V1
      SERVER_INTERNAL_CLIENT_INTERNAL_GRPC_BROADCAST_ADDRESS: hatchet-engine:7070
    volumes:
      - hatchet_config:/hatchet/config
      - hatchet_certs:/hatchet/certs
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
      hatchet-migration:
        condition: service_completed_successfully

  hatchet-token:
    image: ghcr.io/hatchet-dev/hatchet/hatchet-admin:latest
    command: sh -c 'set -eu; if [ -s /hatchet/config/client.token ]; then exit 0; fi; for i in 1 2 3 4 5 6 7 8 9 10; do tmp=/tmp/open-lagrange-client-token; if /hatchet/hatchet-admin --config /hatchet/config token create --tenant-id 707d0855-80ab-4e1f-a156-f1c4546cbf52 --name open-lagrange-local > "$$tmp"; then tail -n 1 "$$tmp" > /hatchet/config/client.token; test -s /hatchet/config/client.token && exit 0; fi; sleep 2; done; echo "failed to create local Hatchet client token" >&2; exit 1'
    environment:
      DATABASE_URL: postgres://hatchet:hatchet@postgres:5432/hatchet
    volumes:
      - hatchet_config:/hatchet/config
    depends_on:
      hatchet-config:
        condition: service_completed_successfully

  hatchet-engine:
    image: ghcr.io/hatchet-dev/hatchet/hatchet-engine:latest
    command: /hatchet/hatchet-engine --config /hatchet/config
    ports:
      - "7077:7070"
    environment:
      DATABASE_URL: postgres://hatchet:hatchet@postgres:5432/hatchet
      SERVER_GRPC_BIND_ADDRESS: 0.0.0.0
      SERVER_GRPC_INSECURE: "t"
    volumes:
      - hatchet_config:/hatchet/config
      - hatchet_certs:/hatchet/certs
    depends_on:
      hatchet-token:
        condition: service_completed_successfully

  hatchet-dashboard:
    image: ghcr.io/hatchet-dev/hatchet/hatchet-dashboard:latest
    command: sh ./entrypoint.sh --config /hatchet/config
    ports:
      - "8080:80"
    environment:
      DATABASE_URL: postgres://hatchet:hatchet@postgres:5432/hatchet
    volumes:
      - hatchet_config:/hatchet/config
      - hatchet_certs:/hatchet/certs
    depends_on:
      hatchet-token:
        condition: service_completed_successfully

  open-lagrange-api:
    image: ghcr.io/supernovae/open-lagrange-api:latest
    build:
      context: ${yamlString(input.sourceRoot)}
      dockerfile: containers/api.Containerfile
    command: sh -c 'export HATCHET_CLIENT_TOKEN="$$(cat /hatchet/config/client.token)"; npm run start -w @open-lagrange/web -- -p 4317'
    ports:
      - "4317:4317"
    environment:
      OPEN_LAGRANGE_DB_DIALECT: sqlite
      OPEN_LAGRANGE_SQLITE_PATH: /data/open-lagrange.sqlite
      HATCHET_CLIENT_HOST_PORT: hatchet-engine:7070
      HATCHET_CLIENT_TLS_STRATEGY: none
      HATCHET_CLIENT_TOKEN: \${HATCHET_CLIENT_TOKEN:-}
      OPEN_LAGRANGE_API_TOKEN: \${OPEN_LAGRANGE_API_TOKEN:-}
      OPEN_LAGRANGE_ALLOWED_REPO_ROOTS: \${OPEN_LAGRANGE_ALLOWED_REPO_ROOTS:-}
      OPEN_LAGRANGE_WORKER_HEALTH_URL: http://open-lagrange-worker:4318/healthz
      OPEN_LAGRANGE_PROFILE: \${OPEN_LAGRANGE_PROFILE:-local}
      OPEN_LAGRANGE_PROFILE_PACKS_DIR: /runtime-packs
      OPEN_LAGRANGE_MODEL_PROVIDER: \${OPEN_LAGRANGE_MODEL_PROVIDER:-openai}
      OPEN_LAGRANGE_MODEL_BASE_URL: \${OPEN_LAGRANGE_MODEL_BASE_URL:-https://api.openai.com/v1}
      OPEN_LAGRANGE_MODEL_API_KEY: \${OPEN_LAGRANGE_MODEL_API_KEY:-}
      OPEN_LAGRANGE_MODEL: \${OPEN_LAGRANGE_MODEL:-gpt-4o-mini}
      OPEN_LAGRANGE_MODEL_HIGH: \${OPEN_LAGRANGE_MODEL_HIGH:-gpt-4o}
      OPEN_LAGRANGE_MODEL_CODER: \${OPEN_LAGRANGE_MODEL_CODER:-gpt-4o}
      OPENAI_API_KEY: \${OPENAI_API_KEY:-}
      OPENAI_BASE_URL: \${OPENAI_BASE_URL:-https://api.openai.com/v1}
      OPENAI_MODEL: \${OPENAI_MODEL:-gpt-4o-mini}
    volumes:
      - open_lagrange_data:/data
      - hatchet_config:/hatchet/config:ro
      - \${OPEN_LAGRANGE_PROFILE_PACKS_DIR:-/tmp/open-lagrange-empty-packs}:/runtime-packs:ro
    depends_on:
      hatchet-engine:
        condition: service_started

  open-lagrange-worker:
    image: ghcr.io/supernovae/open-lagrange-worker:latest
    build:
      context: ${yamlString(input.sourceRoot)}
      dockerfile: containers/worker.Containerfile
    command: sh -c 'export HATCHET_CLIENT_TOKEN="$$(cat /hatchet/config/client.token)"; node packages/core/dist/hatchet/worker.js'
    ports:
      - "4318:4318"
    environment:
      OPEN_LAGRANGE_DB_DIALECT: sqlite
      OPEN_LAGRANGE_SQLITE_PATH: /data/open-lagrange.sqlite
      HATCHET_CLIENT_HOST_PORT: hatchet-engine:7070
      HATCHET_CLIENT_TLS_STRATEGY: none
      HATCHET_CLIENT_TOKEN: \${HATCHET_CLIENT_TOKEN:-}
      OPEN_LAGRANGE_API_TOKEN: \${OPEN_LAGRANGE_API_TOKEN:-}
      OPEN_LAGRANGE_WORKER_HEALTH_HOST: 0.0.0.0
      OPEN_LAGRANGE_WORKER_HEALTH_PORT: "4318"
      OPEN_LAGRANGE_PROFILE: \${OPEN_LAGRANGE_PROFILE:-local}
      OPEN_LAGRANGE_PROFILE_PACKS_DIR: /runtime-packs
      OPEN_LAGRANGE_MODEL_PROVIDER: \${OPEN_LAGRANGE_MODEL_PROVIDER:-openai}
      OPEN_LAGRANGE_MODEL_BASE_URL: \${OPEN_LAGRANGE_MODEL_BASE_URL:-https://api.openai.com/v1}
      OPEN_LAGRANGE_MODEL_API_KEY: \${OPEN_LAGRANGE_MODEL_API_KEY:-}
      OPEN_LAGRANGE_MODEL: \${OPEN_LAGRANGE_MODEL:-gpt-4o-mini}
      OPEN_LAGRANGE_MODEL_HIGH: \${OPEN_LAGRANGE_MODEL_HIGH:-gpt-4o}
      OPEN_LAGRANGE_MODEL_CODER: \${OPEN_LAGRANGE_MODEL_CODER:-gpt-4o}
      OPENAI_API_KEY: \${OPENAI_API_KEY:-}
      OPENAI_BASE_URL: \${OPENAI_BASE_URL:-https://api.openai.com/v1}
      OPENAI_MODEL: \${OPENAI_MODEL:-gpt-4o-mini}
    volumes:
      - open_lagrange_data:/data
      - hatchet_config:/hatchet/config:ro
      - \${OPEN_LAGRANGE_PROFILE_PACKS_DIR:-/tmp/open-lagrange-empty-packs}:/runtime-packs:ro
    depends_on:
      hatchet-engine:
        condition: service_started

  open-lagrange-web:
    image: ghcr.io/supernovae/open-lagrange-web:latest
    build:
      context: ${yamlString(input.sourceRoot)}
      dockerfile: containers/web.Containerfile
    ports:
      - "3000:3000"
    environment:
      OPEN_LAGRANGE_API_URL: http://open-lagrange-api:4317
      OPEN_LAGRANGE_API_TOKEN: \${OPEN_LAGRANGE_API_TOKEN:-}
    depends_on:
      open-lagrange-api:
        condition: service_started

volumes:
  hatchet_postgres_data:
  hatchet_config:
  hatchet_certs:
  open_lagrange_data:
`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
