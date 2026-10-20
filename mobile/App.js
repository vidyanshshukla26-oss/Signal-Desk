import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

const API_BASE_URL = String(
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000',
).trim().replace(/\/+$/, '').replace(/\/api$/i, '');

const COLORS = {
  ink: '#142b3b',
  inkSoft: '#58707c',
  muted: '#8aa0a8',
  border: '#dce7e5',
  paper: '#f4f8f5',
  white: '#ffffff',
  navy: '#14384a',
  navySoft: '#1d4a5e',
  lime: '#c7ef79',
  limeSoft: '#eef8d9',
  violet: '#7768c9',
  violetSoft: '#f1eeff',
  coral: '#e97867',
  coralSoft: '#fff0ec',
  teal: '#4ba89f',
  tealSoft: '#e4f5f1',
  gold: '#c79538',
  goldSoft: '#fff6df',
  shadow: '#173b4b',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All signals' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'shipped', label: 'Shipped' },
];

const STATUS_LABELS = Object.fromEntries(
  STATUS_OPTIONS.filter((option) => option.value !== 'all').map((option) => [option.value, option.label]),
);

function apiPath(path) {
  return `${API_BASE_URL}${path}`;
}

async function requestJson(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(apiPath(path), { ...options, headers });
  } catch (error) {
    const networkError = new Error(
      `Could not reach the SignalDesk API at ${API_BASE_URL}. Check the API server and EXPO_PUBLIC_API_BASE_URL.`,
    );
    networkError.cause = error;
    throw networkError;
  }

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `SignalDesk returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function requestCsv(path) {
  let response;
  try {
    response = await fetch(apiPath(path), { headers: { Accept: 'text/csv' } });
  } catch (error) {
    const networkError = new Error(
      `Could not reach the SignalDesk API at ${API_BASE_URL}. Check the API server and EXPO_PUBLIC_API_BASE_URL.`,
    );
    networkError.cause = error;
    throw networkError;
  }

  if (!response.ok) {
    throw new Error(`SignalDesk could not export this workspace (HTTP ${response.status}).`);
  }

  return response.text();
}

function getErrorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

function statusLabel(value) {
  return STATUS_LABELS[value] || 'Inbox';
}

function formatDate(value) {
  if (!value) return 'No due date';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function shortDate(value) {
  if (!value) return 'No due date';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function initials(value) {
  const words = String(value || 'SD').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'SD';
}

function priorityStyle(priority) {
  if (priority === 'critical') return { color: '#a73f4b', backgroundColor: '#ffe3e7' };
  if (priority === 'high') return { color: '#b45540', backgroundColor: COLORS.coralSoft };
  if (priority === 'medium') return { color: '#8c6b25', backgroundColor: COLORS.goldSoft };
  return { color: '#52746c', backgroundColor: COLORS.tealSoft };
}

function statusStyle(status) {
  if (status === 'planned') return { color: '#6253ad', backgroundColor: COLORS.violetSoft };
  if (status === 'in_progress') return { color: '#377f79', backgroundColor: COLORS.tealSoft };
  if (status === 'shipped') return { color: '#5b7e27', backgroundColor: COLORS.limeSoft };
  return { color: '#b25849', backgroundColor: COLORS.coralSoft };
}

function BrandMark() {
  return (
    <View style={styles.brandMark} accessibilityElementsHidden>
      <View style={[styles.brandBar, { height: 9, opacity: 0.55 }]} />
      <View style={[styles.brandBar, { height: 15 }]} />
      <View style={[styles.brandBar, { height: 21, opacity: 0.75 }]} />
    </View>
  );
}

function Pill({ children, style, textStyle, accessibilityLabel }) {
  return (
    <View style={[styles.pill, style]} accessibilityLabel={accessibilityLabel}>
      <Text style={[styles.pillText, textStyle]}>{children}</Text>
    </View>
  );
}

function PrimaryButton({ children, onPress, disabled, style, accessibilityLabel, accessibilityHint }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || String(children)}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        style,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

function SecondaryButton({ children, onPress, disabled, style, accessibilityLabel, accessibilityHint }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || String(children)}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        style,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

function ErrorCard({ message, onRetry, title = 'We hit a snag' }) {
  return (
    <View style={styles.errorCard} accessibilityRole="alert">
      <View style={styles.errorIcon}>
        <Text style={styles.errorIconText}>!</Text>
      </View>
      <View style={styles.errorCopy}>
        <Text style={styles.errorTitle}>{title}</Text>
        <Text style={styles.errorMessage}>{message}</Text>
        {onRetry ? (
          <SecondaryButton onPress={onRetry} style={styles.inlineButton} accessibilityLabel="Retry request">
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </SecondaryButton>
        ) : null}
      </View>
    </View>
  );
}

function EmptyCard({ title, message, actionLabel, onAction, icon = '○' }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>{icon}</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <PrimaryButton onPress={onAction} style={styles.emptyAction} accessibilityLabel={actionLabel}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </PrimaryButton>
      ) : null}
    </View>
  );
}

function ModalShell({ visible, title, eyebrow, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalKeyboard}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalTopline}>
              <View style={styles.modalHeadingWrap}>
                <Text style={styles.modalEyebrow}>{eyebrow}</Text>
                <Text style={styles.modalTitle}>{title}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                onPress={onClose}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function MetricCard({ label, value, note, tone = 'navy' }) {
  return (
    <View style={[styles.metricCard, styles[`metricCard_${tone}`]]}>
      <View style={styles.metricTopline}>
        <Text style={styles.metricLabel}>{label}</Text>
        <View style={[styles.metricDot, styles[`metricDot_${tone}`]]} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricNote}>{note}</Text>
    </View>
  );
}

function WorkspaceStrip({ workspaces, activeId, loading, onSelect, onCreate }) {
  return (
    <View style={styles.workspaceSection}>
      <View style={styles.sectionTopline}>
        <View>
          <Text style={styles.sectionKicker}>Workspace</Text>
          <Text style={styles.sectionHint}>Choose the queue you want to work in.</Text>
        </View>
        <SecondaryButton
          onPress={onCreate}
          style={styles.createButton}
          accessibilityLabel="Create a workspace"
          accessibilityHint="Opens a form for a new SignalDesk workspace"
        >
          <Text style={styles.createButtonPlus}>＋</Text>
          <Text style={styles.secondaryButtonText}>New workspace</Text>
        </SecondaryButton>
      </View>
      {loading && !workspaces.length ? (
        <View style={styles.workspaceLoading}>
          <ActivityIndicator size="small" color={COLORS.violet} />
          <Text style={styles.workspaceLoadingText}>Loading workspaces…</Text>
        </View>
      ) : workspaces.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.workspaceScroll}
          accessibilityLabel="Available workspaces"
        >
          {workspaces.map((workspace) => {
            const active = workspace.id === activeId;
            return (
              <Pressable
                key={workspace.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Switch to workspace ${workspace.name}`}
                onPress={() => onSelect(workspace.id)}
                style={({ pressed }) => [
                  styles.workspacePill,
                  active ? styles.workspacePillActive : null,
                  pressed ? styles.workspacePillPressed : null,
                ]}
              >
                <View style={[styles.workspaceAvatar, active ? styles.workspaceAvatarActive : null]}>
                  <Text style={[styles.workspaceAvatarText, active ? styles.workspaceAvatarTextActive : null]}>
                    {initials(workspace.name)}
                  </Text>
                </View>
                <View style={styles.workspacePillCopy}>
                  <Text numberOfLines={1} style={[styles.workspaceName, active ? styles.workspaceNameActive : null]}>
                    {workspace.name}
                  </Text>
                  <Text style={[styles.workspaceCount, active ? styles.workspaceCountActive : null]}>
                    {workspace.feedbackCount || 0} signals
                  </Text>
                </View>
                {active ? <View style={styles.workspaceSelectedDot} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.noWorkspaceHint}>Create your first workspace to start routing customer feedback.</Text>
      )}
    </View>
  );
}

