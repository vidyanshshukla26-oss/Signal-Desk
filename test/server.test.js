'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { startServer } = require('../src/server');

async function makeFixture() {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'signaldesk-'));
  const server = await startServer({
    dataFile: path.join(directory, 'workspace.json'),
    publicDir: path.join(directory, 'public'),
    seed: false,
    port: 0,
    logger: { error() {} },
  });
  return { directory, server, baseUrl: server.url };
}

async function closeFixture(fixture) {
  await new Promise((resolve, reject) => fixture.server.close((error) => error ? reject(error) : resolve()));
  await fsp.rm(fixture.directory, { recursive: true, force: true });
}

async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

test('HTTP flow creates isolated workspaces, triages feedback, summarizes, and exports CSV', async (t) => {
  const fixture = await makeFixture();
  t.after(() => closeFixture(fixture));

  const health = await jsonRequest(fixture.baseUrl, '/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.response.headers.get('x-content-type-options'), 'nosniff');

  const initial = await jsonRequest(fixture.baseUrl, '/api/workspaces');
  assert.equal(initial.response.status, 200);
  assert.deepEqual(initial.body, []);

  const createdA = await jsonRequest(fixture.baseUrl, '/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name: 'Acme workspace' }),
  });
  const createdB = await jsonRequest(fixture.baseUrl, '/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name: 'Other workspace' }),
  });
  assert.equal(createdA.response.status, 201);
  assert.equal(createdB.response.status, 201);
  const workspaceId = createdA.body.id;
  const otherId = createdB.body.id;

  const createdFeedback = await jsonRequest(fixture.baseUrl, `/api/workspaces/${workspaceId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Checkout times out',
      body: 'Customers are blocked by slow production requests and urgent timeouts.',
      source: 'support',
      customer: 'Acme',
    }),
  });
  assert.equal(createdFeedback.response.status, 201);
  assert.equal(createdFeedback.body.status, 'inbox');
  assert.equal(createdFeedback.body.triage.category, 'performance');
  assert.ok(createdFeedback.body.triage.rationale);
  const feedbackId = createdFeedback.body.id;

  const filtered = await jsonRequest(fixture.baseUrl, `/api/workspaces/${workspaceId}/feedback?status=inbox`);
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.length, 1);

  const updated = await jsonRequest(fixture.baseUrl, `/api/workspaces/${workspaceId}/feedback/${feedbackId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'in_progress', owner: 'Engineering', dueDate: '2026-03-01' }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.status, 'in_progress');
  assert.equal(updated.body.owner, 'Engineering');

  const retriaged = await jsonRequest(fixture.baseUrl, `/api/workspaces/${workspaceId}/feedback/${feedbackId}/triage`, {
    method: 'POST',
  });
  assert.equal(retriaged.response.status, 200);
  assert.equal(retriaged.body.triage.category, 'performance');

  const summary = await jsonRequest(fixture.baseUrl, `/api/workspaces/${workspaceId}/summary`);
  assert.equal(summary.response.status, 200);
  assert.equal(summary.body.total, 1);
  assert.equal(summary.body.counts.in_progress, 1);
  assert.ok(summary.body.topTopics.some((topic) => topic.topic === 'performance'));

  const isolated = await jsonRequest(fixture.baseUrl, `/api/workspaces/${otherId}/feedback`);
  assert.equal(isolated.response.status, 200);
  assert.deepEqual(isolated.body, []);
  const crossWorkspace = await jsonRequest(fixture.baseUrl, `/api/workspaces/${otherId}/feedback/${feedbackId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'shipped' }),
  });
  assert.equal(crossWorkspace.response.status, 404);

  const exported = await fetch(`${fixture.baseUrl}/api/workspaces/${workspaceId}/export.csv`);
  const csv = await exported.text();
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-type'), /text\/csv/);
  assert.match(csv, /"id","title","body"/);
  assert.match(csv, /Checkout times out/);

  const formulaLike = await jsonRequest(fixture.baseUrl, `/api/workspaces/${workspaceId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({
      title: '=HYPERLINK("https://example.invalid")',
      body: 'A customer supplied a formula-like title.',
      source: 'support',
      customer: 'Safe Export Test',
    }),
  });
  assert.equal(formulaLike.response.status, 201);
  const safeCsv = await (await fetch(`${fixture.baseUrl}/api/workspaces/${workspaceId}/export.csv`)).text();
  assert.match(safeCsv, /"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
});

test('HTTP validation returns useful JSON errors and enforces body limits', async (t) => {
  const fixture = await makeFixture();
  t.after(() => closeFixture(fixture));

  const invalidJson = await jsonRequest(fixture.baseUrl, '/api/workspaces', {
    method: 'POST',
    body: '{bad json',
  });
  assert.equal(invalidJson.response.status, 400);
  assert.equal(invalidJson.body.code, 'INVALID_JSON');
  assert.equal(invalidJson.response.headers.get('x-frame-options'), 'DENY');

  const missingField = await jsonRequest(fixture.baseUrl, '/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert.equal(missingField.response.status, 400);
  assert.match(missingField.body.error, /name is required/);

  const badStatus = await jsonRequest(fixture.baseUrl, '/api/workspaces/nope/feedback?status=unknown');
  assert.equal(badStatus.response.status, 400);
  assert.equal(badStatus.body.code, 'INVALID_STATUS');

  const oversized = await jsonRequest(fixture.baseUrl, '/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name: 'x'.repeat(300000) }),
  });
  assert.equal(oversized.response.status, 413);
  assert.equal(oversized.body.code, 'PAYLOAD_TOO_LARGE');

  const missingWorkspace = await jsonRequest(fixture.baseUrl, '/api/workspaces/not-a-workspace/summary');
  assert.equal(missingWorkspace.response.status, 404);
  assert.equal(missingWorkspace.body.code, 'NOT_FOUND');
});

test('an isolated file stays empty when seed is disabled', async (t) => {
  const fixture = await makeFixture();
  t.after(() => closeFixture(fixture));
  const workspaces = await jsonRequest(fixture.baseUrl, '/api/workspaces');
  assert.deepEqual(workspaces.body, []);
  const data = JSON.parse(await fsp.readFile(path.join(fixture.directory, 'workspace.json'), 'utf8'));
  assert.deepEqual(data.workspaces, []);
});

test('serves public files and keeps API errors and traversal attempts JSON', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'signaldesk-static-'));
  const publicDir = path.join(directory, 'public');
  await fsp.mkdir(publicDir, { recursive: true });
  await fsp.writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>SignalDesk</title>');
  await fsp.writeFile(path.join(directory, 'outside.txt'), 'private');
  const server = await startServer({
    dataFile: path.join(directory, 'workspace.json'),
    publicDir,
    seed: false,
    port: 0,
    logger: { error() {} },
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fsp.rm(directory, { recursive: true, force: true });
  });

  const page = await fetch(`${server.url}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /SignalDesk/);

  const traversal = await fetch(`${server.url}/../outside.txt`);
  assert.equal(traversal.status, 404);
  assert.match(traversal.headers.get('content-type'), /application\/json/);
  assert.equal((await traversal.json()).code, 'NOT_FOUND');
});
