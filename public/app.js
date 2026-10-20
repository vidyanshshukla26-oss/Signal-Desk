(() => {
  "use strict";

  const API_ROOT = "/api";
  const STATUS_ORDER = ["inbox", "planned", "in_progress", "shipped"];
  const STATUS_META = {
    all: { label: "All signals", pill: "neutral" },
    inbox: { label: "Inbox", pill: "inbox" },
    planned: { label: "Planned", pill: "planned" },
    in_progress: { label: "In progress", pill: "in_progress" },
    shipped: { label: "Shipped", pill: "shipped" },
  };

  const state = {
    workspaces: [],
    currentWorkspaceId: null,
    filter: "all",
    summary: null,
    feedback: [],
    selectedSignal: null,
    errors: {
      workspaces: null,
      summary: null,
      feedback: null,
    },
    loading: {
      workspaces: false,
      workspaceData: false,
    },
    dataRequestToken: 0,
  };

  let activeModal = null;
  let modalReturnFocus = null;

  const elements = {};

  function cacheElements() {
    [
      "workspace-select",
      "topbar-workspace",
      "workspace-title",
      "workspace-description",
      "global-alert",
      "refresh-button",
      "export-button",
      "nav-signal-count",
      "filter-group",
      "pipeline-caption",
      "signal-count",
      "feedback-region",
      "detail-panel",
      "detail-empty",
      "detail-content",
      "workspace-modal",
      "workspace-form",
      "workspace-name",
      "workspace-form-error",
      "workspace-submit",
      "signal-modal",
      "signal-form",
      "signal-form-error",
      "signal-submit",
      "toast-region",
    ].forEach((id) => {
      elements[id] = document.getElementById(id);
    });
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function textValue(value, fallback = "") {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      return text || fallback;
    }
    if (typeof value === "object") {
      return textValue(value.text ?? value.value ?? value.label ?? value.name, fallback);
    }
    return fallback;
  }

  function firstText(...values) {
    for (const value of values) {
      const text = textValue(value);
      if (text) return text;
    }
    return "";
  }

  function numberValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return null;
  }

  function displayLabel(value, fallback = "Not set") {
    const text = textValue(value, fallback);
    return text
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function normalizeStatus(value) {
    const normalized = String(value || "inbox")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (normalized === "inprogress") return "in_progress";
    return STATUS_ORDER.includes(normalized) ? normalized : "inbox";
  }

  function statusLabel(status) {
    return STATUS_META[normalizeStatus(status)]?.label || "Inbox";
  }

  function statusPill(status) {
    const normalized = normalizeStatus(status);
    return `<span class="status-pill status-pill-${normalized}">${escapeHTML(statusLabel(normalized))}</span>`;
  }

  function extractCollection(payload, keys = []) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];

    for (const key of keys) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && typeof payload.data === "object") {
      for (const key of keys) {
        if (Array.isArray(payload.data[key])) return payload.data[key];
      }
    }
    return [];
  }

  function extractSingle(payload, keys = []) {
    if (!payload) return null;
    if (Array.isArray(payload)) return payload[0] || null;
    if (typeof payload !== "object") return null;

    for (const key of keys) {
      if (payload[key] && typeof payload[key] === "object" && !Array.isArray(payload[key])) {
        return payload[key];
      }
    }
    if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
      for (const key of keys) {
        if (payload.data[key] && typeof payload.data[key] === "object") return payload.data[key];
      }
      return payload.data;
    }
    return payload;
  }

  function normalizeWorkspace(raw) {
    const workspace = raw && typeof raw === "object" ? raw : {};
    const rawId = workspace.id ?? workspace.workspaceId ?? workspace.workspace_id ?? workspace._id;
    const name = firstText(workspace.name, workspace.title, "Untitled workspace");
    return {
      id: textValue(rawId),
      name,
      description: firstText(workspace.description, "Customer feedback workspace"),
    };
  }

  function normalizeFeedback(raw) {
    const signal = raw && typeof raw === "object" ? raw : {};
    const triage = signal.triage ?? signal.aiTriage ?? signal.analysis ?? {};
    const rawId = signal.id ?? signal.feedbackId ?? signal.feedback_id ?? signal._id;
    return {
      id: textValue(rawId),
      title: firstText(signal.title, signal.subject, "Untitled signal"),
      body: firstText(signal.body, signal.content, signal.description, "No additional context was provided."),
      source: firstText(signal.source, signal.channel, "Customer"),
      customer: firstText(signal.customer, signal.customerName, signal.customer_name, "Unknown customer"),
      status: normalizeStatus(signal.status ?? signal.stage),
      owner: firstText(signal.owner, signal.ownerName, signal.owner_name),
      dueDate: firstText(signal.dueDate, signal.due_date),
      createdAt: signal.createdAt ?? signal.created_at ?? signal.created ?? null,
      updatedAt: signal.updatedAt ?? signal.updated_at ?? null,
      explanation: firstText(
        signal.explanation,
        signal.triageExplanation,
        signal.triage_explanation,
        triage.explanation,
        triage.reason,
        triage.rationale,
      ),
      nextAction: firstText(
        signal.nextAction,
        signal.next_action,
        signal.recommendation,
        signal.action,
        triage.nextAction,
        triage.next_action,
        triage.recommendation,
        triage.action,
      ),
      triage: signal.triage ?? signal.aiTriage ?? signal.analysis ?? null,
      tags: Array.isArray(signal.tags) ? signal.tags : [],
    };
  }

  function getCurrentWorkspace() {
    return state.workspaces.find((workspace) => workspace.id === state.currentWorkspaceId) || null;
  }

  function workspaceEndpoint(suffix = "") {
    return `/workspaces/${encodeURIComponent(state.currentWorkspaceId)}${suffix}`;
  }

  async function apiRequest(path, options = {}) {
    const config = { ...options, headers: { ...(options.headers || {}) } };
    if (config.body && typeof config.body !== "string") {
      config.body = JSON.stringify(config.body);
      config.headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_ROOT}${path}`, config);
    const raw = await response.text();
    let payload = null;

    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = raw;
      }
    }

    if (!response.ok) {
      const message = typeof payload === "string" ? payload : payload?.error || payload?.message;
      throw new Error(message || `Request failed (${response.status})`);
    }
    return payload;
  }

  function friendlyError(error, fallback = "Something went wrong. Try again.") {
    if (!error) return fallback;
    const message = textValue(error.message, fallback);
    return message.length > 180 ? `${message.slice(0, 177)}…` : message;
  }

  function formatDate(value, fallback = "No date") {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return textValue(value, fallback);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function formatDateInput(value) {
    if (!value) return "";
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function slugify(value) {
    return textValue(value, "signaldesk")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "signaldesk";
  }

  function renderWorkspaceSelect() {
    const select = elements["workspace-select"];
    if (!select) return;
    if (state.loading.workspaces) {
      select.innerHTML = `<option>Loading workspaces…</option>`;
      select.disabled = true;
      return;
    }

    if (!state.workspaces.length) {
      select.innerHTML = `<option value="">No workspaces yet</option>`;
      select.disabled = true;
      return;
    }

    select.innerHTML = state.workspaces
      .map(
        (workspace) =>
          `<option value="${escapeHTML(workspace.id)}" ${workspace.id === state.currentWorkspaceId ? "selected" : ""}>${escapeHTML(workspace.name)}</option>`,
      )
      .join("");
    select.disabled = false;
  }

  function renderWorkspaceIdentity() {
    const workspace = getCurrentWorkspace();
    const name = workspace?.name || "No workspace";

    elements["topbar-workspace"].textContent = name;
    elements["workspace-title"].textContent = workspace ? "Good morning, Jordan." : "Start with a workspace.";
    elements["workspace-description"].textContent = workspace
      ? `${name} is your shared customer voice — organized for the next clear product move.`
      : "Create a workspace to collect customer signals, make sense of them, and share what happens next.";
  }

  function readSummaryCounts() {
    const summary = state.summary && typeof state.summary === "object" ? state.summary : {};
    const candidates = [summary.counts, summary.byStatus, summary.statusCounts, summary.data?.counts, summary];
    const read = (keys) => {
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object") continue;
        for (const key of keys) {
          const value = numberValue(candidate[key]);
          if (value !== null) return value;
        }
      }
      return null;
    };

    const counts = {
      all: read(["all", "total", "totalSignals", "total_signals", "totalFeedback", "total_feedback", "count"]),
      inbox: read(["inbox", "inboxCount", "inbox_count", "new", "open"]),
      planned: read(["planned", "plannedCount", "planned_count"]),
      in_progress: read(["in_progress", "inProgress", "inProgressCount", "in_progress_count"]),
      shipped: read(["shipped", "shippedCount", "shipped_count", "completed"]),
    };

    if (counts.all === null) {
      const knownStatuses = STATUS_ORDER.filter((status) => counts[status] !== null);
      if (knownStatuses.length) counts.all = knownStatuses.reduce((total, status) => total + counts[status], 0);
    }

    if (state.filter === "all" || state.errors.summary) {
      const visibleCounts = state.feedback.reduce((result, signal) => {
        result[signal.status] = (result[signal.status] || 0) + 1;
        return result;
      }, {});
      if (counts.all === null && state.feedback.length) counts.all = state.feedback.length;
      for (const status of STATUS_ORDER) {
        if (counts[status] === null && visibleCounts[status] !== undefined) counts[status] = visibleCounts[status];
      }
    }
    return counts;
  }

  function renderSummary() {
    const metricNodes = document.querySelectorAll("[data-metric]");
    if (state.loading.workspaceData || !state.currentWorkspaceId) {
      metricNodes.forEach((node) => {
        node.textContent = "—";
      });
      elements["nav-signal-count"].textContent = "—";
      return;
    }

    const counts = readSummaryCounts();
    metricNodes.forEach((node) => {
      const value = counts[node.dataset.metric];
      node.textContent = value === null || value === undefined ? "—" : String(value);
    });
    elements["nav-signal-count"].textContent = counts.all === null || counts.all === undefined ? "—" : String(counts.all);
  }

  function renderFilters() {
    elements["filter-group"].querySelectorAll("[data-filter]").forEach((button) => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const filterLabel = STATUS_META[state.filter]?.label || "All signals";
    elements["pipeline-caption"].textContent =
      state.filter === "all" ? "Every customer voice, with a next step attached." : `${filterLabel} signals that need your attention.`;
  }

  function renderGlobalAlert() {
    const alert = elements["global-alert"];
    let message = "";
    let action = "";

    if (state.errors.workspaces) {
      message = `Workspaces could not be loaded: ${friendlyError(state.errors.workspaces)}`;
      action = `<button type="button" data-action="retry-workspaces">Retry</button>`;
    } else if (state.errors.summary && state.currentWorkspaceId) {
      message = `Summary is temporarily unavailable. Your signal list may still be usable.`;
      action = `<button type="button" data-action="retry-data">Retry</button>`;
    }

    if (!message) {
      alert.hidden = true;
      alert.innerHTML = "";
      return;
    }

    alert.innerHTML = `<span>${escapeHTML(message)}</span>${action}`;
    alert.hidden = false;
  }

  function renderFeedbackRegion() {
    const region = elements["feedback-region"];
    region.setAttribute("aria-busy", String(state.loading.workspaceData || state.loading.workspaces));

    if (state.loading.workspaceData || state.loading.workspaces) {
      region.innerHTML = `<div class="loading-list" aria-label="Loading signals"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>`;
      elements["signal-count"].textContent = "…";
      return;
    }

    if (state.errors.feedback) {
      region.innerHTML = `
        <div class="inline-error">
          <div class="error-mark" aria-hidden="true">!</div>
          <h3>Signals are taking a detour</h3>
          <p>${escapeHTML(friendlyError(state.errors.feedback, "We could not load this pipeline."))}</p>
          <button class="button button-secondary" type="button" data-action="retry-data">Try again</button>
        </div>`;
      elements["signal-count"].textContent = "—";
      return;
    }

    if (!state.currentWorkspaceId) {
      region.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-mark" aria-hidden="true">＋</div>
          <h3>Your first workspace starts here</h3>
          <p>Create a workspace to give customer feedback a home and start building your signal pipeline.</p>
          <button class="button button-primary" type="button" data-action="open-workspace-modal">Create workspace</button>
        </div>`;
      elements["signal-count"].textContent = "0";
      return;
    }

    if (!state.feedback.length) {
      const filterLabel = STATUS_META[state.filter]?.label?.toLowerCase() || "this view";
      region.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-mark" aria-hidden="true">✦</div>
          <h3>No signals in ${escapeHTML(filterLabel)}</h3>
          <p>Capture the next customer voice and turn it into a clear, explainable action.</p>
          <button class="button button-primary" type="button" data-action="open-signal-modal"><span class="button-icon" aria-hidden="true">＋</span>Add signal</button>
        </div>`;
      elements["signal-count"].textContent = "0";
      return;
    }

    region.innerHTML = `<ul class="signal-list">${state.feedback.map(renderSignalRow).join("")}</ul>`;
    elements["signal-count"].textContent = String(state.feedback.length);
  }

  function renderSignalRow(signal) {
    const selected = state.selectedSignal?.id && state.selectedSignal.id === signal.id;
    const body = textValue(signal.body, "No additional context was provided.");
    return `
      <li>
        <button class="signal-row${selected ? " is-selected" : ""}" type="button" data-feedback-id="${escapeHTML(signal.id)}" aria-label="Open signal: ${escapeHTML(signal.title)}" aria-pressed="${selected}">
          <span class="signal-main">
            <span class="signal-heading">
              ${statusPill(signal.status)}
              <h3>${escapeHTML(signal.title)}</h3>
            </span>
            <span class="signal-excerpt">${escapeHTML(body)}</span>
            <span class="signal-meta">
              <span class="signal-source">${escapeHTML(signal.source)}</span>
              <span class="signal-customer">${escapeHTML(signal.customer)}</span>
              <span>${escapeHTML(formatDate(signal.createdAt, "Recently added"))}</span>
            </span>
          </span>
          <span class="signal-arrow" aria-hidden="true">→</span>
        </button>
      </li>`;
  }

  function getTriageInfo(signal) {
    const triage = signal?.triage && typeof signal.triage === "object" ? signal.triage : {};
    const confidence = numberValue(triage.confidence);
    return {
      explanation: firstText(
        signal?.explanation,
        triage.explanation,
        triage.reason,
        triage.rationale,
        triage.summary,
      ),
      nextAction: firstText(
        signal?.nextAction,
        triage.nextAction,
        triage.next_action,
        triage.recommendation,
        triage.action,
      ),
      category: firstText(triage.category),
      priority: firstText(triage.priority, triage.severity),
      priorityScore: numberValue(triage.priorityScore ?? triage.severityScore),
      sentiment: firstText(triage.sentiment),
      topics: Array.isArray(triage.topics) ? triage.topics : [],
      ownerRole: firstText(triage.ownerRole, triage.owner_role),
      confidence,
    };
  }

  function renderDetail() {
    const signal = state.selectedSignal;
    if (!signal) {
      elements["detail-empty"].hidden = false;
      elements["detail-content"].hidden = true;
      elements["detail-content"].innerHTML = "";
      return;
    }

    const triage = getTriageInfo(signal);
    const statusOptions = STATUS_ORDER.map(
      (status) => `<option value="${status}" ${signal.status === status ? "selected" : ""}>${escapeHTML(statusLabel(status))}</option>`,
    ).join("");
    const source = escapeHTML(signal.source);
    const customer = escapeHTML(signal.customer);
    const owner = escapeHTML(signal.owner);
    const dueDate = escapeHTML(formatDateInput(signal.dueDate));
    const hasTriage = Boolean(triage.explanation || triage.nextAction);
    const triageMeta = [
      triage.category ? `<span class="triage-chip"><strong>Type</strong>${escapeHTML(displayLabel(triage.category))}</span>` : "",
      triage.priority ? `<span class="triage-chip triage-chip-priority"><strong>Priority</strong>${escapeHTML(displayLabel(triage.priority))}${triage.priorityScore === null ? "" : ` · ${escapeHTML(String(triage.priorityScore))}/100`}</span>` : "",
      triage.ownerRole ? `<span class="triage-chip"><strong>Route</strong>${escapeHTML(triage.ownerRole)}</span>` : "",
      triage.sentiment ? `<span class="triage-chip"><strong>Sentiment</strong>${escapeHTML(displayLabel(triage.sentiment))}</span>` : "",
      triage.confidence === null ? "" : `<span class="triage-chip"><strong>Confidence</strong>${escapeHTML(`${Math.round(triage.confidence * 100)}%`)}</span>`,
    ].filter(Boolean).join("");
    const topicMeta = triage.topics.length
      ? `<div class="triage-topics"><span>Topics</span>${triage.topics.slice(0, 3).map((topic) => `<span class="topic-chip">${escapeHTML(displayLabel(topic))}</span>`).join("")}</div>`
      : "";

    elements["detail-empty"].hidden = true;
    elements["detail-content"].hidden = false;
    elements["detail-content"].innerHTML = `
      <div class="detail-topline">
        <p class="section-kicker">Signal detail</p>
        <button class="detail-close" type="button" data-action="clear-selection" aria-label="Close signal detail">×</button>
      </div>
      <div class="detail-heading-status">${statusPill(signal.status)}</div>
      <h2 id="detail-panel-title">${escapeHTML(signal.title)}</h2>
      <p class="detail-body">${escapeHTML(signal.body)}</p>
      <div class="detail-facts">
        <div class="detail-fact"><span class="detail-fact-label">Source</span><span class="detail-fact-value">${source}</span></div>
        <div class="detail-fact"><span class="detail-fact-label">Customer</span><span class="detail-fact-value">${customer}</span></div>
        <div class="detail-fact"><span class="detail-fact-label">Added</span><span class="detail-fact-value">${escapeHTML(formatDate(signal.createdAt, "Recently"))}</span></div>
        <div class="detail-fact"><span class="detail-fact-label">Signal ID</span><span class="detail-fact-value" title="${escapeHTML(signal.id)}">${escapeHTML(signal.id || "Not provided")}</span></div>
      </div>
      <section class="triage-insight" id="triage-insight" aria-labelledby="triage-title">
        <div class="triage-insight-heading">
          <h3 id="triage-title">Explainable triage</h3>
          <span class="explainable-label">✦ Human-readable</span>
        </div>
        ${hasTriage && triageMeta ? `<div class="triage-meta">${triageMeta}</div>${topicMeta}` : ""}
        ${
          hasTriage
            ? `<div class="triage-points">
                <div class="triage-point"><span class="triage-point-icon" aria-hidden="true">?</span><div><strong>Why this matters</strong><p>${escapeHTML(triage.explanation || "The triage service returned no rationale yet.")}</p></div></div>
                <div class="triage-point"><span class="triage-point-icon" aria-hidden="true">→</span><div><strong>Recommended next action</strong><p>${escapeHTML(triage.nextAction || "Choose an owner and move this signal to its next stage.")}</p></div></div>
              </div>`
            : `<p class="triage-empty-copy">Run triage to turn this raw signal into a transparent recommendation with a concrete next action.</p>`
        }
        <button class="button button-triage" type="button" data-action="run-triage">${hasTriage ? "Run triage again" : "Run explainable triage"}</button>
      </section>
      <section class="edit-section" aria-labelledby="routing-title">
        <div class="edit-section-heading"><h3 id="routing-title">Route this signal</h3><span>Updates the pipeline</span></div>
        <form id="signal-edit-form">
          <div class="edit-form-grid">
            <div class="form-field"><label for="edit-status">Status</label><div class="select-wrap"><select id="edit-status" name="status">${statusOptions}</select><span class="select-chevron" aria-hidden="true">⌄</span></div></div>
            <div class="form-field"><label for="edit-owner">Owner</label><input id="edit-owner" name="owner" type="text" maxlength="120" value="${owner}" placeholder="Assign a teammate" /></div>
          </div>
          <div class="form-field" style="margin-top: 10px"><label for="edit-due-date">Due date</label><input id="edit-due-date" name="dueDate" type="date" value="${dueDate}" /></div>
          <div class="edit-form-actions"><button class="button button-primary" type="submit" id="save-signal-button">Save routing</button></div>
        </form>
      </section>`;
  }

  function renderAll() {
    renderWorkspaceSelect();
    renderWorkspaceIdentity();
    renderSummary();
    renderFilters();
    renderGlobalAlert();
    renderFeedbackRegion();
    renderDetail();
  }

  function setButtonBusy(button, isBusy, busyLabel = "Working…") {
    if (!button) return;
    if (isBusy) {
      if (!button.dataset.originalContent) button.dataset.originalContent = button.innerHTML;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.innerHTML = `<span class="button-icon" aria-hidden="true">⋯</span><span>${escapeHTML(busyLabel)}</span>`;
    } else {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (button.dataset.originalContent) {
        button.innerHTML = button.dataset.originalContent;
        delete button.dataset.originalContent;
      }
    }
  }

  async function loadWorkspaces(preferredId = null, preferredName = "") {
    state.loading.workspaces = true;
    state.errors.workspaces = null;
    renderWorkspaceSelect();
    renderGlobalAlert();
    renderSummary();
    renderFeedbackRegion();

    try {
      const payload = await apiRequest("/workspaces");
      state.workspaces = extractCollection(payload, ["workspaces", "items"]).map(normalizeWorkspace).filter((item) => item.id);

      const matchById = preferredId && state.workspaces.find((workspace) => workspace.id === String(preferredId));
      const matchByName = preferredName && state.workspaces.find((workspace) => workspace.name.toLowerCase() === preferredName.toLowerCase());
      const currentStillExists = state.currentWorkspaceId && state.workspaces.some((workspace) => workspace.id === state.currentWorkspaceId);
      state.currentWorkspaceId = matchById?.id || matchByName?.id || (currentStillExists ? state.currentWorkspaceId : state.workspaces[0]?.id || null);
      state.loading.workspaces = false;
      renderWorkspaceSelect();
      await loadWorkspaceData({ clearSelection: true });
    } catch (error) {
      state.loading.workspaces = false;
      state.errors.workspaces = error;
      state.currentWorkspaceId = null;
      state.summary = null;
      state.feedback = [];
      state.selectedSignal = null;
      state.loading.workspaceData = false;
      renderAll();
    }
  }

  async function loadWorkspaceData({ clearSelection = false } = {}) {
    if (clearSelection) state.selectedSignal = null;
    const workspaceId = state.currentWorkspaceId;
    const token = ++state.dataRequestToken;

    if (!workspaceId) {
      state.loading.workspaceData = false;
      state.summary = null;
      state.feedback = [];
      state.errors.summary = null;
      state.errors.feedback = null;
      renderAll();
      return;
    }

    state.loading.workspaceData = true;
    state.errors.summary = null;
    state.errors.feedback = null;
    renderAll();

    const summaryRequest = apiRequest(workspaceEndpoint("/summary"));
    const feedbackRequest = apiRequest(`${workspaceEndpoint("/feedback")}?status=${encodeURIComponent(state.filter)}`);
    const [summaryResult, feedbackResult] = await Promise.allSettled([summaryRequest, feedbackRequest]);

    if (token !== state.dataRequestToken || workspaceId !== state.currentWorkspaceId) return;

    if (summaryResult.status === "fulfilled") {
      state.summary = summaryResult.value;
    } else {
      state.summary = null;
      state.errors.summary = summaryResult.reason;
    }

    if (feedbackResult.status === "fulfilled") {
      state.feedback = extractCollection(feedbackResult.value, ["feedback", "signals", "items"]).map(normalizeFeedback);
    } else {
      state.feedback = [];
      state.errors.feedback = feedbackResult.reason;
    }

    state.loading.workspaceData = false;
    if (state.selectedSignal) {
      const freshSignal = state.feedback.find((signal) => signal.id === state.selectedSignal.id);
      if (freshSignal) state.selectedSignal = { ...state.selectedSignal, ...freshSignal };
    }
    renderAll();
  }

  function selectSignal(signalId) {
    const signal = state.feedback.find((item) => item.id === signalId);
    if (!signal) return;
    state.selectedSignal = { ...signal };
    renderFeedbackRegion();
    renderDetail();
    if (window.matchMedia && window.matchMedia("(max-width: 1020px)").matches) {
      elements["detail-panel"].scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function clearSelection() {
    state.selectedSignal = null;
    renderFeedbackRegion();
    renderDetail();
  }

  function extractTriage(payload) {
    const nestedSignal = extractSingle(payload, ["feedback", "signal", "item"]);
    const source = payload?.triage || payload?.result || payload?.data?.triage || (nestedSignal && nestedSignal !== payload ? nestedSignal : payload) || {};
    return {
      explanation: firstText(source.explanation, source.reason, source.rationale, source.summary, source.why),
      nextAction: firstText(source.nextAction, source.next_action, source.recommendation, source.action, source.next),
      status: source.status ? normalizeStatus(source.status) : "",
      owner: firstText(source.owner, source.ownerName, source.owner_name),
      dueDate: firstText(source.dueDate, source.due_date),
      raw: source,
    };
  }

  function mergeSelectedSignal(patch) {
    if (!state.selectedSignal) return;
    state.selectedSignal = { ...state.selectedSignal, ...patch };
    const index = state.feedback.findIndex((signal) => signal.id === state.selectedSignal.id);
    if (index >= 0) state.feedback[index] = { ...state.feedback[index], ...patch };
  }

  async function runTriage(button) {
    if (!state.currentWorkspaceId || !state.selectedSignal?.id) {
      showToast("Choose a signal before running triage.", "error");
      return;
    }

    setButtonBusy(button, true, "Reading signal…");
    try {
      const payload = await apiRequest(`${workspaceEndpoint(`/feedback/${encodeURIComponent(state.selectedSignal.id)}/triage`)}`, { method: "POST" });
      const result = extractTriage(payload);
      const responseSignal = normalizeFeedback(extractSingle(payload, ["feedback", "signal", "item"]));
      const patch = {
        explanation: result.explanation || responseSignal.explanation || state.selectedSignal.explanation,
        nextAction: result.nextAction || responseSignal.nextAction || state.selectedSignal.nextAction,
        triage: result.raw || state.selectedSignal.triage,
      };
      if (result.status) patch.status = result.status;
      if (result.owner) patch.owner = result.owner;
      if (result.dueDate) patch.dueDate = result.dueDate;
      if (responseSignal.id && responseSignal.id === state.selectedSignal.id) Object.assign(patch, responseSignal);
      mergeSelectedSignal(patch);
      renderFeedbackRegion();
      renderDetail();
      showToast("Triage complete — the explanation and next action are ready.", "success");
    } catch (error) {
      showToast(`Triage could not run: ${friendlyError(error)}`, "error");
      setButtonBusy(button, false);
    }
  }

  async function saveSignalRouting(event) {
    event.preventDefault();
    if (!state.currentWorkspaceId || !state.selectedSignal?.id) return;
    const form = event.target;
    const formData = new FormData(form);
    const patch = {
      status: normalizeStatus(formData.get("status")),
      owner: textValue(formData.get("owner")),
      dueDate: textValue(formData.get("dueDate")),
    };
    const button = form.querySelector("button[type=submit]");
    setButtonBusy(button, true, "Saving…");

    try {
      const payload = await apiRequest(`${workspaceEndpoint(`/feedback/${encodeURIComponent(state.selectedSignal.id)}`)}`, {
        method: "PATCH",
        body: patch,
      });
      const updated = normalizeFeedback(extractSingle(payload, ["feedback", "signal", "item"]));
      mergeSelectedSignal({ ...patch, ...(updated.id === state.selectedSignal.id ? updated : {}) });
      await loadWorkspaceData();
      showToast("Signal routing updated.", "success");
    } catch (error) {
      showToast(`Routing could not be saved: ${friendlyError(error)}`, "error");
      setButtonBusy(button, false);
    }
  }

  async function createWorkspace(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const name = textValue(new FormData(form).get("name"));
    const errorNode = elements["workspace-form-error"];
    errorNode.hidden = true;
    const button = elements["workspace-submit"];
    setButtonBusy(button, true, "Creating…");

    try {
      const payload = await apiRequest("/workspaces", { method: "POST", body: { name } });
      const workspacePayload = extractSingle(payload, ["workspace", "item"]);
      const created = normalizeWorkspace(workspacePayload);
      setButtonBusy(button, false);
      closeModal(elements["workspace-modal"]);
      form.reset();
      showToast(`${name} workspace created.`, "success");
      await loadWorkspaces(created.id || null, name);
    } catch (error) {
      errorNode.textContent = friendlyError(error, "Workspace could not be created.");
      errorNode.hidden = false;
      setButtonBusy(button, false);
    }
  }

  async function createSignal(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!state.currentWorkspaceId) {
      elements["signal-form-error"].textContent = "Create a workspace before adding a signal.";
      elements["signal-form-error"].hidden = false;
      return;
    }

    const values = new FormData(form);
    const payload = {
      title: textValue(values.get("title")),
      body: textValue(values.get("body")),
      source: textValue(values.get("source")),
      customer: textValue(values.get("customer")),
    };
    elements["signal-form-error"].hidden = true;
    const button = elements["signal-submit"];
    setButtonBusy(button, true, "Saving…");

    try {
      const response = await apiRequest(workspaceEndpoint("/feedback"), { method: "POST", body: payload });
      const created = normalizeFeedback(extractSingle(response, ["feedback", "signal", "item"]));
      setButtonBusy(button, false);
      closeModal(elements["signal-modal"]);
      form.reset();
      showToast("Signal added to the inbox.", "success");
      await loadWorkspaceData({ clearSelection: true });
      if (created.id) {
        const fresh = state.feedback.find((signal) => signal.id === created.id);
        state.selectedSignal = fresh ? { ...fresh } : created;
        renderFeedbackRegion();
        renderDetail();
      }
    } catch (error) {
      elements["signal-form-error"].textContent = friendlyError(error, "Signal could not be saved.");
      elements["signal-form-error"].hidden = false;
      setButtonBusy(button, false);
    }
  }

  async function exportCSV() {
    if (!state.currentWorkspaceId) {
      showToast("Create or choose a workspace before exporting.", "error");
      return;
    }
    const button = elements["export-button"];
    setButtonBusy(button, true, "Exporting…");
    try {
      const response = await fetch(`${API_ROOT}${workspaceEndpoint("/export.csv")}`);
      if (!response.ok) {
        const raw = await response.text();
        let message = raw;
        try {
          const parsed = JSON.parse(raw);
          message = parsed.error || parsed.message || raw;
        } catch {
          // The response may be plain text; keep it as the error message.
        }
        throw new Error(message || `Export failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugify(getCurrentWorkspace()?.name)}-signals.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("CSV export is ready.", "success");
    } catch (error) {
      showToast(`Export could not be created: ${friendlyError(error)}`, "error");
    } finally {
      setButtonBusy(button, false);
    }
  }

  function showFormError(id, message = "") {
    const node = elements[id];
    if (!node) return;
    node.textContent = message;
    node.hidden = !message;
  }

  function openModal(modal) {
    if (!modal) return;
    if (activeModal && activeModal !== modal) closeModal(activeModal);
    activeModal = modal;
    modalReturnFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    if (modal.id === "workspace-modal") showFormError("workspace-form-error");
    if (modal.id === "signal-modal") showFormError("signal-form-error");
    const firstField = modal.querySelector("input:not([disabled]), textarea:not([disabled]), select:not([disabled])");
    window.setTimeout(() => (firstField || modal.querySelector("button"))?.focus(), 0);
  }

  function closeModal(modal = activeModal) {
    if (!modal) return;
    modal.hidden = true;
    if (activeModal === modal) activeModal = null;
    document.body.classList.remove("modal-open");
    const previous = modalReturnFocus;
    modalReturnFocus = null;
    if (previous && typeof previous.focus === "function" && document.contains(previous)) {
      window.setTimeout(() => previous.focus(), 0);
    }
  }

  function trapModalFocus(event) {
    if (!activeModal || activeModal.hidden || event.key !== "Tab") return;
    const focusable = [...activeModal.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")].filter(
      (node) => !node.hidden && node.offsetParent !== null,
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = type === "error" ? "!" : type === "info" ? "i" : "✓";
    const text = document.createElement("span");
    text.textContent = message;
    toast.append(icon, text);
    elements["toast-region"].appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add("is-leaving");
      window.setTimeout(() => toast.remove(), 190);
    }, 4200);
  }

  function bindEvents() {
    elements["workspace-select"].addEventListener("change", async (event) => {
      state.currentWorkspaceId = event.target.value || null;
      state.filter = "all";
      state.selectedSignal = null;
      await loadWorkspaceData({ clearSelection: true });
    });

    elements["filter-group"].addEventListener("click", async (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button || button.dataset.filter === state.filter) return;
      state.filter = button.dataset.filter;
      await loadWorkspaceData();
    });

    elements["refresh-button"].addEventListener("click", async () => {
      setButtonBusy(elements["refresh-button"], true, "Refreshing…");
      if (state.currentWorkspaceId) {
        await loadWorkspaceData();
      } else {
        await loadWorkspaces();
      }
      setButtonBusy(elements["refresh-button"], false);
      showToast("Dashboard refreshed.", "info");
    });

    elements["export-button"].addEventListener("click", exportCSV);
    elements["workspace-form"].addEventListener("submit", createWorkspace);
    elements["signal-form"].addEventListener("submit", createSignal);

    document.addEventListener("click", (event) => {
      const actionTarget = event.target.closest("[data-action]");
      if (actionTarget) {
        const action = actionTarget.dataset.action;
        if (action === "open-workspace-modal") openModal(elements["workspace-modal"]);
        if (action === "open-signal-modal") {
          if (!state.currentWorkspaceId) {
            showToast("Create a workspace before adding a signal.", "error");
          } else {
            openModal(elements["signal-modal"]);
          }
        }
        if (action === "close-modal") closeModal(actionTarget.closest(".modal-backdrop"));
        if (action === "retry-workspaces") loadWorkspaces();
        if (action === "retry-data") loadWorkspaceData();
        if (action === "clear-selection") clearSelection();
        if (action === "run-triage") runTriage(actionTarget);
      }

      const signalTarget = event.target.closest("[data-feedback-id]");
      if (signalTarget) selectSignal(signalTarget.dataset.feedbackId);

      if (event.target.classList.contains("modal-backdrop")) closeModal(event.target);
    });

    document.addEventListener("submit", (event) => {
      if (event.target.id === "signal-edit-form") saveSignalRouting(event);
    });

    document.addEventListener("keydown", (event) => {
      if (activeModal && !activeModal.hidden) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeModal(activeModal);
          return;
        }
        trapModalFocus(event);
      }
    });
  }

  function init() {
    cacheElements();
    bindEvents();
    renderAll();
    loadWorkspaces();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
