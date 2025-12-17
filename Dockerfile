# Use Node.js 18 LTS on Alpine Linux for a small image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies
# (If you need dev dependencies for build, use 'npm install' then 'npm prune --production')
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
