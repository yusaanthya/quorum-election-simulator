# Dockerfile
FROM golang:1.24.1-alpine AS builder

# setting WORK DIR
WORKDIR /app

# set dependencies
COPY go.mod go.sum ./
RUN go mod download

# copy codebase
COPY . .

# build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -o quorum ./cmd/main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates

RUN mkdir -p /root/log && chmod 755 /root/log

WORKDIR /root/

# copy binary by from
COPY --from=builder /app/quorum .

# ENTRYPOINT: run binary, sub command as array
ENTRYPOINT ["./quorum"]

# CMD: default "play"（
CMD ["play"]