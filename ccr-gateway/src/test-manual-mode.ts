/**
 * test-manual-mode.ts
 * Verifies that manual mode respects forced route selection
 * even when context ceiling or sensitive keyword escalations would otherwise fire.
 */

const BASE = 'http://localhost:8080';

async function setManualRoute(routeId: string) {
  const res = await fetch(`${BASE}/admin/api/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activeRoute: routeId, activeMode: 'manual' }),
  });
  const body = await res.json() as { activeRoute?: string; activeMode?: string };
  console.log(`\n→ Active route set to: ${body.activeRoute} (mode: ${body.activeMode})`);
}

async function sendPrompt(label: string, promptText: string): Promise<string> {
  console.log(`\n--- ${label} ---`);
  const res = await fetch(`${BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'test-key-manual',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 30,
      messages: [{ role: 'user', content: promptText }],
    }),
  });
  const body = await res.json() as { model?: string };
  const routedModel = body.model ?? 'unknown';
  const passed = routedModel.includes('deepseek') || routedModel.includes('aws-hosted');
  console.log(`  Requested:  claude-3-5-sonnet-20241022`);
  console.log(`  Routed to:  ${routedModel}`);
  console.log(`  Result:     ${passed ? '✅ PASS — stayed on cheap route' : '❌ FAIL — escalated to Sonnet'}`);
  return routedModel;
}

(async () => {
  console.log('=== Manual Mode Escalation Guard Test ===\n');

  // Set manual mode → Balanced Code (AWS)
  await setManualRoute('aws-hosted/deepseek-coder-v2');

  // Test 1: Sensitive keyword that previously triggered escalation
  await sendPrompt(
    'Sensitive keywords (auth, credentials, secrets)',
    'Help me review this auth credentials rotation script for secrets management.'
  );

  // Test 2: Complexity keyword
  await sendPrompt(
    'Complexity keyword (architecture, migration)',
    'Explain the database migration architecture for refactor whole monolith.'
  );

  // Test 3: Large prompt (padded to exceed 120k chars)
  const padding = 'x'.repeat(130000);
  await sendPrompt(
    'Large context prompt (>120k chars) — previously always escalated',
    `Write a one-line comment. Context: ${padding}`
  );

  console.log('\n=== Test Complete ===');
})();