function SignalRow({ item, selected, onPress }) {
  const triage = item.triage || {};
  const routeStyle = statusStyle(item.status);
  const priority = triage.priority;
  const priorityBadge = priority ? priorityStyle(priority) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Open signal ${item.title}`}
      accessibilityHint="Shows the signal detail and routing controls"
      onPress={onPress}
      style={({ pressed }) => [
        styles.signalRow,
        selected ? styles.signalRowSelected : null,
        pressed ? styles.signalRowPressed : null,
      ]}
    >
      <View style={styles.signalRowMain}>
        <View style={styles.signalRowTopline}>
          <Pill style={routeStyle} textStyle={{ color: routeStyle.color }} accessibilityLabel={`Status ${statusLabel(item.status)}`}>
            {statusLabel(item.status)}
          </Pill>
          {priority ? (
            <Pill style={priorityBadge} textStyle={{ color: priorityBadge.color }} accessibilityLabel={`Priority ${priority}`}>
              {priority}
            </Pill>
          ) : null}
        </View>
        <Text style={styles.signalTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.signalExcerpt} numberOfLines={2}>{item.body}</Text>
        <View style={styles.signalMeta}>
          <Text style={styles.signalMetaStrong}>{item.source || 'unknown source'}</Text>
          <Text style={styles.signalMetaDivider}>•</Text>
          <Text style={styles.signalMetaText} numberOfLines={1}>{item.customer || 'Unknown customer'}</Text>
          {item.dueDate ? (
            <>
              <Text style={styles.signalMetaDivider}>•</Text>
              <Text style={styles.signalMetaText}>Due {shortDate(item.dueDate)}</Text>
            </>
          ) : null}
        </View>
      </View>
      <Text style={[styles.signalArrow, selected ? styles.signalArrowSelected : null]}>›</Text>
    </Pressable>
  );
}

function TriagePanel({ signal, triaging, onTriage }) {
  const triage = signal.triage;
  const priorityBadge = triage ? priorityStyle(triage.priority) : null;
  return (
    <View style={styles.triagePanel}>
      <View style={styles.triageHeader}>
        <View style={styles.triageTitleWrap}>
          <Text style={styles.triageEyebrow}>Explainable decision</Text>
          <Text style={styles.triageTitle}>Deterministic triage</Text>
        </View>
        <View style={styles.triageSpark}>
          <Text style={styles.triageSparkText}>✦</Text>
        </View>
      </View>
      {triage ? (
        <>
          <View style={styles.triageChipRow}>
            <Pill style={priorityBadge} textStyle={{ color: priorityBadge.color }}>{triage.priority || 'low'} priority</Pill>
            <Pill style={styles.categoryPill} textStyle={styles.categoryPillText}>{triage.category || 'general'}</Pill>
            <Pill style={styles.scorePill} textStyle={styles.scorePillText}>{triage.priorityScore ?? 0}/100</Pill>
          </View>
          <View style={styles.triageTopics}>
            <Text style={styles.triageLabel}>Topics</Text>
            {triage.topics?.length ? triage.topics.map((topic) => (
              <View key={topic} style={styles.topicChip}>
                <Text style={styles.topicChipText}>{topic}</Text>
              </View>
            )) : <Text style={styles.noTopics}>No topic keywords matched</Text>}
          </View>
          <View style={styles.triagePoint}>
            <View style={styles.triagePointIcon}><Text style={styles.triagePointIconText}>i</Text></View>
            <View style={styles.triagePointCopy}>
              <Text style={styles.triagePointLabel}>Why this route</Text>
              <Text style={styles.triagePointText}>{triage.rationale || triage.explanation || 'No rationale was returned.'}</Text>
            </View>
          </View>
          <View style={styles.triagePoint}>
            <View style={[styles.triagePointIcon, styles.triagePointIconAction]}><Text style={styles.triagePointIconText}>→</Text></View>
            <View style={styles.triagePointCopy}>
              <Text style={styles.triagePointLabel}>Suggested next action</Text>
              <Text style={styles.triagePointText}>{triage.suggestedAction || triage.nextAction || 'Review the feedback and choose an owner.'}</Text>
            </View>
          </View>
          <View style={styles.triageFooter}>
            <Text style={styles.confidenceText}>
              {Math.round(Number(triage.confidence || 0) * 100)}% confidence · suggested owner {triage.ownerRole || 'team'}
            </Text>
            <Text style={styles.rulesText}>Rules-based</Text>
          </View>
        </>
      ) : (
        <Text style={styles.triageEmpty}>Run triage to classify this signal, surface matching topics, and get an explainable routing suggestion.</Text>
      )}
      <PrimaryButton
        onPress={onTriage}
        disabled={triaging}
        style={styles.triageButton}
        accessibilityLabel={triage ? 'Re-run deterministic triage' : 'Run deterministic triage'}
        accessibilityHint="Applies SignalDesk keyword rules and updates the signal explanation"
      >
        {triaging ? <ActivityIndicator color={COLORS.ink} size="small" /> : <Text style={styles.primaryButtonText}>{triage ? 'Re-run triage' : 'Run triage'}</Text>}
      </PrimaryButton>
    </View>
  );
}

function SignalDetail({ signal, triaging, savingRouting, onClose, onTriage, onSaveRouting }) {
  const [status, setStatus] = useState(signal.status || 'inbox');
  const [owner, setOwner] = useState(signal.owner || '');
  const [dueDate, setDueDate] = useState(signal.dueDate || '');

  useEffect(() => {
    setStatus(signal.status || 'inbox');
    setOwner(signal.owner || '');
    setDueDate(signal.dueDate || '');
  }, [signal.id, signal.status, signal.owner, signal.dueDate]);

  const triage = signal.triage || {};

  return (
    <View style={styles.detailCard}>
      <View style={styles.detailTopline}>
        <View style={styles.detailKickerWrap}>
          <Text style={styles.sectionKicker}>Signal detail</Text>
          <Text style={styles.detailMeta}>{signal.customer || 'Unknown customer'} · {signal.source || 'unknown source'}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close signal detail"
          onPress={onClose}
          style={styles.detailClose}
        >
          <Text style={styles.detailCloseText}>×</Text>
        </Pressable>
      </View>
      <Text style={styles.detailTitle}>{signal.title}</Text>
      <View style={styles.detailBodyCard}>
        <Text style={styles.detailBody}>{signal.body}</Text>
      </View>
      <View style={styles.detailFacts}>
        <View style={styles.detailFact}>
          <Text style={styles.detailFactLabel}>Created</Text>
          <Text style={styles.detailFactValue}>{formatDate(signal.createdAt)}</Text>
        </View>
        <View style={styles.detailFact}>
          <Text style={styles.detailFactLabel}>Owner</Text>
          <Text style={styles.detailFactValue}>{signal.owner || triage.ownerRole || 'Unassigned'}</Text>
        </View>
        <View style={styles.detailFact}>
          <Text style={styles.detailFactLabel}>Due date</Text>
          <Text style={styles.detailFactValue}>{signal.dueDate ? formatDate(signal.dueDate) : 'Not set'}</Text>
        </View>
        <View style={styles.detailFact}>
          <Text style={styles.detailFactLabel}>Last updated</Text>
          <Text style={styles.detailFactValue}>{formatDate(signal.updatedAt)}</Text>
        </View>
      </View>
      <TriagePanel signal={signal} triaging={triaging} onTriage={onTriage} />
      <View style={styles.routingPanel}>
        <View style={styles.routingHeader}>
          <View>
            <Text style={styles.routingTitle}>Route the next move</Text>
            <Text style={styles.routingSubtitle}>Keep status, owner, and timing visible.</Text>
          </View>
          {triage.ownerRole ? <Pill style={styles.suggestedOwnerPill} textStyle={styles.suggestedOwnerText}>Suggested: {triage.ownerRole}</Pill> : null}
        </View>
        <Text style={styles.inputLabel}>Status</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeStatusScroll}>
          {STATUS_OPTIONS.filter((option) => option.value !== 'all').map((option) => {
            const active = status === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Set status to ${option.label}`}
                onPress={() => setStatus(option.value)}
                style={({ pressed }) => [
                  styles.routeStatusButton,
                  active ? styles.routeStatusButtonActive : null,
                  pressed ? styles.routeStatusButtonPressed : null,
                ]}
              >
                <Text style={[styles.routeStatusText, active ? styles.routeStatusTextActive : null]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.routingFields}>
          <View style={styles.routingField}>
            <Text style={styles.inputLabel}>Owner</Text>
            <TextInput
              accessibilityLabel="Signal owner"
              autoCapitalize="words"
              onChangeText={setOwner}
              placeholder="e.g. Engineering"
              placeholderTextColor={COLORS.muted}
              style={styles.textInput}
              value={owner}
            />
          </View>
          <View style={styles.routingField}>
            <Text style={styles.inputLabel}>Due date</Text>
            <TextInput
              accessibilityLabel="Signal due date"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.muted}
              style={styles.textInput}
              value={dueDate}
            />
          </View>
        </View>
        <PrimaryButton
          onPress={() => onSaveRouting({ status, owner: owner.trim() || null, dueDate: dueDate.trim() || null })}
          disabled={savingRouting}
          style={styles.saveRouteButton}
          accessibilityLabel="Save signal routing"
          accessibilityHint="Updates the signal status, owner, and due date"
        >
          {savingRouting ? <ActivityIndicator color={COLORS.ink} size="small" /> : <Text style={styles.primaryButtonText}>Save routing</Text>}
        </PrimaryButton>
      </View>
    </View>
  );
}

