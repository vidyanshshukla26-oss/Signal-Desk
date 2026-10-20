'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/store');

test('JSON store persists mutations with an isolated atomic file', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'signaldesk-store-'));
  const dataFile = path.join(directory, 'nested', 'signaldesk.json');
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));

  const store = createStore({ dataFile, seed: false, clock: () => '2026-01-02T03:04:05.000Z' });
  const workspace = await store.createWorkspace('Persisted');
  const feedback = await store.createFeedback(workspace.id, {
    title: 'Refund requested',
    body: 'The customer was charged twice and needs a refund.',
    source: 'email',
    customer: 'Example',
  });
  await store.updateFeedback(workspace.id, feedback.id, { status: 'planned', owner: 'Billing' });

  const persisted = JSON.parse(await fsp.readFile(dataFile, 'utf8'));
  assert.equal(persisted.workspaces[0].feedback[0].status, 'planned');
  assert.equal(persisted.workspaces[0].feedback[0].triage.category, 'billing');

  const reopened = createStore({ dataFile, seed: false });
  const loaded = await reopened.listFeedback(workspace.id, 'all');
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].owner, 'Billing');
});
