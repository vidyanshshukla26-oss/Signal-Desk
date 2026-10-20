'use strict';

const http = require('node:http');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');
const { createStore, STATUS_VALUES } = require('./store');

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function log(logger, method, ...args) {
  if (logger && typeof logger[method] === 'function') logger[method](...args);
}

function sendJson(response, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': JSON_CONTENT_TYPE,
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  response.end(body);
}

function sendError(response, error) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  const payload = {
    error: error.message || 'Internal server error',
    code: error.code || 'INTERNAL_ERROR',
  };
  if (error.details !== undefined) payload.details = error.details;
  sendJson(response, status, payload);
}

function validateString(value, field, { required = true, max = 200, allowEmpty = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, 'INVALID_INPUT', `${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw new HttpError(400, 'INVALID_INPUT', `${field} must be a string`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new HttpError(400, 'INVALID_INPUT', `${field} must not be empty`);
  if (normalized.length > max) throw new HttpError(400, 'INVALID_INPUT', `${field} must be at most ${max} characters`);
  return normalized;
}

function validateWorkspaceInput(body) {
  if (!isRecord(body)) throw new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object');
  return { name: validateString(body.name, 'name', { max: 120 }) };
}

function validateFeedbackInput(body) {
  if (!isRecord(body)) throw new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object');
  return {
    title: validateString(body.title, 'title', { max: 200 }),
    body: validateString(body.body, 'body', { max: 20000 }),
    source: validateString(body.source, 'source', { max: 80 }),
    customer: validateString(body.customer, 'customer', { max: 200 }),
  };
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validatePatch(body) {
  if (!isRecord(body)) throw new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object');
  const keys = Object.keys(body);
  if (!keys.length) throw new HttpError(400, 'INVALID_INPUT', 'At least one editable field is required');
  const allowed = new Set(['status', 'owner', 'dueDate']);
  const unknown = keys.filter((key) => !allowed.has(key));
  if (unknown.length) throw new HttpError(400, 'INVALID_INPUT', `Unknown field(s): ${unknown.join(', ')}`);
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    if (typeof body.status !== 'string' || !STATUS_VALUES.includes(body.status)) {
      throw new HttpError(400, 'INVALID_STATUS', `status must be one of: ${STATUS_VALUES.join(', ')}`);
    }
    patch.status = body.status;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'owner')) {
    if (body.owner !== null && typeof body.owner !== 'string') {
      throw new HttpError(400, 'INVALID_INPUT', 'owner must be a string or null');
    }
    if (typeof body.owner === 'string') {
      const owner = body.owner.trim();
      if (owner.length > 120) throw new HttpError(400, 'INVALID_INPUT', 'owner must be at most 120 characters');
      patch.owner = owner || null;
    } else {
      patch.owner = null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'dueDate')) {
    if (body.dueDate === '') {
      patch.dueDate = null;
    } else if (body.dueDate !== null && !isValidDateOnly(body.dueDate)) {
      throw new HttpError(400, 'INVALID_INPUT', 'dueDate must be null or a valid YYYY-MM-DD date');
    } else {
      patch.dueDate = body.dueDate;
    }
  }
  return patch;
}

async function readJsonBody(request, maxBytes) {
  let size = 0;
  let body = '';
  let tooLarge = false;
  for await (const chunk of request) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    size += Buffer.byteLength(text);
    if (size > maxBytes) {
      tooLarge = true;
      continue;
    }
    body += text;
  }
  if (tooLarge) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `JSON body must be at most ${maxBytes} bytes`);
  if (!body.trim()) throw new HttpError(400, 'INVALID_JSON', 'Request body must contain JSON');
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body contains invalid JSON');
  }
}

function decodePathSegments(pathname) {
  return pathname.split('/').filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      throw new HttpError(400, 'INVALID_PATH', 'Request path contains invalid encoding');
    }
  });
}

function csvCell(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  // Prefix spreadsheet formula-like values so a customer-controlled export
  // cannot become an executable formula when opened in a spreadsheet app.
  const safeValue = /^[=+\-@]/.test(stringValue.trimStart()) ? `'${stringValue}` : stringValue;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function feedbackCsv(workspace) {
  const headers = [
    'id', 'title', 'body', 'source', 'customer', 'createdAt', 'updatedAt', 'status',
    'owner', 'dueDate', 'category', 'topics', 'sentiment', 'priority', 'priorityScore',
    'severity', 'severityScore', 'ownerRole', 'confidence', 'rationale', 'suggestedAction',
  ];
  const rows = [headers.map(csvCell).join(',')];
  for (const item of workspace.feedback) {
    const triage = item.triage || {};
    rows.push([
      item.id, item.title, item.body, item.source, item.customer, item.createdAt, item.updatedAt,
      item.status, item.owner, item.dueDate, triage.category, (triage.topics || []).join('|'),
      triage.sentiment, triage.priority, triage.priorityScore, triage.severity,
      triage.severityScore, triage.ownerRole, triage.confidence, triage.rationale,
      triage.suggestedAction,
    ].map(csvCell).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}

function safeStaticPath(publicRoot, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'INVALID_PATH', 'Request path contains invalid encoding');
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const normalized = path.normalize(relative);
  const absolute = path.resolve(publicRoot, normalized);
  const rootWithSeparator = publicRoot.endsWith(path.sep) ? publicRoot : `${publicRoot}${path.sep}`;
  if (absolute !== publicRoot && !absolute.startsWith(rootWithSeparator)) {
    throw new HttpError(403, 'FORBIDDEN', 'Path is outside the public directory');
  }
  return { absolute, relative: normalized };
}

async function serveStatic(request, response, publicRoot) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET and HEAD are supported for static files');
  }
  const requested = safeStaticPath(publicRoot, new URL(request.url, 'http://localhost').pathname);
  let filePath = requested.absolute;
  let stats;
  try {
    stats = await fsp.stat(filePath);
    if (!stats.isFile()) throw new Error('not a file');
  } catch {
    // A history-mode frontend can still render a client route from index.html.
    if (!path.extname(requested.relative) && requested.relative !== 'index.html') {
      filePath = path.join(publicRoot, 'index.html');
      try {
        stats = await fsp.stat(filePath);
        if (!stats.isFile()) throw new Error('not a file');
      } catch {
        throw new HttpError(404, 'NOT_FOUND', 'Static file not found');
      }
    } else {
      throw new HttpError(404, 'NOT_FOUND', 'Static file not found');
    }
  }
  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': contentType,
    'Content-Length': stats.size,
    'Cache-Control': 'no-cache',
  };
  response.writeHead(200, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const content = await fsp.readFile(filePath);
  response.end(content);
}