function App() {
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [signals, setSignals] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedSignalId, setSelectedSignalId] = useState(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [signalDraft, setSignalDraft] = useState({ title: '', body: '', source: '', customer: '' });
  const [formError, setFormError] = useState(null);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [savingSignal, setSavingSignal] = useState(false);
  const [triagingId, setTriagingId] = useState(null);
  const [savingRoutingId, setSavingRoutingId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null,
    [activeWorkspaceId, workspaces],
  );
  const selectedSignal = useMemo(
    () => signals.find((signal) => signal.id === selectedSignalId) || null,
    [selectedSignalId, signals],
  );

  const showToast = useCallback((message, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const loadWorkspaces = useCallback(async () => {
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const list = await requestJson('/api/workspaces');
      setWorkspaces(Array.isArray(list) ? list : []);
      setActiveWorkspaceId((current) => {
        if (current && list.some((workspace) => workspace.id === current)) return current;
        return list[0]?.id || null;
      });
      if (!list.length) {
        setSummary(null);
        setSignals([]);
        setSelectedSignalId(null);
      }
    } catch (error) {
      setWorkspaceError(getErrorMessage(error));
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  const loadWorkspaceData = useCallback(async (workspaceId = activeWorkspaceId, requestedFilter = filter) => {
    if (!workspaceId) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const [nextSummary, nextSignals] = await Promise.all([
        requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/summary`),
        requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/feedback?status=${encodeURIComponent(requestedFilter)}`),
      ]);
      setSummary(nextSummary);
      setSignals(Array.isArray(nextSignals) ? nextSignals : []);
      setSelectedSignalId((current) => {
        if (current && nextSignals.some((signal) => signal.id === current)) return current;
        return nextSignals[0]?.id || null;
      });
    } catch (error) {
      setDataError(getErrorMessage(error));
    } finally {
      setDataLoading(false);
    }
  }, [activeWorkspaceId, filter]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (activeWorkspaceId) loadWorkspaceData(activeWorkspaceId, filter);
  }, [activeWorkspaceId, filter, loadWorkspaceData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await requestJson('/api/workspaces');
      setWorkspaces(Array.isArray(list) ? list : []);
      const workspaceId = activeWorkspaceId && list.some((workspace) => workspace.id === activeWorkspaceId)
        ? activeWorkspaceId
        : list[0]?.id || null;
      setActiveWorkspaceId(workspaceId);
      if (workspaceId) await loadWorkspaceData(workspaceId, filter);
      else {
        setSummary(null);
        setSignals([]);
        setSelectedSignalId(null);
      }
      showToast('Dashboard refreshed.', 'info');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setRefreshing(false);
    }
  }, [activeWorkspaceId, filter, loadWorkspaceData, showToast]);

  const handleSelectWorkspace = useCallback((workspaceId) => {
    setFilter('all');
    setSelectedSignalId(null);
    setDataError(null);
    setActiveWorkspaceId(workspaceId);
  }, []);

  const handleCreateWorkspace = useCallback(async () => {
    const name = workspaceName.trim();
    if (!name) {
      setFormError('Give the workspace a name before saving.');
      return;
    }
    setSavingWorkspace(true);
    setFormError(null);
    try {
      const created = await requestJson('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setWorkspaces((current) => [...current, { ...created, feedbackCount: 0 }]);
      setActiveWorkspaceId(created.id);
      setFilter('all');
      setSelectedSignalId(null);
      setModal(null);
      setWorkspaceName('');
      showToast(`${created.name} is ready.`, 'success');
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSavingWorkspace(false);
    }
  }, [showToast, workspaceName]);

  const handleCreateSignal = useCallback(async () => {
    if (!activeWorkspaceId) {
      setFormError('Create or select a workspace first.');
      return;
    }
    const payload = Object.fromEntries(
      Object.entries(signalDraft).map(([key, value]) => [key, value.trim()]),
    );
    if (!payload.title || !payload.body || !payload.source || !payload.customer) {
      setFormError('Title, feedback, source, and customer are all required.');
      return;
    }
    setSavingSignal(true);
    setFormError(null);
    try {
      const created = await requestJson(`/api/workspaces/${encodeURIComponent(activeWorkspaceId)}/feedback`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setModal(null);
      setSignalDraft({ title: '', body: '', source: '', customer: '' });
      setFilter('all');
      setSelectedSignalId(created.id);
      await loadWorkspaceData(activeWorkspaceId, 'all');
      setWorkspaces((current) => current.map((workspace) => (
        workspace.id === activeWorkspaceId
          ? { ...workspace, feedbackCount: (workspace.feedbackCount || 0) + 1 }
          : workspace
      )));
      showToast('Signal captured and triaged.', 'success');
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSavingSignal(false);
    }
  }, [activeWorkspaceId, loadWorkspaceData, showToast, signalDraft]);

  const handleTriage = useCallback(async (signal) => {
    setTriagingId(signal.id);
    try {
      const updated = await requestJson(
        `/api/workspaces/${encodeURIComponent(activeWorkspaceId)}/feedback/${encodeURIComponent(signal.id)}/triage`,
        { method: 'POST' },
      );
      setSignals((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      showToast('Triage refreshed with the same deterministic rules.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setTriagingId(null);
    }
  }, [activeWorkspaceId, showToast]);

  const handleSaveRouting = useCallback(async (signal, patch) => {
    setSavingRoutingId(signal.id);
    try {
      const updated = await requestJson(
        `/api/workspaces/${encodeURIComponent(activeWorkspaceId)}/feedback/${encodeURIComponent(signal.id)}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
      );
      setSignals((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await loadWorkspaceData(activeWorkspaceId, filter);
      showToast('Routing saved.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setSavingRoutingId(null);
    }
  }, [activeWorkspaceId, filter, loadWorkspaceData, showToast]);

  const handleExport = useCallback(async () => {
    if (!activeWorkspaceId || !activeWorkspace) return;
    setExporting(true);
    try {
      const csv = await requestCsv(`/api/workspaces/${encodeURIComponent(activeWorkspaceId)}/export.csv`);
      await Share.share({
        title: `${activeWorkspace.name} CSV`,
        message: csv,
      });
      showToast('CSV is ready to share.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setExporting(false);
    }
  }, [activeWorkspace, activeWorkspaceId, showToast]);

  const openWorkspaceModal = useCallback(() => {
    setFormError(null);
    setWorkspaceName('');
    setModal('workspace');
  }, []);

  const openSignalModal = useCallback(() => {
    if (!activeWorkspaceId) {
      showToast('Create a workspace before adding a signal.', 'error');
      return;
    }
    setFormError(null);
    setSignalDraft({ title: '', body: '', source: '', customer: '' });
    setModal('signal');
  }, [activeWorkspaceId, showToast]);

  const closeModal = useCallback(() => {
    if (savingWorkspace || savingSignal) return;
    setModal(null);
    setFormError(null);
  }, [savingSignal, savingWorkspace]);

  const counts = summary?.counts || {};
  const filterLabel = STATUS_OPTIONS.find((option) => option.value === filter)?.label || 'All signals';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        <ScrollView
          contentContainerStyle={styles.page}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.violet} colors={[COLORS.violet]} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.brandLockup}>
              <BrandMark />
              <View>
                <Text style={styles.brandName}>SignalDesk</Text>
                <Text style={styles.brandTagline}>FEEDBACK COMMAND CENTER</Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <View style={styles.apiStatus}>
                <View style={styles.apiStatusDot} />
                 <Text style={styles.apiStatusText}>API target</Text>
              </View>
              <SecondaryButton
                onPress={handleRefresh}
                disabled={refreshing}
                style={styles.headerButton}
                accessibilityLabel="Refresh dashboard"
              >
                <Text style={styles.headerButtonIcon}>↻</Text>
                <Text style={styles.secondaryButtonText}>Refresh</Text>
              </SecondaryButton>
              <PrimaryButton
                onPress={handleExport}
                disabled={!activeWorkspaceId || exporting}
                style={styles.headerExportButton}
                accessibilityLabel="Share workspace CSV"
                accessibilityHint="Downloads the workspace CSV and opens the native share sheet"
              >
                {exporting ? <ActivityIndicator color={COLORS.ink} size="small" /> : <Text style={styles.exportIcon}>⇧</Text>}
                <Text style={styles.primaryButtonText}>Share CSV</Text>
              </PrimaryButton>
            </View>
          </View>

          {workspaceError ? <ErrorCard message={workspaceError} onRetry={loadWorkspaces} title="Workspaces unavailable" /> : null}

          <WorkspaceStrip
            activeId={activeWorkspaceId}
            loading={workspaceLoading}
            onCreate={openWorkspaceModal}
            onSelect={handleSelectWorkspace}
            workspaces={workspaces}
          />

          {!workspaceLoading && !workspaces.length ? (
            <EmptyCard
              title="Start with a workspace"
              message="Workspaces keep signals, routing decisions, and exports together for a team or product area."
              actionLabel="Create workspace"
              onAction={openWorkspaceModal}
              icon="＋"
            />
          ) : activeWorkspace ? (
            <>
              <View style={styles.hero}>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroEyebrow}><Text style={styles.heroEyebrowDot}>●</Text> Workspace pulse</Text>
                  <Text style={styles.heroTitle}>{activeWorkspace.name}</Text>
                  <Text style={styles.heroSubtitle}>Turn customer voice into a clear, owned next move.</Text>
                </View>
                <View style={styles.heroLiveBadge}>
                  <Text style={styles.heroLiveBadgeText}>LOCAL-FIRST</Text>
                  <Text style={styles.heroLiveBadgeSubtext}>{API_BASE_URL.replace(/^https?:\/\//, '')}</Text>
                </View>
              </View>

              {dataError ? <ErrorCard message={dataError} onRetry={() => loadWorkspaceData(activeWorkspaceId, filter)} title="Workspace data unavailable" /> : null}

              <View style={styles.metricsGrid}>
                <MetricCard label="Total signals" value={counts.all ?? summary?.total ?? 0} note="Across this workspace" tone="primary" />
                <MetricCard label="Inbox" value={counts.inbox ?? 0} note="Waiting for a route" tone="coral" />
                <MetricCard label="In progress" value={counts.in_progress ?? 0} note="Actively owned" tone="teal" />
                <MetricCard label="Shipped" value={counts.shipped ?? 0} note="Closed loop" tone="violet" />
              </View>

              <View style={styles.pipelineCard}>
                <View style={styles.pipelineHeader}>
                  <View style={styles.pipelineHeadingWrap}>
                    <Text style={styles.sectionKicker}>Signal pipeline</Text>
                    <Text style={styles.pipelineTitle}>{filterLabel}</Text>
                  </View>
                  <View style={styles.pipelineHeaderActions}>
                    <View style={styles.pipelineCount}>
                      <Text style={styles.pipelineCountValue}>{signals.length}</Text>
                      <Text style={styles.pipelineCountLabel}>shown</Text>
                    </View>
                    <PrimaryButton
                      onPress={openSignalModal}
                      style={styles.addSignalButton}
                      accessibilityLabel="Add a signal"
                      accessibilityHint="Opens a form to capture customer feedback"
                    >
                      <Text style={styles.addSignalIcon}>＋</Text>
                      <Text style={styles.primaryButtonText}>Add signal</Text>
                    </PrimaryButton>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                  {STATUS_OPTIONS.map((option) => {
                    const active = filter === option.value;
                    const count = option.value === 'all' ? counts.all : counts[option.value];
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Filter signals by ${option.label}`}
                        onPress={() => setFilter(option.value)}
                        style={({ pressed }) => [
                          styles.filterChip,
                          active ? styles.filterChipActive : null,
                          pressed ? styles.filterChipPressed : null,
                        ]}
                      >
                        <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>{option.label}</Text>
                        {count !== undefined ? <Text style={[styles.filterChipCount, active ? styles.filterChipCountActive : null]}>{count}</Text> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View style={styles.listDivider} />
                {dataLoading && !signals.length ? (
                  <View style={styles.loadingState}>
                    <ActivityIndicator color={COLORS.violet} size="large" />
                    <Text style={styles.loadingTitle}>Loading your signal queue…</Text>
                    <Text style={styles.loadingMessage}>Pulling the latest summary and routing context.</Text>
                  </View>
                ) : signals.length ? (
                  <View style={styles.signalList}>
                    {signals.map((signal) => (
                      <SignalRow
                        key={signal.id}
                        item={signal}
                        onPress={() => setSelectedSignalId(signal.id)}
                        selected={selectedSignalId === signal.id}
                      />
                    ))}
                  </View>
                ) : (
                  <EmptyCard
                    title={filter === 'all' ? 'No signals yet' : `No ${filterLabel.toLowerCase()} signals`}
                    message={filter === 'all' ? 'Capture the first customer voice in this workspace.' : 'Try another status filter or move a signal into this stage.'}
                    actionLabel="Add signal"
                    onAction={openSignalModal}
                    icon="◌"
                  />
                )}
              </View>

              {selectedSignal ? (
                <SignalDetail
                  key={selectedSignal.id}
                  savingRouting={savingRoutingId === selectedSignal.id}
                  signal={selectedSignal}
                  triaging={triagingId === selectedSignal.id}
                  onClose={() => setSelectedSignalId(null)}
                  onSaveRouting={(patch) => handleSaveRouting(selectedSignal, patch)}
                  onTriage={() => handleTriage(selectedSignal)}
                />
              ) : (
                <View style={styles.detailEmpty}>
                  <View style={styles.detailEmptyIcon}><Text style={styles.detailEmptyIconText}>↗</Text></View>
                  <Text style={styles.sectionKicker}>Signal detail</Text>
                  <Text style={styles.detailEmptyTitle}>Choose a signal to inspect</Text>
                  <Text style={styles.detailEmptyMessage}>Open any row to see its explainable triage, evidence, and routing controls.</Text>
                </View>
              )}
            </>
          ) : workspaceLoading ? (
            <View style={styles.initialLoading}>
              <ActivityIndicator color={COLORS.violet} size="large" />
              <Text style={styles.loadingTitle}>Preparing SignalDesk…</Text>
            </View>
          ) : null}

          <View style={styles.footerNote}>
            <Text style={styles.footerNoteText}>SignalDesk uses deterministic, explainable rules. A teammate always owns the decision.</Text>
          </View>
        </ScrollView>

        {toast ? (
          <View pointerEvents="none" style={styles.toastRegion} accessibilityLiveRegion="polite">
            <View style={[styles.toast, toast.type === 'error' ? styles.toastError : toast.type === 'info' ? styles.toastInfo : styles.toastSuccess]}>
              <View style={styles.toastIcon}><Text style={styles.toastIconText}>{toast.type === 'error' ? '!' : toast.type === 'info' ? 'i' : '✓'}</Text></View>
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
          </View>
        ) : null}

        <ModalShell
          eyebrow="Workspace setup"
          onClose={closeModal}
          title="Create a workspace"
          visible={modal === 'workspace'}
        >
          <Text style={styles.modalIntro}>Keep a product area, customer segment, or team queue focused in one place.</Text>
          <Text style={styles.inputLabel}>Workspace name</Text>
          <TextInput
            accessibilityLabel="Workspace name"
            autoCapitalize="words"
            autoFocus
            onChangeText={setWorkspaceName}
            onSubmitEditing={handleCreateWorkspace}
            placeholder="e.g. Core product"
            placeholderTextColor={COLORS.muted}
            style={styles.modalInput}
            value={workspaceName}
          />
          {formError && modal === 'workspace' ? <Text style={styles.formError}>{formError}</Text> : null}
          <View style={styles.modalActions}>
            <SecondaryButton onPress={closeModal} disabled={savingWorkspace} style={styles.modalActionButton}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </SecondaryButton>
            <PrimaryButton onPress={handleCreateWorkspace} disabled={savingWorkspace} style={styles.modalActionButton}>
              {savingWorkspace ? <ActivityIndicator color={COLORS.ink} size="small" /> : <Text style={styles.primaryButtonText}>Create workspace</Text>}
            </PrimaryButton>
          </View>
        </ModalShell>

        <ModalShell
          eyebrow="Capture customer voice"
          onClose={closeModal}
          title="Add a signal"
          visible={modal === 'signal'}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalIntro}>Save the raw context first. SignalDesk immediately adds a deterministic triage suggestion.</Text>
            <Text style={styles.inputLabel}>Signal title</Text>
            <TextInput
              accessibilityLabel="Signal title"
              autoCapitalize="sentences"
              onChangeText={(title) => setSignalDraft((current) => ({ ...current, title }))}
              placeholder="What did the customer tell you?"
              placeholderTextColor={COLORS.muted}
              style={styles.modalInput}
              value={signalDraft.title}
            />
            <Text style={styles.inputLabel}>Customer feedback</Text>
            <TextInput
              accessibilityLabel="Customer feedback"
              autoCapitalize="sentences"
              multiline
              onChangeText={(body) => setSignalDraft((current) => ({ ...current, body }))}
              placeholder="Paste the original note, quote, or request…"
              placeholderTextColor={COLORS.muted}
              style={[styles.modalInput, styles.modalTextarea]}
              textAlignVertical="top"
              value={signalDraft.body}
            />
            <View style={styles.modalFieldRow}>
              <View style={styles.modalFieldHalf}>
                <Text style={styles.inputLabel}>Source</Text>
                <TextInput
                  accessibilityLabel="Signal source"
                  autoCapitalize="none"
                  onChangeText={(source) => setSignalDraft((current) => ({ ...current, source }))}
                  placeholder="email, support…"
                  placeholderTextColor={COLORS.muted}
                  style={styles.modalInput}
                  value={signalDraft.source}
                />
              </View>
              <View style={styles.modalFieldHalf}>
                <Text style={styles.inputLabel}>Customer</Text>
                <TextInput
                  accessibilityLabel="Customer name"
                  autoCapitalize="words"
                  onChangeText={(customer) => setSignalDraft((current) => ({ ...current, customer }))}
                  placeholder="Account or company"
                  placeholderTextColor={COLORS.muted}
                  style={styles.modalInput}
                  value={signalDraft.customer}
                />
              </View>
            </View>
            {formError && modal === 'signal' ? <Text style={styles.formError}>{formError}</Text> : null}
            <View style={styles.modalActions}>
              <SecondaryButton onPress={closeModal} disabled={savingSignal} style={styles.modalActionButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </SecondaryButton>
              <PrimaryButton onPress={handleCreateSignal} disabled={savingSignal} style={styles.modalActionButton}>
                {savingSignal ? <ActivityIndicator color={COLORS.ink} size="small" /> : <Text style={styles.primaryButtonText}>Add signal</Text>}
              </PrimaryButton>
            </View>
          </ScrollView>
        </ModalShell>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  appShell: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  page: {
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 42,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 16,
    borderBottomColor: '#d9e5e2',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brandLockup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  brandMark: {
    alignItems: 'flex-end',
    backgroundColor: COLORS.lime,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 3,
    height: 34,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingBottom: 6,
    paddingHorizontal: 6,
    transform: [{ rotate: '-8deg' }],
    width: 34,
  },
  brandBar: {
    backgroundColor: COLORS.navy,
    borderRadius: 3,
    width: 4,
  },
  brandName: {
    color: COLORS.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandTagline: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginLeft: 'auto',
  },
  apiStatus: {
    alignItems: 'center',
    backgroundColor: COLORS.tealSoft,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  apiStatusDot: {
    backgroundColor: COLORS.teal,
    borderRadius: 5,
    height: 7,
    width: 7,
  },
  apiStatusText: {
    color: '#347c75',
    fontSize: 9,
    fontWeight: '800',
  },
  headerButton: {
    minHeight: 36,
    paddingHorizontal: 9,
  },
  headerButtonIcon: {
    color: COLORS.inkSoft,
    fontSize: 17,
    fontWeight: '700',
  },
  headerExportButton: {
    minHeight: 36,
    paddingHorizontal: 11,
  },
  exportIcon: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: COLORS.lime,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 15,
  },
  primaryButtonText: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 13,
  },
  secondaryButtonText: {
    color: COLORS.inkSoft,
    fontSize: 11,
    fontWeight: '750',
  },
  buttonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  workspaceSection: {
    paddingTop: 22,
  },
  sectionTopline: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionKicker: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '850',
    letterSpacing: 1.25,
    textTransform: 'uppercase',
  },
  sectionHint: {
    color: COLORS.inkSoft,
    fontSize: 11,
    marginTop: 4,
  },
  createButton: {
    minHeight: 34,
    paddingHorizontal: 10,
  },
  createButtonPlus: {
    color: COLORS.violet,
    fontSize: 16,
    fontWeight: '400',
  },
  workspaceScroll: {
    gap: 9,
    paddingBottom: 4,
    paddingTop: 13,
  },
  workspacePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minWidth: 164,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  workspacePillActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 11,
    elevation: 3,
  },
  workspacePillPressed: {
    opacity: 0.82,
  },
  workspaceAvatar: {
    alignItems: 'center',
    backgroundColor: COLORS.limeSoft,
    borderRadius: 10,
    height: 31,
    justifyContent: 'center',
    width: 31,
  },
  workspaceAvatarActive: {
    backgroundColor: COLORS.lime,
  },
  workspaceAvatarText: {
    color: '#5c8330',
    fontSize: 10,
    fontWeight: '850',
  },
  workspaceAvatarTextActive: {
    color: COLORS.ink,
  },
  workspacePillCopy: {
    flex: 1,
    minWidth: 0,
  },
  workspaceName: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '800',
  },
  workspaceNameActive: {
    color: COLORS.white,
  },
  workspaceCount: {
    color: COLORS.muted,
    fontSize: 9,
    marginTop: 2,
  },
  workspaceCountActive: {
    color: '#adc4c8',
  },
  workspaceSelectedDot: {
    backgroundColor: COLORS.lime,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  workspaceLoading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 18,
  },
  workspaceLoadingText: {
    color: COLORS.inkSoft,
    fontSize: 11,
  },
  noWorkspaceHint: {
    color: COLORS.muted,
    fontSize: 11,
    paddingVertical: 16,
  },
  hero: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingBottom: 23,
    paddingTop: 34,
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    color: COLORS.teal,
    fontSize: 10,
    fontWeight: '850',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroEyebrowDot: {
    color: COLORS.coral,
    fontSize: 9,
  },
  heroTitle: {
    color: COLORS.ink,
    fontSize: 31,
    fontWeight: '850',
    letterSpacing: -1.2,
    marginTop: 8,
  },
  heroSubtitle: {
    color: COLORS.inkSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    maxWidth: 460,
  },
  heroLiveBadge: {
    alignItems: 'flex-end',
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  heroLiveBadgeText: {
    color: COLORS.violet,
    fontSize: 8,
    fontWeight: '850',
    letterSpacing: 1,
  },
  heroLiveBadgeSubtext: {
    color: COLORS.muted,
    fontSize: 8,
    marginTop: 4,
    maxWidth: 145,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  metricCard: {
    borderColor: COLORS.border,
    borderRadius: 15,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 111,
    padding: 14,
  },
  metricCard_primary: {
    backgroundColor: COLORS.limeSoft,
    borderColor: '#d7e8ab',
  },
  metricCard_coral: {
    backgroundColor: COLORS.coralSoft,
    borderColor: '#f4d2c9',
  },
  metricCard_teal: {
    backgroundColor: COLORS.tealSoft,
    borderColor: '#c9e6df',
  },
  metricCard_violet: {
    backgroundColor: COLORS.violetSoft,
    borderColor: '#ded8f9',
  },
  metricTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    color: COLORS.inkSoft,
    fontSize: 10,
    fontWeight: '750',
  },
  metricDot: {
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  metricDot_primary: { backgroundColor: '#89b745' },
  metricDot_coral: { backgroundColor: COLORS.coral },
  metricDot_teal: { backgroundColor: COLORS.teal },
  metricDot_violet: { backgroundColor: COLORS.violet },
  metricValue: {
    color: COLORS.ink,
    fontSize: 29,
    fontWeight: '850',
    letterSpacing: -1,
    marginTop: 12,
  },
  metricNote: {
    color: COLORS.muted,
    fontSize: 9,
    marginTop: 5,
  },
  pipelineCard: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: COLORS.border,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.055,
    shadowRadius: 20,
    elevation: 1,
  },
  pipelineHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pipelineHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  pipelineHeadingWrap: {
    flex: 1,
  },
  pipelineTitle: {
    color: COLORS.ink,
    fontSize: 22,
    fontWeight: '850',
    letterSpacing: -0.6,
    marginTop: 6,
  },
  pipelineCount: {
    alignItems: 'flex-end',
  },
  pipelineCountValue: {
    color: COLORS.violet,
    fontSize: 24,
    fontWeight: '850',
    lineHeight: 25,
  },
  pipelineCountLabel: {
    color: COLORS.muted,
    fontSize: 9,
    marginTop: 2,
  },
  addSignalButton: {
    minHeight: 35,
    paddingHorizontal: 10,
  },
  addSignalIcon: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '500',
  },
  filterScroll: {
    gap: 6,
    paddingBottom: 3,
    paddingTop: 15,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    borderColor: 'transparent',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  filterChipActive: {
    backgroundColor: COLORS.violetSoft,
    borderColor: '#dcd5fb',
    borderWidth: 1,
  },
  filterChipPressed: {
    opacity: 0.72,
  },
  filterChipText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '750',
  },
  filterChipTextActive: {
    color: COLORS.violet,
  },
  filterChipCount: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '800',
  },
  filterChipCountActive: {
    color: COLORS.violet,
  },
  listDivider: {
    backgroundColor: '#edf2ef',
    height: 1,
    marginBottom: 11,
    marginTop: 12,
  },
  signalList: {
    gap: 8,
  },
  signalRow: {
    alignItems: 'center',
    backgroundColor: '#fbfdfb',
    borderColor: 'transparent',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  signalRowSelected: {
    backgroundColor: '#faf8ff',
    borderColor: '#d7d0f9',
    shadowColor: COLORS.violet,
    shadowOffset: { width: 3, height: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 3,
    elevation: 1,
  },
  signalRowPressed: {
    opacity: 0.78,
  },
  signalRowMain: {
    flex: 1,
    minWidth: 0,
  },
  signalRowTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 7,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 8,
    fontWeight: '850',
    letterSpacing: 0.25,
    textTransform: 'uppercase',
  },
  signalTitle: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  signalExcerpt: {
    color: COLORS.inkSoft,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 6,
  },
  signalMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
  },
  signalMetaStrong: {
    color: COLORS.teal,
    fontSize: 9,
    fontWeight: '800',
  },
  signalMetaDivider: {
    color: '#c7d4d3',
    fontSize: 9,
  },
  signalMetaText: {
    color: COLORS.muted,
    fontSize: 9,
    maxWidth: 175,
  },
  signalArrow: {
    color: '#c5d2d0',
    fontSize: 25,
    fontWeight: '300',
    paddingHorizontal: 2,
  },
  signalArrowSelected: {
    color: COLORS.violet,
  },
  loadingState: {
    alignItems: 'center',
    minHeight: 180,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingTitle: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 13,
  },
  loadingMessage: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 5,
    textAlign: 'center',
  },
  initialLoading: {
    alignItems: 'center',
    paddingVertical: 55,
  },
  emptyCard: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 205,
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.limeSoft,
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    marginBottom: 12,
    width: 42,
  },
  emptyIconText: {
    color: '#759d3c',
    fontSize: 20,
    fontWeight: '400',
  },
  emptyTitle: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyMessage: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
    maxWidth: 330,
    textAlign: 'center',
  },
  emptyAction: {
    minHeight: 37,
    marginTop: 15,
  },
  errorCard: {
    alignItems: 'flex-start',
    backgroundColor: '#fff8f6',
    borderColor: '#f1cdc4',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
    padding: 12,
  },
  errorIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.coralSoft,
    borderRadius: 8,
    height: 25,
    justifyContent: 'center',
    width: 25,
  },
  errorIconText: {
    color: '#b44f40',
    fontSize: 13,
    fontWeight: '850',
  },
  errorCopy: {
    flex: 1,
  },
  errorTitle: {
    color: '#8f4539',
    fontSize: 12,
    fontWeight: '800',
  },
  errorMessage: {
    color: '#a66e66',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    minHeight: 32,
    marginTop: 9,
    paddingHorizontal: 10,
  },
  detailCard: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 18,
    padding: 17,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.055,
    shadowRadius: 20,
    elevation: 1,
  },
  detailTopline: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailKickerWrap: {
    flex: 1,
  },
  detailMeta: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 5,
  },
  detailClose: {
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  detailCloseText: {
    color: COLORS.inkSoft,
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 24,
  },
  detailTitle: {
    color: COLORS.ink,
    fontSize: 23,
    fontWeight: '850',
    letterSpacing: -0.7,
    lineHeight: 28,
    marginTop: 15,
  },
  detailBodyCard: {
    backgroundColor: '#f8fbf9',
    borderLeftColor: COLORS.lime,
    borderLeftWidth: 3,
    borderRadius: 9,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  detailBody: {
    color: COLORS.inkSoft,
    fontSize: 12,
    lineHeight: 19,
  },
  detailFacts: {
    borderBottomColor: '#edf2ef',
    borderBottomWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 13,
    paddingBottom: 17,
    paddingTop: 17,
  },
  detailFact: {
    flexBasis: '44%',
    flexGrow: 1,
    minWidth: 110,
  },
  detailFactLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.75,
    textTransform: 'uppercase',
  },
  detailFactValue: {
    color: COLORS.inkSoft,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  triagePanel: {
    backgroundColor: '#faf9ff',
    borderColor: '#ded9f5',
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 17,
    padding: 14,
  },
  triageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  triageTitleWrap: {
    flex: 1,
  },
  triageEyebrow: {
    color: '#897dc0',
    fontSize: 8,
    fontWeight: '850',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  triageTitle: {
    color: '#50438f',
    fontSize: 15,
    fontWeight: '850',
    marginTop: 4,
  },
  triageSpark: {
    alignItems: 'center',
    backgroundColor: '#e8e2ff',
    borderRadius: 10,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  triageSparkText: {
    color: COLORS.violet,
    fontSize: 16,
  },
  triageChipRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 13,
  },
  categoryPill: {
    backgroundColor: '#ebe8ff',
  },
  categoryPillText: {
    color: '#6659af',
  },
  scorePill: {
    backgroundColor: COLORS.white,
    borderColor: '#e1dcf6',
    borderWidth: 1,
  },
  scorePillText: {
    color: '#8074b4',
  },
  triageTopics: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 12,
  },
  triageLabel: {
    color: '#8378ae',
    fontSize: 9,
    fontWeight: '800',
    marginRight: 2,
  },
  topicChip: {
    backgroundColor: '#eae5ff',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  topicChipText: {
    color: '#6a5cae',
    fontSize: 8,
    fontWeight: '750',
  },
  noTopics: {
    color: '#a39ac8',
    fontSize: 9,
  },
  triagePoint: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
  },
  triagePointIcon: {
    alignItems: 'center',
    backgroundColor: '#e7e1ff',
    borderRadius: 7,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  triagePointIconAction: {
    backgroundColor: '#e3f3ed',
  },
  triagePointIconText: {
    color: COLORS.violet,
    fontSize: 12,
    fontWeight: '850',
  },
  triagePointCopy: {
    flex: 1,
  },
  triagePointLabel: {
    color: '#62558f',
    fontSize: 10,
    fontWeight: '850',
  },
  triagePointText: {
    color: '#746c99',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  triageFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 14,
  },
  confidenceText: {
    color: '#897fc0',
    flex: 1,
    fontSize: 9,
    lineHeight: 13,
  },
  rulesText: {
    color: '#7668b6',
    fontSize: 8,
    fontWeight: '850',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  triageEmpty: {
    color: '#746c99',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 13,
  },
  triageButton: {
    marginTop: 14,
    minHeight: 38,
  },
  routingPanel: {
    borderTopColor: '#edf2ef',
    borderTopWidth: 1,
    marginTop: 19,
    paddingTop: 18,
  },
  routingHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  routingTitle: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '850',
  },
  routingSubtitle: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 4,
  },
  suggestedOwnerPill: {
    backgroundColor: COLORS.limeSoft,
    flexShrink: 1,
  },
  suggestedOwnerText: {
    color: '#648831',
    fontSize: 8,
    textTransform: 'none',
  },
  inputLabel: {
    color: COLORS.inkSoft,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 6,
    marginTop: 15,
  },
  routeStatusScroll: {
    gap: 6,
  },
  routeStatusButton: {
    backgroundColor: COLORS.paper,
    borderColor: COLORS.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  routeStatusButtonActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  routeStatusButtonPressed: {
    opacity: 0.75,
  },
  routeStatusText: {
    color: COLORS.inkSoft,
    fontSize: 9,
    fontWeight: '800',
  },
  routeStatusTextActive: {
    color: COLORS.white,
  },
  routingFields: {
    flexDirection: 'row',
    gap: 10,
  },
  routingField: {
    flex: 1,
  },
  textInput: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
    borderRadius: 9,
    borderWidth: 1,
    color: COLORS.ink,
    fontSize: 11,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  saveRouteButton: {
    marginTop: 15,
  },
  detailEmpty: {
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 18,
    minHeight: 230,
    padding: 21,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 1,
  },
  detailEmptyIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.violetSoft,
    borderRadius: 13,
    height: 45,
    justifyContent: 'center',
    marginBottom: 21,
    width: 45,
  },
  detailEmptyIconText: {
    color: COLORS.violet,
    fontSize: 23,
  },
  detailEmptyTitle: {
    color: COLORS.ink,
    fontSize: 20,
    fontWeight: '850',
    letterSpacing: -0.5,
    marginTop: 7,
  },
  detailEmptyMessage: {
    color: COLORS.inkSoft,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
    maxWidth: 380,
  },
  footerNote: {
    alignItems: 'center',
    paddingTop: 28,
  },
  footerNoteText: {
    color: COLORS.muted,
    fontSize: 9,
    lineHeight: 14,
    maxWidth: 400,
    textAlign: 'center',
  },
  modalBackdrop: {
    backgroundColor: 'rgba(13, 37, 49, 0.56)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalKeyboard: {
    width: '100%',
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    maxHeight: '93%',
    paddingHorizontal: 19,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: -7 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 10,
  },
  modalTopline: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalHeadingWrap: {
    flex: 1,
  },
  modalEyebrow: {
    color: COLORS.violet,
    fontSize: 9,
    fontWeight: '850',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modalTitle: {
    color: COLORS.ink,
    fontSize: 25,
    fontWeight: '850',
    letterSpacing: -0.7,
    marginTop: 6,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    borderRadius: 9,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  closeButtonText: {
    color: COLORS.inkSoft,
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 25,
  },
  modalIntro: {
    color: COLORS.inkSoft,
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 19,
    marginTop: 9,
  },
  modalInput: {
    backgroundColor: '#fbfdfb',
    borderColor: COLORS.border,
    borderRadius: 10,
    borderWidth: 1,
    color: COLORS.ink,
    fontSize: 12,
    minHeight: 43,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  modalTextarea: {
    minHeight: 115,
  },
  modalFieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalFieldHalf: {
    flex: 1,
  },
  formError: {
    color: '#ad5144',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 9,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'flex-end',
    marginTop: 21,
  },
  modalActionButton: {
    flex: 1,
  },
  toastRegion: {
    bottom: 16,
    left: 18,
    position: 'absolute',
    right: 18,
  },
  toast: {
    alignItems: 'center',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  toastSuccess: {
    backgroundColor: COLORS.navy,
  },
  toastInfo: {
    backgroundColor: '#4f477f',
  },
  toastError: {
    backgroundColor: '#8f4539',
  },
  toastIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderRadius: 7,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  toastIconText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '850',
  },
  toastText: {
    color: COLORS.white,
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
});

export default App;
