import { Writable } from 'stream';

import pino from 'pino';
import pretty from 'pino-pretty';

// In-memory log storage
const logs: any[] = [];

// Custom writable stream to capture logs in memory
const logStream = new Writable({
  write(chunk, encoding, callback) {
    try {
      const log = JSON.parse(chunk.toString());
      logs.push(log);
    } catch {
      // Ignore parse errors
    }
    callback();
  },
});

// Pretty stream for terminal output
const prettyStream = pretty({ colorize: true });

// Set log level & terminal output based on NODE_ENV
const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = isDevelopment ? 'debug' : 'info';

// Create a pino multistream to log to both terminal and memory
const streams = [
  ...(isDevelopment ? [{ level: logLevel, stream: prettyStream }] : []), // terminal
  { level: logLevel, stream: logStream }, // in-memory
];

export const mainLogger = pino({ level: logLevel }, pino.multistream(streams));

export const getLogs = (event?: string) => {
  let matchingLogs: any[] = [];
  if (!event) {
    matchingLogs = [...logs];
    logs.length = 0;
  } else {
    matchingLogs = logs.filter((log) => log?.event === event);
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i]?.event === event) {
        logs.splice(i, 1);
      }
    }
  }
  return matchingLogs;
};
