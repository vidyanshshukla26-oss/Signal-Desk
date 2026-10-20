'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { triageFeedback } = require('../src/triage');

test('triage is deterministic and explains a high-impact performance bug', () => {
  const feedback = {
    title: 'Dashboard is slow',
    body: 'This is urgent: every customer is blocked by production timeouts.',
    source: 'support',
    customer: 'Northstar',
  };
  const first = triageFeedback(feedback);
  const second = triageFeedback(feedback);

  assert.deepEqual(first, second);
  assert.equal(first.category, 'performance');
  assert.equal(first.sentiment, 'negative');
  assert.ok(first.priorityScore >= 60);
  assert.equal(first.priorityScore, first.severityScore);
  assert.ok(first.rationale.includes('performance'));
  assert.ok(first.rules.urgencySignals.length > 0);
  assert.equal(first.ownerRole, 'Engineering');
  assert.match(first.suggestedAction, /escalate|impact/i);
});

test('triage applies transparent rules to feature requests and sentiment', () => {
  const result = triageFeedback({
    title: 'Please add a CSV export',
    body: 'We love the reporting dashboard and would like an easier download for our metrics.',
    source: 'in_app',
    customer: 'Acme',
  });

  assert.equal(result.category, 'feature_request');
  assert.equal(result.sentiment, 'positive');
  assert.ok(result.topics.includes('export'));
  assert.equal(result.ownerRole, 'Product');
  assert.ok(result.confidence >= 0.5 && result.confidence <= 1);
  assert.ok(result.rules.categoryMatches.includes('please add'));
});
