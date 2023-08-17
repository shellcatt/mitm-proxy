# Transparent Monitoring Proxy Server
## NodeJS + Routing + Memory optimization in vanilla JS (ES6)

> This project is a homework assignment and is not considered to be production-ready code.

## Run
- `mv .env.example .env`
- `docker compose up -d`

## Test 
- Start service
  - `docker exec -it mitm-proxy npm run cluster`
    - OR 
  - `docker exec -it mitm-proxy npm run threads` 
- Execute request
  - `docker exec -it mitm-proxy curl -k -x https://localhost:8443 https://www.google.com`
  
## Concepts
1. NodeJS HTTPS server 
2. CONNECT method interception 
3. Statistics collection (basic)
4. Performance (utilize all CPU cores) & Benchmarking (utilize `ab` CLI tool)
5. Monitoring + Load balancing (optional)  
   1. Health check
   2. CPU load & memory usage timeline  

---

**Author**

Krasimir Gruychev

https://krasimir.gruychev.name/