'use strict';

// Bridge ADB reverse's IPv4 localhost to a Metro server bound only to IPv6
// ::1 on Windows. No packages, Android changes or data deletion required.
const http = require('node:http');
const net = require('node:net');

const PORT = 8081;
function metroRunning(host) {
  return new Promise((resolve) => {
    const request = http.get(
      { hostname: host, port: PORT, path: '/status', timeout: 2000 },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () =>
          resolve(
            response.statusCode === 200 &&
              body.includes('packager-status:running'),
          ),
        );
      },
    );
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function main() {
  if (await metroRunning('127.0.0.1')) {
    console.log('Metro is already reachable through IPv4; no bridge required.');
    return;
  }
  if (!(await metroRunning('::1'))) {
    console.error(
      'Metro is not reachable at IPv6 [::1]:8081. Start Metro before this bridge.',
    );
    process.exitCode = 1;
    return;
  }

  const bridge = net.createServer((client) => {
    const upstream = net.connect({ host: '::1', port: PORT });
    client.pipe(upstream);
    upstream.pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
  });
  bridge.on('error', (error) => {
    console.error(`Failed to bind IPv4 bridge: ${error.message}`);
    process.exitCode = 1;
  });
  bridge.listen(PORT, '127.0.0.1', () => {
    console.log('Metro IPv4 bridge ready: 127.0.0.1:8081 -> [::1]:8081');
    console.log(
      'Keep this window open. Check: curl.exe http://127.0.0.1:8081/status',
    );
  });
}

void main();
