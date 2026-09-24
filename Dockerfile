FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-cryptography curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN mkdir proxy && curl -fsSL https://raw.githubusercontent.com/alexbers/mtprotoproxy/master/mtprotoproxy.py -o proxy/mtprotoproxy.py
COPY . .
CMD ["node","server.js"]
