import { request } from 'undici';

async function testHealth() {
  try {
    console.log('Testing /health endpoint...');
    const response = await request('http://localhost:8080/health');
    console.log('Status Code:', response.statusCode);
    const body = await response.body.json();
    console.log('Response Body:', body);
  } catch (error: any) {
    console.error('Health check test failed:', error.message);
  }
}

async function testMissingKey() {
  try {
    console.log('\nTesting /v1/messages endpoint with missing API key...');
    const response = await request('http://localhost:8080/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      }),
    });
    console.log('Status Code:', response.statusCode);
    const body = await response.body.json();
    console.log('Response Body:', body);
  } catch (error: any) {
    console.error('Messages endpoint test failed:', error.message);
  }
}

async function testBlockedPath() {
  try {
    console.log('\nTesting /v1/messages endpoint with blocked .env path in tool call...');
    const response = await request('http://localhost:8080/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer mock-token'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'view_file',
              input: { path: '/home/project/.env' }
            }
          ]
        }],
        max_tokens: 100,
      }),
    });
    console.log('Status Code:', response.statusCode);
    const body = await response.body.json();
    console.log('Response Body:', body);
  } catch (error: any) {
    console.error('Blocked path test failed:', error.message);
  }
}

async function testWarnPattern() {
  try {
    console.log('\nTesting /v1/messages endpoint with warning API key pattern...');
    const response = await request('http://localhost:8080/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer mock-token'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{
          role: 'user',
          content: 'My secret key is sk-ant-api03-abcdefghijklmnopabcdefghijklmnopabcdefghijklmnopabcdefghijklmnopabcdefghijklmnop1234'
        }],
        max_tokens: 100,
      }),
    });
    // This should trigger a warning in the server logs, but proceed to forward (and return a 401/400 because mock-token is invalid)
    console.log('Status Code:', response.statusCode);
  } catch (error: any) {
    console.error('Warn pattern test failed:', error.message);
  }
}

async function runTests() {
  await testHealth();
  await testMissingKey();
  await testBlockedPath();
  await testWarnPattern();
}

runTests();
