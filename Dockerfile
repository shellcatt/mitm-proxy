FROM node:current-slim

WORKDIR /app

RUN apt update -y && apt install -y nano curl net-tools telnet procps

RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/ssl/private/ssl-cert-snakeoil.key -out /etc/ssl/certs/ssl-cert-snakeoil.pem -subj "/C=BG/ST=Sofia/L=Sofia/O=Security/OU=Development/CN=localhost" 
RUN cat /etc/ssl/certs/ssl-cert-snakeoil.pem >> /usr/local/share/ca-certificates/snakeoil.crt && update-ca-certificates

# RUN npm -g i typescript tsc ts-node nodemon

EXPOSE $PORT

# CMD ["npm", "run", "cluster"]
# CMD ["npm", "run", "threads"]
ENTRYPOINT [ "tail", "-f", "/dev/null" ]