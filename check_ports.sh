#!/bin/bash
# Check for port conflicts on the server

PORTS="80 443 5432 6379 9000 9001 8000 3000"
CONFLICT=0

echo "Checking for port conflicts..."

for PORT in $PORTS; do
    if command -v netstat >/dev/null 2>&1; then
        if netstat -tuln | grep -q ":$PORT "; then
            echo "WARNING: Port $PORT is already in use."
            CONFLICT=1
        else
            echo "Port $PORT is free."
        fi
    elif command -v ss >/dev/null 2>&1; then
        if ss -tuln | grep -q ":$PORT "; then
            echo "WARNING: Port $PORT is already in use."
            CONFLICT=1
        else
            echo "Port $PORT is free."
        fi
    else
        echo "WARNING: Neither netstat nor ss found. Cannot check port $PORT."
    fi
done

if [ $CONFLICT -eq 1 ]; then
    echo "There are port conflicts. Please resolve them before deploying."
    # List processes using the ports
    echo "Processes using the ports:"
    for PORT in $PORTS; do
        lsof -i :$PORT || true
    done
else
    echo "No port conflicts found."
fi
