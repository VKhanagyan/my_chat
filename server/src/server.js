
import { createServer } from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { initializeSocketServer } from './sockets/socket.js';

const server = createServer(app);

initializeSocketServer(server);

server.listen(env.PORT, env.HOST, () => {
  console.log(
    `HayChat server is running at http://${env.HOST}:${env.PORT}`,
  );
});

function shutdown(signal) {
  console.log(`\n${signal} received. Closing HayChat server...`);

  server.close((error) => {
    if (error) {
      console.error('Error while closing server:', error);
      process.exitCode = 1;
      return;
    }

    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
