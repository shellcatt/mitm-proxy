const express = require('express');
const https = require('https');
const fs = require('fs');
const net = require('net');
const cluster = require('cluster');
const os = require('os');
const dotenv = require('dotenv');
dotenv.config();

const PORT = process.env.PORT || 8443;
const MAX_QUEUE_SIZE = process.env.MAX_QUEUE_SIZE || 100;
const MAX_REDIRECTS = process.env.MAX_REDIRECTS || 5;

let stats = [];

let isShuttingDown = false;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers
  for (let i = 0; i < os.availableParallelism; i++) {
    cluster.fork();
  }

  // Respawn crashed workers
  cluster.on('exit', (worker, code, signal) => {
    if (!isShuttingDown) {
        console.log(`Worker ${worker.process.pid} died, forking a new worker`);
        cluster.fork();  // replace the dead worker
    } else {
        console.log(`Worker ${worker.process.pid} shutting down`);
    }
  });

  // Handle SIGINT to gracefully shut down all workers
  process.on('SIGINT', () => {
    console.log('Master process is shutting down, killing all workers...');

    isShuttingDown = true;
    for (const id in cluster.workers) {
      cluster.workers[id].process.kill('SIGTERM');
    }

    setTimeout(() => {
      process.exit(0);
    }, 1000).unref(); 
  });

  // Collect stats
  cluster.on('message', (worker, message) => {
    if (message.statsUpdate) {
      stats.push(message.statsUpdate);
      console.log(stats.length, stats)
    }
  });
} else {
  const app = express();
  const serverOptions = {
    key: fs.readFileSync('/etc/ssl/private/ssl-cert-snakeoil.key'),
    cert: fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem')
  };

  // Used for dry run tests
  app.use((req, res, next) => {
    if (req.method !== 'CONNECT') {
      return res.status(405).end('Method Not Allowed');
    } else {
      next();
    }
  });

  const server = https.createServer(serverOptions, app);
  server.listen(PORT, () => {
    console.log(`Worker ${process.pid} started and listening on port ${PORT}`);
  });


  server.on('connect', (req, clientSocket, head) => {
    console.log(`CONNECT request intercepted by ${process.pid}!`);

    const startProcessing = Date.now();
    const [hostname, port] = req.url.split(':');
    const currentStat = {
        _pid: process.pid,
        url: req.url,
        requestSize: 0,
        responseSize: 0,
        processingTime: 0
    };

    const serverSocket = net.connect(port || 443, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });

    serverSocket.on('data', (chunk) => {
        currentStat.responseSize += chunk.length;
    });
    
    clientSocket.on('data', (chunk) => {
        currentStat.requestSize += chunk.length;
    });

    let statsFinalized = false;
    const finalizeStats = () => {
        if (!statsFinalized) { // Prevent from calling twice
            currentStat.processingTime = Date.now() - startProcessing;
            // stats.push(currentStat);
            // console.log(stats.length, currentStat);
            process.send({ statsUpdate: currentStat });
            statsFinalized = true;
        }
    };

    // When the connection ends or is closed, finalize and log the stats.
    clientSocket.on('close', finalizeStats);
    serverSocket.on('close', finalizeStats);
  });
}
