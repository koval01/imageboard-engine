FROM mcr.microsoft.com/playwright:v1.55.0-noble
WORKDIR /e2e
COPY e2e/package.json ./
RUN npm install --no-package-lock
COPY e2e/ ./
ENV PLAYWRIGHT_BASE_URL=http://frontend
CMD ["npx", "playwright", "test"]
