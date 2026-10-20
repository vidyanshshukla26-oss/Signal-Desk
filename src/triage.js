'use strict';

/**
 * Deterministic, explainable triage rules for SignalDesk feedback.
 *
 * The rules intentionally live in data structures instead of opaque model
 * calls. A triage result can therefore be reproduced from the same feedback
 * text and its rationale can be shown to a user.
 */

const CATEGORY_RULES = [
  {
    category: 'bug',
    ownerRole: 'Engineering',
    weight: 5,
    keywords: [
      'bug', 'broken', 'crash', 'crashes', 'error', 'errors', 'exception',
      'fail', 'failed', 'failure', 'incorrect', 'regression', 'defect',
      'not working', 'does not work', "doesn't work", 'cannot', "can't",
    ],
  },
  {
    category: 'feature_request',
    ownerRole: 'Product',
    weight: 4,
    keywords: [
      'feature', 'request', 'would like', 'please add', 'add support',
      'support for', 'ability to', 'wish', 'roadmap', 'enhancement',
      'could you add', 'it would be useful',
    ],
  },
  {
    category: 'billing',
    ownerRole: 'Billing',
    weight: 6,
    keywords: [
      'billing', 'bill', 'invoice', 'charged', 'charge', 'payment', 'refund',
      'subscription', 'price', 'pricing', 'plan', 'credit card', 'tax',
    ],
  },
  {
    category: 'account',
    ownerRole: 'Customer Success',
    weight: 6,
    keywords: [
      'login', 'log in', 'sign in', 'password', 'account', 'access',
      'permission', 'invite', 'invitation', 'authentication', 'sso', 'locked out',
    ],
  },
  {
    category: 'performance',
    ownerRole: 'Engineering',
    weight: 6,
    keywords: [
      'slow', 'slowness', 'latency', 'timeout', 'times out', 'lag', 'laggy',
      'performance', 'load time', 'loading forever', 'takes too long',
    ],
  },
  {
    category: 'security',
    ownerRole: 'Security',
    weight: 6,
    keywords: [
      'security', 'vulnerability', 'vulnerable', 'breach', 'exposed',
      'permission leak', 'data leak', 'phishing', 'unauthorized',
    ],
  },
  {
    category: 'usability',
    ownerRole: 'Product Design',
    weight: 3,
    keywords: [
      'confusing', 'hard to use', 'difficult to use', 'unclear', 'usability',
      'interface', 'ui', 'ux', 'workflow', 'friction', 'hard to find',
    ],
  },
  {
    category: 'praise',
    ownerRole: 'Customer Success',
    weight: 2,
    keywords: [
      'love', 'loving', 'great', 'excellent', 'amazing', 'thank you',
      'thanks', 'helpful', 'works well', 'impressed',
    ],
  },
];

const TOPIC_RULES = [
  ['authentication', ['login', 'log in', 'sign in', 'password', 'sso', 'authentication', 'mfa', 'two-factor']],
  ['billing', ['billing', 'invoice', 'charged', 'charge', 'payment', 'refund', 'subscription', 'pricing', 'price']],
  ['performance', ['slow', 'latency', 'timeout', 'times out', 'lag', 'performance', 'load time', 'loading']],
  ['integrations', ['integration', 'integrate', 'slack', 'salesforce', 'webhook', 'api', 'zapier']],
  ['reporting', ['report', 'reporting', 'analytics', 'metric', 'metrics', 'dashboard', 'chart']],
  ['notifications', ['notification', 'notifications', 'alert', 'alerts', 'email', 'reminder']],
  ['onboarding', ['onboarding', 'setup', 'getting started', 'trial', 'first time']],
  ['permissions', ['permission', 'permissions', 'role', 'roles', 'access', 'invite', 'invitation']],
  ['search', ['search', 'filter', 'filters', 'find']],
  ['mobile', ['mobile', 'ios', 'android', 'phone', 'tablet']],
  ['export', ['export', 'csv', 'download', 'spreadsheet']],
  ['data', ['data', 'import', 'record', 'records', 'duplicate', 'missing']],
  ['workflow', ['workflow', 'process', 'automation', 'automate', 'approval']],
];

