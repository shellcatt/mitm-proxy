const express = require('express');
const https = require('https');
const fs = require('fs');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const os = require('os');
const net = require('net');

const dotenv = require('dotenv');
dotenv.config();

const PORT = parseInt(process.env.PORT) || 8443;
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE, 10) || 100;
const MAX_REDIRECTS = parseInt(process.env.MAX_REDIRECTS, 10) || 5;

let queue = [];
let stats = [];

if (isMainThread) {
  const app = express();

  const workerPool = Array.from({ length: os.availableParallelism }, () => new Worker(__filename));

  app.all('*', (req, res) => {
    console.log('...')
    const startProcessing = Date.now();

    if (queue.length >= MAX_QUEUE_SIZE) {
      res.status(503).send('Service Unavailable');
      return;
    }

    const requestData = {
      method: req.method,
      headers: req.headers,
      url: req.originalUrl
    };

    const worker = workerPool.shift();

    if (worker) {
      worker.on('message', (response) => {
        res.set(response.headers);
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          res.redirect(response.statusCode, response.headers.location);
        } else {
          res.status(response.statusCode).send(response.data);
        }
        
        const currentStat = {
            requestSize: JSON.stringify(requestData).length,
            responseSize: response.data ? response.data.length : 0,
            processingTime: Date.now() - startProcessing
        };
        stats.push(currentStat);
        console.log(stats.length, currentStat);

        workerPool.push(worker);
      });

      worker.postMessage(requestData);
    } else {
      queue.push(requestData);
    }
  });

  https.createServer({
    key: fs.readFileSync('/etc/ssl/private/ssl-cert-snakeoil.key'),
    cert: fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem')
  }, app).listen(PORT, () => {
    console.log(`Proxy server listening on port ${PORT}`);
  })
  
  processNextRequest();

} else {
  const agent = new https.Agent({ 
    keepAlive: true, 
    // maxSockets: 10 
  });

  const processRequest = (requestData, redirectCount = 0) => {
    return new Promise((resolve, reject) => {
      const requestOptions = {
        method: requestData.method,
        headers: requestData.headers,
        hostname: requestData.headers['host'],
        path: requestData.url,
        agent
      };

      const proxyReq = https.request(requestOptions, (proxyRes) => {
        let data = [];
        proxyRes.on('data', chunk => data.push(chunk));
        proxyRes.on('end', () => {
          if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location && redirectCount < MAX_REDIRECTS) {
            requestData.url = proxyRes.headers.location;
            resolve(processRequest(requestData, redirectCount + 1));
          } else {
            resolve({
              statusCode: proxyRes.statusCode,
              headers: proxyRes.headers,
              data: Buffer.concat(data).toString(),
              redirectCount
            });
          }
        });
      });

      proxyReq.on('error', reject);
      proxyReq.end();
    });
  };

  parentPort.on('message', (requestData) => {
    processRequest(requestData)
      .then(response => parentPort.postMessage(response))
      .catch(error => parentPort.postMessage({ error: error.message }));
  });
}

function processNextRequest() {
  if (queue.length > 0) {
    const requestData = queue.shift();
    const worker = workerPool.shift();
    if (worker) {
      worker.on('message', (response) => {
        workerPool.push(worker);
      });
      worker.postMessage(requestData);
    } else {
      queue.unshift(requestData);
    }
  }
  setTimeout(processNextRequest, 0);
}
