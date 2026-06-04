FROM alpine:3.20

RUN apk add --no-cache bash iproute2

COPY scripts/netem.sh /usr/local/bin/netem
RUN chmod +x /usr/local/bin/netem

ENTRYPOINT ["netem"]

