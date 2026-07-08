# Stage 1: Build the Go binary
FROM golang:alpine AS builder

# Install build-essential tools if needed
RUN apk add --no-cache git

WORKDIR /app

# Download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy backend and frontend source files
COPY . .

# Compile optimized static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /free-radio cmd/radio/main.go

# Stage 2: Setup lightweight deployment runtime
FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy binary and static frontend assets
COPY --from=builder /free-radio .
COPY --from=builder /app/static ./static

# Expose internal port
EXPOSE 67

# Environment variables setup
ENV PORT=67
ENV STATIONS_DIR=/stations

# Command to start server
CMD ["./free-radio"]
