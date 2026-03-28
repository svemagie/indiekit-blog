'use strict';
// Prometheus metrics shim — preloaded into the Indiekit process via:
//   node --require ./metrics-shim.cjs <indiekit cli>
// Because it runs inside the same process, all metrics (heap, GC, event
// loop lag, CPU, open handles) reflect the actual Indiekit application.
//
// Grafana dashboards: NodeJS Application Dashboard (11159) at
//   https://console.giersig.eu
//
// Config via environment variables (set in .env):
//   METRICS_BIND_HOST  — defaults to 0.0.0.0
//   METRICS_PORT       — defaults to 9209

const http = require('http');
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const host = process.env.METRICS_BIND_HOST || '0.0.0.0';
const port = parseInt(process.env.METRICS_PORT || '9209', 10);

const server = http.createServer(async (req, res) => {
  if (req.url === '/metrics') {
    try {
      const metrics = await register.metrics();
      res.setHeader('Content-Type', register.contentType);
      res.end(metrics);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  } else {
    res.writeHead(404);
    res.end('Not found\n');
  }
});

server.listen(port, host, () => {
  process.stderr.write(`[metrics] Prometheus metrics at http://${host}:${port}/metrics\n`);
});

server.on('error', (err) => {
  process.stderr.write(`[metrics] Server error: ${err.message}\n`);
});
