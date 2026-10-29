FROM node:22-alpine
WORKDIR /app
COPY build/worker.mjs /app/worker.mjs
COPY build/THIRD_PARTY_LICENSES.txt /app/THIRD_PARTY_LICENSES.txt
EXPOSE 80
CMD ["node","/app/worker.mjs"]
