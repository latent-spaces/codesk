// First-run agent connection, with a still mascot and an occasional blink.
// `?welcome` runs it again; `?notour` holds it back.

const BUSY = ['connecting', 'resetting', 'authenticating', 'configuring'];
const OPEN = ['ready', 'working', 'asleep'];
const REVEAL = 220;

export function shouldWelcome(state, tabs) {
  const params = new URLSearchParams(location.search);
  if (params.has('notour')) return false;
  if (params.has('welcome')) return true;
  return !state.lit && !tabs?.tabs?.some((tab) => tab.agent) && state.panels.some((panel) => panel.kind === 'chat');
}

const node = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};
const action = (text, run, cls) => {
  const b = node('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', run);
  return b;
};

export function showWelcome({ store, request, machine, onDone }) {
  const root = node('div', 'welcome');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'welcomeTitle');
  root.innerHTML = `
    <div class="welcome-mascot" aria-hidden="true"><span class="boot-tile"><i><b></b><b></b></i></span></div>
    <h1 class="welcome-title" id="welcomeTitle" tabindex="-1"></h1>
    <p class="welcome-text" role="status"></p>
    <p class="welcome-detail"></p>
    <div class="welcome-agents"></div>
    <div class="welcome-acts"></div>`;
  document.body.append(root);
  const title = root.querySelector('.welcome-title'), text = root.querySelector('.welcome-text');
  const detail = root.querySelector('.welcome-detail'), agents = root.querySelector('.welcome-agents');
  const acts = root.querySelector('.welcome-acts');
  let drawn = '';
  let fresh = false;       // a connect was just asked for; the server has not said so yet
  let picking = false;     // back at the agents, past an error
  let failure = '';        // the request itself failed
  let quick = null;        // the agent used last, tried straight away
  let chosen = null;       // the agent being connected; the chat still names the last one until it answers
  let ending = false, done = false;

  const payload = (extra = {}) => ({ tab: store.acp?.tabId ?? null, sessionId: store.acp?.sessionId ?? null, ...extra });
  const nameOf = (id) => store.acp?.agents?.find((a) => a.id === id)?.name || 'your agent';

  function connect(agent) {
    chosen = agent; fresh = true; picking = false; failure = '';
    sync();
    request('/api/agent/connect', payload({ agent }))
      .catch((error) => { failure = error.message; })
      .finally(() => { fresh = false; sync(); });
  }
  function cancel() {
    quick = null; fresh = false; picking = true; failure = '';
    request('/api/agent/cancel', payload()).catch(() => {}).finally(sync);
  }
  function signIn(methodId) {
    fresh = true;
    sync();
    request('/api/agent/authenticate', payload({ methodId }))
      .catch((error) => { failure = error.message; })
      .finally(() => { fresh = false; sync(); });
  }

  function drawAgents() {
    const list = store.acp?.agents || [];
    agents.replaceChildren(...list.map((agent) => {
      const b = action('', () => connect(agent.id), `welcome-agent agent-provider agent-provider-${agent.mark}`);
      if (agent.icon) {
        const img = node('img', 'agent-icon');
        img.src = agent.icon; img.alt = '';
        b.append(img); b.classList.add('has-icon');
      }
      const label = node('span', 'welcome-agent-label');
      label.append(node('b', '', agent.name));
      b.append(label);
      return b;
    }), (() => {
      const b = action('', leave, 'welcome-agent agent-provider agent-provider-more');
      const label = node('span', 'welcome-agent-label');
      label.append(node('b', '', 'Another agent'), node('small', 'plain', 'Any ACP agent works'));
      b.append(label);
      return b;
    })());
  }

  function show(stage, heading, words, { fine = '', buttons = () => [], sig = '' } = {}) {
    const next = JSON.stringify([stage, heading, fine, sig]);
    if (next === drawn) return;
    drawn = next;
    root.dataset.stage = stage;
    title.textContent = heading;
    text.replaceChildren(...[words].flat());
    detail.textContent = fine;
    detail.hidden = !fine;
    acts.replaceChildren(...buttons());
    if (stage === 'pick') drawAgents(); else agents.replaceChildren();
    (root.querySelector('.welcome-agent, .welcome-acts button') || title).focus({ preventScroll: true });
  }

  function connecting(status) {
    const name = nameOf(chosen || store.acp?.agent);
    const signing = status === 'authenticating';
    show('connecting', signing ? 'Finish signing in.' : `Connecting to ${name}…`,
      signing ? 'Complete sign-in in your browser, then return here.' : 'Your desk opens the moment it’s ready.', {
        buttons: () => [action(quick ? 'Use another agent' : 'Cancel', cancel, 'welcome-quiet')],
      });
  }

  function connectionError() {
    const acp = store.acp || {};
    const methods = acp.status === 'error' ? acp.authMethods || [] : [];
    const agent = chosen || acp.agent;
    const command = acp.agents?.find((a) => a.id === agent)?.signIn;
    const words = !acp.signIn ? 'Try again, or choose another agent.'
      : methods.length ? `${methods.length > 1 ? 'Choose how to sign in. ' : ''}Your browser will open.`
      : command ? ['Run ', node('code', '', command), ' in a terminal, then try again.']
      : `${nameOf(agent)} signs in its own way. Follow its instructions, then try again.`;
    show('error', acp.signIn ? `Sign in to ${nameOf(agent)}.` : `Couldn’t connect to ${nameOf(agent)}.`, words, {
      fine: failure || (acp.signIn ? '' : acp.error || ''),
      sig: methods.map((m) => m.id).join(),
      buttons: () => [
        ...methods.map((m) => action(`Sign in with ${m.name}`, () => signIn(m.id), 'welcome-primary')),
        action('Try again', () => connect(agent), methods.length ? 'welcome-quiet' : 'welcome-primary'),
        action('Choose another agent', () => { picking = true; failure = ''; sync(); }, 'welcome-quiet'),
      ],
    });
  }

  function sync() {
    if (ending || done) return;
    const acp = store.acp || {};
    if (OPEN.includes(acp.status) && acp.sessionId) return reveal();
    if (BUSY.includes(acp.status)) return connecting(acp.status);
    if (fresh) return connecting();
    if (!picking && (failure || (acp.agent && acp.error))) return connectionError();
    show('pick', 'Who’s joining your desk?', 'Pick an agent. Make this space yours.', {
      sig: JSON.stringify(acp.agents),
    });
  }

  // Open as soon as the connection is ready; there is no minimum display time.
  function reveal() {
    ending = true;
    open();
  }
  function open(then) {
    removeEventListener('keydown', onKey, true);
    root.classList.add('welcome-out');
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { done = true; root.remove(); onDone(); then?.(); }, calm ? 0 : REVEAL);
  }
  // Agents beyond the list are added in Chat, which knows how.
  function leave() {
    ending = true;
    open(() => document.querySelector('.win[data-id="chat"] .agent-add-more')?.click());
  }

  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); if (!ending) leave(); }
    else if (event.key === 'Tab') {
      const items = [...root.querySelectorAll('button')];
      if (!items.length) return event.preventDefault();
      const i = items.indexOf(document.activeElement);
      event.preventDefault();
      items[(i + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  }
  addEventListener('keydown', onKey, true);

  // A new project goes straight to the agent used last; another is one click away.
  const known = store.acp?.agents?.some((a) => a.id === machine?.agent);
  if (known && !store.acp?.agent) { quick = machine.agent; connect(quick); }
  else sync();
  return { sync };
}
