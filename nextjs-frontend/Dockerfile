ARG NODE_BASE_IMAGE=node:20-bookworm
FROM ${NODE_BASE_IMAGE}

# Set the working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files and install dependencies
COPY package*.json ./

# Install dependencies as root (or myappuser, depending on your structure)
RUN pnpm install

# Copy the rest of your application code
COPY . .

RUN chmod +x /app/start.sh

EXPOSE 3000

# Start the application
CMD ["./start.sh"]