const POSITIVE_WORDS = [
  'love', 'loving', 'great', 'excellent', 'amazing', 'helpful', 'thank',
  'thanks', 'easy', 'smooth', 'happy', 'impressed', 'perfect', 'works well',
];

const NEGATIVE_WORDS = [
  'bad', 'broken', 'bug', 'confusing', 'crash', 'crashes', 'error', 'errors',
  'fail', 'failed', 'failure', 'frustrated', 'frustrating', 'slow', 'stuck',
  'urgent', 'unusable', 'wrong', 'cannot', "can't", 'unable', 'missing',
  'lost', 'disappointed', 'problem', 'issue',
];

const URGENCY_RULES = [
  ['urgent language', ['urgent', 'asap', 'immediately', 'emergency', 'critical', 'severe'], 18],
  ['blocking language', ['blocked', 'blocking', 'cannot work', "can't work", 'unusable', 'down'], 15],
  ['broad impact', ['everyone', 'all customers', 'every customer', 'production', 'outage', 'revenue', 'data loss'], 14],
  ['security impact', ['security', 'vulnerability', 'breach', 'exposed', 'unauthorized'], 18],
];

const CATEGORY_ORDER = CATEGORY_RULES.map((rule) => rule.category);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsKeyword(text, keyword) {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return false;
  if (normalizedKeyword.includes(' ')) return text.includes(normalizedKeyword);
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}([^a-z0-9]|$)`, 'i').test(text);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchedKeywords(text, keywords) {
  return keywords.filter((keyword) => containsKeyword(text, keyword));
}

function scoreCategories(text) {
  return CATEGORY_RULES.map((rule) => {
    const matches = matchedKeywords(text, rule.keywords);
    return {
      ...rule,
      matches,
      score: matches.length * rule.weight,
    };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  });
}

function scoreTopics(text) {
  return TOPIC_RULES.map(([topic, keywords]) => {
    const matches = matchedKeywords(text, keywords);
    return { topic, matches, score: matches.length };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic));
}

function scoreSentiment(text) {
  const positiveMatches = matchedKeywords(text, POSITIVE_WORDS);
  const negativeMatches = matchedKeywords(text, NEGATIVE_WORDS);
  const score = positiveMatches.length - negativeMatches.length;
  let sentiment = 'neutral';
  if (score > 0) sentiment = 'positive';
  if (score < 0) sentiment = 'negative';
  return { sentiment, score, positiveMatches, negativeMatches };
}

function scoreUrgency(text) {
  const matches = [];
  let score = 0;
  for (const [label, keywords, weight] of URGENCY_RULES) {
    const keywordMatches = matchedKeywords(text, keywords);
    if (keywordMatches.length) {
      matches.push({ label, keywords: keywordMatches });
      score += weight + Math.max(0, keywordMatches.length - 1) * 3;
    }
  }
  return { score: Math.min(score, 60), matches };
}

function severityForScore(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function suggestedActionFor(category, severity, sentiment) {
  if (category === 'security') return 'Route to Security for immediate impact assessment and containment.';
  if (severity === 'critical') return 'Escalate immediately, confirm customer impact, and assign an incident owner.';
  if (category === 'bug' || category === 'performance') {
    return severity === 'high'
      ? 'Reproduce the issue, assess scope, and schedule an engineering fix.'
      : 'Reproduce the issue and add the fix to the engineering backlog.';
  }
  if (category === 'billing') return 'Have Billing verify the account, charge, and any required correction.';
  if (category === 'account') return 'Have Customer Success verify access and guide the customer through a resolution.';
  if (category === 'feature_request') return 'Capture the use case, validate demand, and assess it for the product roadmap.';
  if (category === 'usability') return 'Review the workflow with Product Design and identify the smallest usability improvement.';
  if (category === 'praise' || sentiment === 'positive') return 'Share the positive signal with the owning team and look for repeatable strengths.';
  return 'Review the feedback, clarify the customer impact, and choose an owning team.';
}

function confidenceFor(categoryScore, runnerUpScore, text) {
  if (!text) return 0.5;
  if (categoryScore === 0) return 0.55;
  const margin = categoryScore - runnerUpScore;
  const confidence = 0.62 + Math.min(categoryScore, 20) * 0.012 + Math.min(Math.max(margin, 0), 10) * 0.018;
  return Number(Math.min(0.98, confidence).toFixed(2));
}

/**
 * @param {{title?: string, body?: string, source?: string, customer?: string}} feedback
 * @returns {object} a deterministic triage result
 */
function triageFeedback(feedback = {}) {
  const title = normalizeText(feedback.title);
  const body = normalizeText(feedback.body);
  const source = normalizeText(feedback.source);
  const customer = normalizeText(feedback.customer);
  const text = [title, body, source, customer].filter(Boolean).join(' ');

  const categoryScores = scoreCategories(text);
  const selectedCategory = categoryScores[0];
  const runnerUp = categoryScores[1];
  const topicScores = scoreTopics(text);
  const sentiment = scoreSentiment(text);
  const urgency = scoreUrgency(text);

  const categoryBase = selectedCategory.score > 0
    ? Math.min(selectedCategory.score * 5, 30)
    : 8;
  const negativeImpact = sentiment.sentiment === 'negative' ? 8 : 0;
  const positiveOffset = sentiment.sentiment === 'positive' ? -5 : 0;
  const topicImpact = Math.min(topicScores.length * 2, 8);
  const priorityScore = Math.max(
    0,
    Math.min(100, Math.round(18 + categoryBase + urgency.score + negativeImpact + positiveOffset + topicImpact)),
  );
  const severity = severityForScore(priorityScore);
  const topicNames = topicScores.slice(0, 3).map((item) => item.topic);
  const categoryMatches = selectedCategory.matches.slice(0, 3);
  const rationaleParts = [
    categoryMatches.length
      ? `Category ${selectedCategory.category} matched ${categoryMatches.join(', ')}`
      : 'No category keyword matched, so the feedback uses the general queue',
  ];
  if (topicNames.length) rationaleParts.push(`topics: ${topicNames.join(', ')}`);
  if (sentiment.sentiment !== 'neutral') rationaleParts.push(`${sentiment.sentiment} sentiment`);
  if (urgency.matches.length) rationaleParts.push(`urgency signals: ${urgency.matches.map((item) => item.label).join(', ')}`);
  const rationale = `${rationaleParts.join('; ')}.`;
  const suggestedAction = suggestedActionFor(selectedCategory.category, severity, sentiment.sentiment);

  return {
    category: selectedCategory.category,
    topics: topicNames,
    sentiment: sentiment.sentiment,
    priority: severity,
    priorityScore,
    severity,
    severityScore: priorityScore,
    rationale,
    explanation: rationale,
    suggestedAction,
    nextAction: suggestedAction,
    ownerRole: selectedCategory.ownerRole,
    confidence: confidenceFor(selectedCategory.score, runnerUp.score, text),
    rules: {
      categoryMatches: categoryMatches.slice(),
      topicMatches: topicScores.slice(0, 3).map((item) => ({ topic: item.topic, keywords: item.matches.slice() })),
      sentimentMatches: {
        positive: sentiment.positiveMatches.slice(),
        negative: sentiment.negativeMatches.slice(),
      },
      urgencySignals: urgency.matches.map((item) => ({ label: item.label, keywords: item.keywords.slice() })),
    },
  };
}

module.exports = {
  CATEGORY_RULES,
  TOPIC_RULES,
  triageFeedback,
  normalizeText,
};