async function handleApi(request, response, context) {
  let parsed;
  try {
    parsed = new URL(request.url, 'http://localhost');
  } catch {
    throw new HttpError(400, 'INVALID_URL', 'Request URL is invalid');
  }
  const segments = decodePathSegments(parsed.pathname);
  if (segments[0] !== 'api') throw new HttpError(404, 'NOT_FOUND', 'API endpoint not found');

  if (segments.length === 2 && segments[1] === 'health') {
    if (request.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET is supported');
    return sendJson(response, 200, { status: 'ok', service: 'signaldesk', version: 1 });
  }

  if (segments.length === 2 && segments[1] === 'workspaces') {
    if (request.method === 'GET') return sendJson(response, 200, await context.store.listWorkspaces());
    if (request.method === 'POST') {
      const input = validateWorkspaceInput(await readJsonBody(request, context.maxBodyBytes));
      return sendJson(response, 201, await context.store.createWorkspace(input.name));
    }
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are supported');
  }

  if (segments.length < 3 || segments[1] !== 'workspaces') {
    throw new HttpError(404, 'NOT_FOUND', 'API endpoint not found');
  }
  const workspaceId = segments[2];

  if (segments.length === 4 && segments[3] === 'summary') {
    if (request.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET is supported');
    return sendJson(response, 200, await context.store.getSummary(workspaceId));
  }

  if (segments.length === 4 && segments[3] === 'export.csv') {
    if (request.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET is supported');
    const workspace = await context.store.exportFeedback(workspaceId);
    const body = feedbackCsv(workspace);
    const filenameId = workspace.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    response.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="signaldesk-${filenameId}.csv"`,
      'Content-Length': Buffer.byteLength(body),
    });
    return response.end(body);
  }

  if (segments.length === 4 && segments[3] === 'feedback') {
    if (request.method === 'GET') {
      const status = parsed.searchParams.get('status') || 'all';
      if (!['all', ...STATUS_VALUES].includes(status)) {
        throw new HttpError(400, 'INVALID_STATUS', `status must be one of: all, ${STATUS_VALUES.join(', ')}`);
      }
      return sendJson(response, 200, await context.store.listFeedback(workspaceId, status));
    }
    if (request.method === 'POST') {
      const input = validateFeedbackInput(await readJsonBody(request, context.maxBodyBytes));
      return sendJson(response, 201, await context.store.createFeedback(workspaceId, input));
    }
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are supported');
  }

  if (segments.length === 6 && segments[3] === 'feedback' && segments[5] === 'triage') {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is supported');
    const item = await context.store.triageFeedback(workspaceId, segments[4]);
    return sendJson(response, 200, item);
  }

  if (segments.length === 5 && segments[3] === 'feedback') {
    if (request.method !== 'PATCH') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only PATCH is supported');
    const patch = validatePatch(await readJsonBody(request, context.maxBodyBytes));
    return sendJson(response, 200, await context.store.updateFeedback(workspaceId, segments[4], patch));
  }

  throw new HttpError(404, 'NOT_FOUND', 'API endpoint not found');
}

function createServer(options = {}) {
  const logger = options.logger || console;
  const publicDir = path.resolve(options.publicDir || path.join(process.cwd(), 'public'));
  const store = options.store || createStore({
    dataFile: options.dataFile,
    seed: options.seed,
    clock: options.clock,
  });
  const context = {
    logger,
    maxBodyBytes: options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES,
    publicDir,
    store,
  };
  const ready = Promise.resolve(store.init());
  const server = http.createServer(async (request, response) => {
    const securityHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    };
    for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
    try {
      await ready;
      const requestUrl = new URL(request.url, 'http://localhost');
      if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
        await handleApi(request, response, context);
      } else {
        await serveStatic(request, response, publicDir);
      }
    } catch (error) {
      if (!response.headersSent) sendError(response, error);
      else response.destroy();
      if (!(error instanceof HttpError) || error.status >= 500) log(logger, 'error', error);
    }
  });
  server.store = store;
  server.ready = ready;
  server.publicDir = publicDir;
  return server;
}

async function startServer(options = {}) {
  const server = createServer(options);
  await server.ready;
  const port = options.port === undefined ? Number(process.env.PORT || 3000) : Number(options.port);
  const host = options.host || process.env.HOST || '127.0.0.1';
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
  const address = server.address();
  server.url = typeof address === 'object' && address
    ? `http://${host}:${address.port}`
    : `http://${host}:${port}`;
  return server;
}

if (require.main === module) {
  startServer()
    .then((server) => {
      process.stdout.write(`SignalDesk listening at ${server.url}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_MAX_BODY_BYTES,
  HttpError,
  createServer,
  feedbackCsv,
  startServer,
  validateFeedbackInput,
  validatePatch,
  validateWorkspaceInput,
};
