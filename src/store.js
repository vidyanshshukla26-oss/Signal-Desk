'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { triageFeedback } = require('./triage');

const DEFAULT_DATA_FILE = path.resolve(
  process.env.SIGNALDESK_DATA_FILE || path.join(process.cwd(), 'data', 'signaldesk.json'),
);
const DATA_VERSION = 1;
const STATUS_VALUES = ['inbox', 'planned', 'in_progress', 'shipped'];
const ALL_STATUS_VALUES = ['all', ...STATUS_VALUES];

class StoreError extends Error {
  constructor(message, code = 'STORE_ERROR', status = 500, details) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

class NotFoundError extends StoreError {
  constructor(message) {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function nowIso(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('The store clock returned an invalid date');
  return date.toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function emptyData() {
  return { version: DATA_VERSION, workspaces: [] };
}

function demoData() {
  const createdAt = '2025-01-15T09:00:00.000Z';
  const feedback = [
    {
      id: 'demo-feedback-1',
      title: 'Dashboard takes too long to load',
      body: 'The analytics dashboard is slow for our whole team and sometimes times out in production.',
      source: 'email',
      customer: 'Northstar Labs',
      createdAt,
      updatedAt: createdAt,
      status: 'inbox',
      owner: null,
      dueDate: null,
      triagedAt: createdAt,
      triage: null,
    },
    {
      id: 'demo-feedback-2',
      title: 'Please add a CSV export',
      body: 'We love the new reporting view. A CSV download would make it much easier to share metrics.',
      source: 'in_app',
      customer: 'Acme Co',
      createdAt,
      updatedAt: createdAt,
      status: 'planned',
      owner: 'Product',
      dueDate: '2025-02-14',
      triagedAt: createdAt,
      triage: null,
    },
    {
      id: 'demo-feedback-3',
      title: 'Charged twice for our subscription',
      body: 'Our invoice shows a duplicate charge. Please help us get a refund as soon as possible.',
      source: 'support',
      customer: 'Brightside Health',
      createdAt,
      updatedAt: createdAt,
      status: 'in_progress',
      owner: 'Billing',
      dueDate: '2025-01-20',
      triagedAt: createdAt,
      triage: null,
    },
  ];
  for (const item of feedback) item.triage = triageFeedback(item);
  return {
    version: DATA_VERSION,
    workspaces: [{
      id: 'demo-workspace',
      name: 'SignalDesk Demo',
      createdAt,
      updatedAt: createdAt,
      feedback,
    }],
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateData(value) {
  if (!isRecord(value)) throw new StoreError('Data file must contain a JSON object', 'DATA_INVALID');
  if (value.version !== undefined && value.version !== DATA_VERSION) {
    throw new StoreError(`Unsupported data version: ${value.version}`, 'DATA_VERSION_UNSUPPORTED');
  }
  if (!Array.isArray(value.workspaces)) throw new StoreError('Data file workspaces must be an array', 'DATA_INVALID');
  const workspaces = value.workspaces.map((workspace) => {
    if (!isRecord(workspace) || typeof workspace.id !== 'string' || typeof workspace.name !== 'string') {
      throw new StoreError('Each workspace must have an id and name', 'DATA_INVALID');
    }
    if (!Array.isArray(workspace.feedback)) throw new StoreError(`Workspace ${workspace.id} feedback must be an array`, 'DATA_INVALID');
    return {
      id: workspace.id,
      name: workspace.name,
      createdAt: workspace.createdAt || new Date(0).toISOString(),
      updatedAt: workspace.updatedAt || workspace.createdAt || new Date(0).toISOString(),
      feedback: workspace.feedback.map((item) => {
        if (!isRecord(item) || typeof item.id !== 'string') throw new StoreError(`Workspace ${workspace.id} has invalid feedback`, 'DATA_INVALID');
        return {
          ...item,
          status: STATUS_VALUES.includes(item.status) ? item.status : 'inbox',
          owner: item.owner ?? null,
          dueDate: item.dueDate ?? null,
          triage: item.triage || triageFeedback(item),
        };
      }),
    };
  });
  return { version: DATA_VERSION, workspaces };
}

function assertStatus(status) {
  if (!ALL_STATUS_VALUES.includes(status)) {
    throw new StoreError(`Status must be one of: ${ALL_STATUS_VALUES.join(', ')}`, 'INVALID_STATUS', 400);
  }
}

function findWorkspace(data, workspaceId) {
  const workspace = data.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) throw new NotFoundError('Workspace not found');
  return workspace;
}

function findFeedback(workspace, feedbackId) {
  const feedback = workspace.feedback.find((item) => item.id === feedbackId);
  if (!feedback) throw new NotFoundError('Feedback not found');
  return feedback;
}

function summarizeWorkspace(workspace) {
  const counts = Object.fromEntries(STATUS_VALUES.map((status) => [status, 0]));
  const topicCounts = new Map();
  const categoryCounts = {};
  const sentimentCounts = {};
  for (const item of workspace.feedback) {
    if (counts[item.status] !== undefined) counts[item.status] += 1;
    const triage = item.triage || triageFeedback(item);
    for (const topic of triage.topics || []) topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    categoryCounts[triage.category] = (categoryCounts[triage.category] || 0) + 1;
    sentimentCounts[triage.sentiment] = (sentimentCounts[triage.sentiment] || 0) + 1;
  }
  const topTopics = [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, 5);
  return {
    workspace: { id: workspace.id, name: workspace.name },
    total: workspace.feedback.length,
    feedbackCount: workspace.feedback.length,
    counts: { all: workspace.feedback.length, ...counts },
    byStatus: { all: workspace.feedback.length, ...counts },
    topTopics,
    topicCounts: Object.fromEntries([...topicCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    categoryCounts,
    sentimentCounts,
  };
}

class JsonStore {
  constructor(options = {}) {
    const configuredPath = options.dataFile || DEFAULT_DATA_FILE;
    this.dataFile = path.resolve(configuredPath);
    this.defaultDataFile = path.resolve(options.defaultDataFile || DEFAULT_DATA_FILE);
    this.seed = options.seed === undefined
      ? this.dataFile === this.defaultDataFile
      : Boolean(options.seed);
    this.clock = options.clock || (() => new Date());
    this.data = null;
    this.ready = false;
    this._queue = Promise.resolve();
  }

  async init() {
    if (this.ready) return this;
    await fsp.mkdir(path.dirname(this.dataFile), { recursive: true });
    let loaded;
    let shouldSeed = false;
    try {
      const raw = await fsp.readFile(this.dataFile, 'utf8');
      if (!raw.trim()) {
        shouldSeed = this.seed;
        loaded = emptyData();
      } else {
        try {
          loaded = validateData(JSON.parse(raw));
          shouldSeed = this.seed && loaded.workspaces.length === 0;
        } catch (error) {
          if (error instanceof SyntaxError) {
            throw new StoreError(`Data file contains invalid JSON: ${this.dataFile}`, 'DATA_INVALID');
          }
          throw error;
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      loaded = emptyData();
      shouldSeed = this.seed;
    }
    this.data = shouldSeed ? demoData() : loaded;
    this.ready = true;
    // Materialize even an empty isolated store so a newly configured local
    // workspace always has a durable JSON file to inspect and back up.
    await this._atomicWrite(this.data);
    return this;
  }

  async _atomicWrite(value) {
    const directory = path.dirname(this.dataFile);
    const temporary = path.join(
      directory,
      `.${path.basename(this.dataFile)}.${process.pid}.${crypto.randomUUID()}.tmp`,
    );
    try {
      const serialized = `${JSON.stringify(value, null, 2)}\n`;
      await fsp.writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
      const handle = await fsp.open(temporary, 'r');
      try {
        try {
          await handle.sync();
        } catch (syncError) {
          const ignoredCodes = new Set(['EACCES', 'EPERM', 'EINVAL', 'ENOSYS', 'ENOTSUP']);
          if (!ignoredCodes.has(syncError && syncError.code)) throw syncError;
        }
      } finally {
        await handle.close();
      }
      await fsp.rename(temporary, this.dataFile);
    } catch (error) {
      await fsp.rm(temporary, { force: true }).catch(() => {});
      throw new StoreError(`Could not persist data file: ${error.message}`, 'DATA_WRITE_FAILED', 500);
    }
  }

  _operation(callback, write = false) {
    const operation = this._queue.then(async () => {
      if (!this.ready) await this.init();
      const result = await callback(this.data);
      if (write) await this._atomicWrite(this.data);
      return clone(result);
    });
    this._queue = operation.catch(() => undefined);
    return operation;
  }

  async listWorkspaces() {
    return this._operation((data) => data.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      feedbackCount: workspace.feedback.length,
    })));
  }

  async createWorkspace(name) {
    return this._operation((data) => {
      const timestamp = nowIso(this.clock);
      const workspace = {
        id: makeId('ws'),
        name,
        createdAt: timestamp,
        updatedAt: timestamp,
        feedback: [],
      };
      data.workspaces.push(workspace);
      return workspace;
    }, true);
  }

  async getWorkspace(workspaceId) {
    return this._operation((data) => findWorkspace(data, workspaceId));
  }

  async listFeedback(workspaceId, status = 'all') {
    assertStatus(status);
    return this._operation((data) => {
      const workspace = findWorkspace(data, workspaceId);
      return workspace.feedback
        .filter((item) => status === 'all' || item.status === status)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    });
  }

  async createFeedback(workspaceId, input) {
    return this._operation((data) => {
      const workspace = findWorkspace(data, workspaceId);
      const timestamp = nowIso(this.clock);
      const item = {
        id: makeId('fb'),
        title: input.title,
        body: input.body,
        source: input.source,
        customer: input.customer,
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'inbox',
        owner: null,
        dueDate: null,
        triagedAt: timestamp,
        triage: triageFeedback(input),
      };
      workspace.feedback.push(item);
      workspace.updatedAt = timestamp;
      return item;
    }, true);
  }

  async triageFeedback(workspaceId, feedbackId) {
    return this._operation((data) => {
      const workspace = findWorkspace(data, workspaceId);
      const item = findFeedback(workspace, feedbackId);
      const timestamp = nowIso(this.clock);
      item.triage = triageFeedback(item);
      item.triagedAt = timestamp;
      item.updatedAt = timestamp;
      workspace.updatedAt = timestamp;
      return item;
    }, true);
  }

  async updateFeedback(workspaceId, feedbackId, patch) {
    return this._operation((data) => {
      const workspace = findWorkspace(data, workspaceId);
      const item = findFeedback(workspace, feedbackId);
      if (patch.status !== undefined) {
        if (!STATUS_VALUES.includes(patch.status)) {
          throw new StoreError(`Status must be one of: ${STATUS_VALUES.join(', ')}`, 'INVALID_STATUS', 400);
        }
        item.status = patch.status;
      }
      if (patch.owner !== undefined) item.owner = patch.owner;
      if (patch.dueDate !== undefined) item.dueDate = patch.dueDate;
      const timestamp = nowIso(this.clock);
      item.updatedAt = timestamp;
      workspace.updatedAt = timestamp;
      return item;
    }, true);
  }

  async getSummary(workspaceId) {
    return this._operation((data) => summarizeWorkspace(findWorkspace(data, workspaceId)));
  }

  async exportFeedback(workspaceId) {
    return this._operation((data) => {
      const workspace = findWorkspace(data, workspaceId);
      return clone(workspace);
    });
  }
}

function createStore(options = {}) {
  return new JsonStore(options);
}

module.exports = {
  ALL_STATUS_VALUES,
  DEFAULT_DATA_FILE,
  DATA_VERSION,
  JsonStore,
  NotFoundError,
  STATUS_VALUES,
  StoreError,
  createStore,
  demoData,
  emptyData,
  summarizeWorkspace,
};
