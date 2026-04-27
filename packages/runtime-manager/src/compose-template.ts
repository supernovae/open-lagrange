export function localComposeTemplate(): string {
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
    environment:
      RABBITMQ_DEFAULT_USER: user
      RABBITMQ_DEFAULT_PASS: password
    ports:
      - "5673:5672"
      - "15673:15672"
    volumes:
      - hatchet_rabbitmq_data:/var/lib/rabbitmq
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
      hatchet-config:
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
      hatchet-config:
        condition: service_completed_successfully

  open-lagrange-api:
    image: ghcr.io/supernovae/open-lagrange-api:latest
    build:
      context: .
      dockerfile: containers/api.Containerfile
    ports:
      - "4317:4317"
    environment:
      OPEN_LAGRANGE_DB_DIALECT: sqlite
      OPEN_LAGRANGE_SQLITE_PATH: /data/open-lagrange.sqlite
      HATCHET_CLIENT_HOST_PORT: hatchet-engine:7070
      HATCHET_CLIENT_TLS_STRATEGY: none
      HATCHET_CLIENT_TOKEN: \${HATCHET_CLIENT_TOKEN:-}
      OPENAI_API_KEY: \${OPENAI_API_KEY:-}
      OPENAI_MODEL: \${OPENAI_MODEL:-gpt-4o-mini}
    volumes:
      - open_lagrange_data:/data
    depends_on:
      hatchet-engine:
        condition: service_started

  open-lagrange-worker:
    image: ghcr.io/supernovae/open-lagrange-worker:latest
    build:
      context: .
      dockerfile: containers/worker.Containerfile
    environment:
      OPEN_LAGRANGE_DB_DIALECT: sqlite
      OPEN_LAGRANGE_SQLITE_PATH: /data/open-lagrange.sqlite
      HATCHET_CLIENT_HOST_PORT: hatchet-engine:7070
      HATCHET_CLIENT_TLS_STRATEGY: none
      HATCHET_CLIENT_TOKEN: \${HATCHET_CLIENT_TOKEN:-}
      OPENAI_API_KEY: \${OPENAI_API_KEY:-}
      OPENAI_MODEL: \${OPENAI_MODEL:-gpt-4o-mini}
    volumes:
      - open_lagrange_data:/data
    depends_on:
      hatchet-engine:
        condition: service_started

  open-lagrange-web:
    image: ghcr.io/supernovae/open-lagrange-web:latest
    build:
      context: .
      dockerfile: containers/web.Containerfile
    ports:
      - "3000:3000"
    environment:
      OPEN_LAGRANGE_API_URL: http://open-lagrange-api:4317
    depends_on:
      open-lagrange-api:
        condition: service_started

volumes:
  hatchet_postgres_data:
  hatchet_rabbitmq_data:
  hatchet_config:
  hatchet_certs:
  open_lagrange_data:
`;
}
