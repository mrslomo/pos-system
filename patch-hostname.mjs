import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const os = require('os');
Object.defineProperty(os, 'hostname', { value: () => 'pos-server', writable: true, configurable: true });
// Also patch http to sanitize non-ASCII header values
const http = require('http');
const origSetHeader = http.ClientRequest.prototype.setHeader;
http.ClientRequest.prototype.setHeader = function(name, value) {
  if (typeof value === 'string') value = value.replace(/[^\x00-\x7F]/g, '?');
  return origSetHeader.call(this, name, value);
};
