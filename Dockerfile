# Use the official Node.js 18 image as base
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the port (Cloud Run sets PORT env var automatically)
EXPOSE 8080

# Command to run the application
CMD ["node", "server.js"]
