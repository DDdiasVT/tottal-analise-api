# Use Node.js 18 LTS on Alpine Linux for a small image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies
# Install dependencies using npm install (more robust than ci if lockfile is slightly out of sync)
RUN npm install --only=production

# Copy application source code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
