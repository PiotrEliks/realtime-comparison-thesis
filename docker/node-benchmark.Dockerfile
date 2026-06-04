FROM node:20-bookworm-slim

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    curl \
    iproute2 \
    iputils-ping \
    procps \
    sysstat \
    tcpdump \
    tshark \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY servers ./servers
COPY benchmarks ./benchmarks
COPY init.sql ./init.sql

RUN npm ci

ENV NODE_ENV=production
ENV DB_HOST=postgres
ENV DB_PORT=5432
ENV DB_USER=thesis_user
ENV DB_PASSWORD=thesis_password
ENV KANBAN_DB=realtime_kanban
ENV DB_NAME=realtime_chat

CMD ["bash", "-lc", "npm run dev -w ${SERVER_WORKSPACE}"]
