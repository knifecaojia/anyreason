#!/bin/bash
set -e

# Default environment file
ENV_FILE=${1:-.env}

if [ ! -f "$ENV_FILE" ]; then
    echo "Environment file $ENV_FILE not found. Creating from .env.example..."
    cp .env.example .env
    echo "Please edit .env with your configuration."
    exit 1
fi

# Load environment variables
set -a
source "$ENV_FILE"
set +a

# Check ports
if [ -f check_ports.sh ]; then
    bash check_ports.sh
fi

# Configure Nginx
NGINX_CONF="docker/nginx/default.conf"
if [ -d "/etc/letsencrypt/live/ai.znxview.com" ]; then
    echo "SSL certificates found. Using HTTPS configuration."
    cp docker/nginx/anyreason.conf "$NGINX_CONF"
else
    echo "SSL certificates not found. Using HTTP configuration."
    cp docker/nginx/anyreason-http.conf "$NGINX_CONF"
fi

# Deploy
echo "Deploying Anyreason AI Studio..."
docker compose -f docker/docker-compose.deploy.yml up -d --build --remove-orphans

echo "Deployment completed successfully!"
echo "You can view logs with: docker compose -f docker/docker-compose.deploy.yml logs -f"
