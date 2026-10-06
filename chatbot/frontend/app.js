// Miracle RAG chatbot frontend — HTTP fetch client with model switching + metrics.
//
// API_URL is injected by scripts/deploy-frontend.sh before upload. For local testing,
// replace the placeholder with your API Gateway invoke URL.
const API_URL = '__API_URL__';

const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model');
const metricsPanel = document.getElementById('metrics');

const el = (id) => document.getElementById(id);

function appendMessage(role, text = '') {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  messages.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function setLoading(loading) {
  sendBtn.disabled = loading;
  input.disabled = loading;
  modelSelect.disabled = loading;
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function renderMetrics(data) {
  el('m-model').textContent = data.modelLabel || data.modelId || '—';
  el('m-region').textContent = data.region || '—';
  el('m-in').textContent = data.usage?.inputTokens ?? '—';
  el('m-out').textContent = data.usage?.outputTokens ?? '—';
  el('m-total').textContent = data.usage?.totalTokens ?? '—';
  el('m-cost').textContent =
    typeof data.estimatedCostUsd === 'number' ? `$${data.estimatedCostUsd.toFixed(6)}` : '—';
  el('m-latency').textContent = data.latencyMs ?? '—';
  el('m-tps').textContent = data.tokensPerSecond ?? '—';
  el('m-chunks').textContent = data.retrievedChunks ?? (data.retrieval?.length ?? '—');
  const scores = (data.retrieval || [])
    .map((r) => (typeof r.score === 'number' ? r.score.toFixed(2) : '?'))
    .join(', ');
  el('m-scores').textContent = scores || '—';
  metricsPanel.hidden = false;
}

async function ask(question) {
  const modelId = modelSelect.value;
  const bubble = appendMessage('assistant');
  bubble.classList.add('typing');

  try {
    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: question, modelId }),
    });

    const data = await res.json();
    bubble.classList.remove('typing');

    if (!res.ok) {
      bubble.querySelector('.bubble').textContent =
        'Error: ' + (data.error || `HTTP ${res.status}`);
      return;
    }

    bubble.querySelector('.bubble').textContent = data.answer || '(no answer)';

    // Citation chips.
    const uris = [...new Set((data.retrieval || []).map((r) => r.uri).filter(Boolean))];
    if (uris.length) {
      const cite = document.createElement('div');
      cite.className = 'citations';
      cite.innerHTML =
        'Sources: ' + uris.map((u) => `<span>${fileName(u)}</span>`).join('');
      bubble.appendChild(cite);
    }

    renderMetrics(data);
  } catch (err) {
    bubble.classList.remove('typing');
    bubble.querySelector('.bubble').textContent = 'Network error: ' + err.message;
  }
}

function fileName(uri) {
  return uri ? uri.split('/').pop() : 'source';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  appendMessage('user', text);
  input.value = '';
  setLoading(true);
  await ask(text);
  setLoading(false);
  input.focus();
});
