const ACTION_MAP = {
  Overview: 'occupancy_summary',
  Occupancy: 'occupancy_summary',
  'Crowd Flow': 'crowd_movement',
  Trends: 'explore_trends',
  'Hall Performance': 'hall_performance',
};

const ANALYSIS_LABELS = {
  occupancy_summary: 'Overview',
  crowd_movement: 'Crowd Flow',
  explore_trends: 'Trends',
  hall_performance: 'Hall Performance',
  time_comparison: 'Trends',

  sus_overview: 'Overview',
  sus_energy: 'Energy',
  sus_comfort: 'Comfort',
  sus_event_overview: 'By Event Overview',
  sus_event_impact: 'By Event Overview',
  sus_efficiency_carbon: 'Efficiency & Carbon',
  sus_time_comparison: 'Comparison',
  exh_overview: 'Overview',
  exh_traffic_context: 'Traffic Context',
  exh_engagement: 'Engagement',
  exh_operating_environment: 'Operating Environment',
  exh_performance: 'Performance',
  exh_comparison: 'Comparison',
};

const ROLE_META = {
  OPERATIONS: {
    assistantName: 'Senti Operations',
    eyebrow: 'Operations assistant',
    pageTitle: 'Operations Assistant Widget Demo',
    pageHint: 'This page demonstrates the role-based Senti operations assistant in light mode.',
    accent: '#E8486F',
    accentSoft: 'rgba(232,72,111,0.12)',
  },
  SUSTAINABILITY: {
    assistantName: 'Senti Sustainability',
    eyebrow: 'Sustainability assistant',
    pageTitle: 'Sustainability Assistant Widget Demo',
    pageHint: 'This page demonstrates the role-based Senti sustainability assistant in light mode.',
    accent: '#00802B',
    accentSoft: 'rgba(0,128,43,0.12)',
  },
  EXHIBITOR: {
    assistantName: 'Senti Exhibitor',
    eyebrow: 'Exhibitor assistant',
    pageTitle: 'Exhibitor Assistant Widget Demo',
    pageHint: 'This page demonstrates the role-based Senti exhibitor assistant in light mode.',
    accent: '#35005C',
    accentSoft: 'rgba(53,0,92,0.12)',
  },
};

const params = new URLSearchParams(window.location.search);
const EMBEDDED = params.get('embed') === '1';

const state = {
  role: (params.get('role') || 'EXHIBITOR').toUpperCase(),
  isOpen: false,
  isExpanded: false,
  userId: params.get('user_id') || 'EXH0215',
  userName: params.get('user_name') || 'Exhibitor',
  sessionId: `sess_${Date.now()}`,
  bootstrap: null,
  flowConfig: null,
  assignment: null,
  savedViews: [],
  activeTabId: 'draft',
  tabs: [{ id: 'draft', name: 'Current analysis', type: 'draft' }],
  analysisByTab: {},
  openMultiKey: null,
  saveIntent: 'idle',
  validationMessage: '',
};

const el = {
  launcher: document.getElementById('launcher'),
  shell: document.getElementById('widgetShell'),
  conversation: document.getElementById('conversation'),
  savedViewsPanel: document.getElementById('savedViewsPanel'),
  savedViewsList: document.getElementById('savedViewsList'),
  expandBtn: document.getElementById('expandBtn'),
  closeBtn: document.getElementById('closeBtn'),
  tabBar: document.getElementById('tabBar'),
  actionArea: document.getElementById('actionArea'),
  saveViewBar: document.getElementById('saveViewBar'),
  saveViewName: document.getElementById('saveViewName'),
  confirmSaveViewBtn: document.getElementById('confirmSaveViewBtn'),
  cancelSaveViewBtn: document.getElementById('cancelSaveViewBtn'),
  launcherTooltip: document.getElementById('launcherTooltip'),
  assistantEyebrow: document.getElementById('assistantEyebrow'),
  assistantTitle: document.getElementById('assistantTitle'),
  pageTitle: document.getElementById('pageTitle'),
  pageHintText: document.getElementById('pageHintText'),
};


function getRoleMeta() {
  const roleKey = (state.bootstrap?.role || state.role || 'OPERATIONS').toUpperCase();
  return ROLE_META[roleKey] || ROLE_META.OPERATIONS;
}

function isComparisonType(analysisType) {
  return ['time_comparison', 'sus_time_comparison', 'exh_comparison'].includes(analysisType);
}


function ensureAssistantDialogStyles() {
  if (document.getElementById('assistantDialogStyles')) return;

  const style = document.createElement('style');
  style.id = 'assistantDialogStyles';
  style.textContent = `
    .assistant-dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.42);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 99999;
    }
    .assistant-dialog {
      width: min(100%, 420px);
      background: #ffffff;
      border-radius: 18px;
      border: 1px solid rgba(148, 163, 184, 0.28);
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.24);
      padding: 22px;
      color: #0f172a;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .assistant-dialog h3 {
      margin: 0 0 10px;
      font-size: 1.05rem;
      font-weight: 700;
      color: #0f172a;
    }
    .assistant-dialog p {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.55;
      color: #334155;
    }
    .assistant-dialog__actions {
      margin-top: 18px;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .assistant-dialog__btn {
      appearance: none;
      border: 0;
      border-radius: 12px;
      padding: 10px 16px;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
    }
    .assistant-dialog__btn:hover {
      transform: translateY(-1px);
    }
    .assistant-dialog__btn--ghost {
      background: #eef2ff;
      color: #334155;
    }
    .assistant-dialog__btn--confirm {
      background: var(--accent, #3659d9);
      color: #ffffff;
      box-shadow: 0 10px 24px rgba(54, 89, 217, 0.24);
    }
    .assistant-dialog__btn--danger {
      background: #dc2626;
      color: #ffffff;
      box-shadow: 0 10px 24px rgba(220, 38, 38, 0.22);
    }
  `;
  document.head.appendChild(style);
}

function openAssistantDialog({ title, message, confirmText = 'OK', cancelText = '', destructive = false }) {
  ensureAssistantDialogStyles();

  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'assistant-dialog-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'assistant-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = `
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="assistant-dialog__actions"></div>
    `;

    const actions = dialog.querySelector('.assistant-dialog__actions');

    const closeDialog = value => {
      backdrop.remove();
      document.removeEventListener('keydown', onKeyDown);
      resolve(value);
    };

    const onKeyDown = event => {
      if (event.key === 'Escape') {
        closeDialog(Boolean(!cancelText));
      }
    };

    if (cancelText) {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'assistant-dialog__btn assistant-dialog__btn--ghost';
      cancelBtn.textContent = cancelText;
      cancelBtn.onclick = () => closeDialog(false);
      actions.appendChild(cancelBtn);
    }

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = `assistant-dialog__btn ${destructive ? 'assistant-dialog__btn--danger' : 'assistant-dialog__btn--confirm'}`;
    confirmBtn.textContent = confirmText;
    confirmBtn.onclick = () => closeDialog(true);
    actions.appendChild(confirmBtn);

    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) {
        closeDialog(Boolean(!cancelText));
      }
    });

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKeyDown);
    confirmBtn.focus();
  });
}

async function showSaveWarning() {
  await openAssistantDialog({
    title: 'Warning',
    message: 'Please select a query before saving',
    confirmText: 'OK',
  });
}

async function confirmDeleteSavedView() {
  return openAssistantDialog({
    title: 'Delete saved view',
    message: 'Are you sure you want to delete this view?',
    cancelText: 'Cancel',
    confirmText: 'Delete',
    destructive: true,
  });
}

// This keeps the launcher, header, and page copy aligned with the active module.
function applyRoleBranding() {
  const meta = getRoleMeta();
  const assistantName = state.bootstrap?.assistant_name || meta.assistantName;
  document.title = assistantName;
  if (el.launcherTooltip) el.launcherTooltip.textContent = assistantName;
  if (el.assistantTitle) el.assistantTitle.textContent = assistantName;
  if (el.assistantEyebrow) el.assistantEyebrow.textContent = meta.eyebrow;
  if (el.pageTitle) el.pageTitle.textContent = meta.pageTitle;
  if (el.pageHintText) el.pageHintText.textContent = meta.pageHint;
  if (el.launcher) el.launcher.setAttribute('aria-label', `Open ${assistantName}`);
  document.documentElement.style.setProperty('--accent', meta.accent || '#3659d9');
  document.documentElement.style.setProperty('--accent-soft', meta.accentSoft || 'rgba(54,89,217,0.12)');
  document.body.classList.toggle('assistant-embedded', EMBEDDED);
}

function analysisTypeForAction(label) {
  const match = (state.bootstrap?.primary_actions || []).find(item => item.label === label);
  return match?.analysis_type || 'occupancy_summary';
}

function makeEmptyAnalysisState() {
  return {
    action: null,
    request: null,
    runs: [],
    isEditingForm: false,
    loadedMessage: '',
  };
}

function getActiveAnalysis() {
  if (!state.analysisByTab[state.activeTabId]) {
    state.analysisByTab[state.activeTabId] = makeEmptyAnalysisState();
  }
  return state.analysisByTab[state.activeTabId];
}

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function toInputDate(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function humanizeMetric(metric) {
  return (metric || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function inferActionLabel(requestOrType) {
  if (!requestOrType) return 'Overview';
  if (typeof requestOrType === 'string') return ANALYSIS_LABELS[requestOrType] || 'Overview';
  if (requestOrType.analysis_type === 'occupancy_summary') {
    return requestOrType.metric === 'occupancy' ? 'Occupancy' : 'Overview';
  }
  return ANALYSIS_LABELS[requestOrType.analysis_type] || 'Overview';
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function boot() {
  state.bootstrap = await api(
    `/assistant/widget/bootstrap?user_id=${encodeURIComponent(state.userId)}&user_name=${encodeURIComponent(state.userName)}&role=${encodeURIComponent(state.role)}`
  );
  state.flowConfig = await api(`/assistant/widget/flow-config?role=${encodeURIComponent(state.role)}&user_id=${encodeURIComponent(state.userId)}`);
  state.assignment = state.bootstrap.assignment || null;
  state.analysisByTab = { draft: makeEmptyAnalysisState() };
  await refreshSavedViews();
  applyRoleBranding();
  render();
}

async function refreshSavedViews() {
  const data = await api(`/assistant/widget/saved-views?user_id=${encodeURIComponent(state.userId)}`);
  state.savedViews = data.saved_views || [];
  syncTabs();
}

function syncTabs() {
  const fixed = state.tabs.find(t => t.id === 'draft') || { id: 'draft', name: 'Current analysis', type: 'draft' };
  state.tabs = [fixed, ...state.savedViews.map(v => ({ id: v.view_id, name: v.name, type: 'saved' }))];

  const allowed = new Set(state.tabs.map(tab => tab.id));
  Object.keys(state.analysisByTab).forEach(tabId => {
    if (!allowed.has(tabId)) delete state.analysisByTab[tabId];
  });
  if (!allowed.has(state.activeTabId)) state.activeTabId = 'draft';
}

function openWidget() {
  state.isOpen = true;
  el.shell.classList.remove('hidden');
  if (!state.bootstrap) {
    boot().catch(err => {
      const meta = getRoleMeta();
      el.conversation.innerHTML = `<div class="card"><h3>Unable to load ${meta.assistantName}</h3><p>${err.message}</p></div>`;
    });
    return;
  }
  applyRoleBranding();
  render();
}

function closeWidget() {
  state.isOpen = false;
  el.shell.classList.add('hidden');
  hideSaveViewBar();
}

function toggleExpanded() {
  state.isExpanded = !state.isExpanded;
  el.shell.classList.toggle('expanded', state.isExpanded);
  el.savedViewsPanel.classList.toggle('hidden', !state.isExpanded);
  el.expandBtn.textContent = state.isExpanded ? '⤡' : '⤢';
}

function defaultRequest(actionLabel) {
  const assignment = state.bootstrap?.assignment || {};
  return {
    user_id: state.userId,
    user_name: state.userName,
    role: state.role,
    session_id: state.sessionId,
    analysis_type: analysisTypeForAction(actionLabel),
    metric: actionLabel === 'Trends' ? 'occupancy_trend' : null,
    scope_type: state.role === 'EXHIBITOR' ? 'assignment' : 'full_venue',
    zone_ids: state.role === 'EXHIBITOR' && assignment.zone_id ? [assignment.zone_id] : [],
    hall_ids: state.role === 'EXHIBITOR' && assignment.hall_id ? [assignment.hall_id] : [],
    time_range: 'custom',
    start_date: state.role === 'EXHIBITOR' ? assignment.event_start_date : state.bootstrap.earliest_available_date,
    end_date: state.role === 'EXHIBITOR' ? assignment.event_end_date : state.bootstrap.latest_available_date,
    compare_with: state.role === 'EXHIBITOR' && actionLabel === 'Comparison' ? 'event_average' : 'none',
    aggregation: 'hourly',
    event_id: state.role === 'EXHIBITOR' ? assignment.event_id : null,
    booth_id: state.role === 'EXHIBITOR' ? assignment.booth_id : null,
    limit: 5,
  };
}

function startAction(actionLabel) {
  state.activeTabId = 'draft';
  state.analysisByTab.draft = {
    action: actionLabel,
    request: defaultRequest(actionLabel),
    runs: [],
    isEditingForm: true,
    loadedMessage: '',
  };
  state.openMultiKey = null;
  state.validationMessage = '';
  state.saveIntent = 'idle';
  hideSaveViewBar();
  render();
  scrollConversationToBottom();
}

function backToActions() {
  state.activeTabId = 'draft';
  state.analysisByTab.draft = makeEmptyAnalysisState();
  state.openMultiKey = null;
  state.validationMessage = '';
  state.saveIntent = 'idle';
  hideSaveViewBar();
  render();
  requestAnimationFrame(() => {
    el.conversation.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function ensureSavedAnalysis(view) {
  if (!view) return makeEmptyAnalysisState();
  if (state.analysisByTab[view.view_id]) return state.analysisByTab[view.view_id];

  const payload = view.view_payload || {};
  const action = payload.action || inferActionLabel(payload.request || payload.analysis_type);
  const request = payload.request || defaultRequest(action);
  const results = payload.results || [];

  state.analysisByTab[view.view_id] = {
    action,
    request,
    runs: results.length ? [{ request, results, ranAt: payload.saved_at || view.created_at, fromSavedView: true }] : [],
    isEditingForm: false,
    loadedMessage: 'Saved view loaded.',
  };
  return state.analysisByTab[view.view_id];
}

function switchTab(tabId) {
  state.activeTabId = tabId;
  state.validationMessage = '';
  state.saveIntent = 'idle';
  hideSaveViewBar();
  if (tabId !== 'draft') {
    const view = state.savedViews.find(item => item.view_id === tabId);
    ensureSavedAnalysis(view);
  }
  render();
}

function loadSavedView(view) {
  ensureSavedAnalysis(view);
  switchTab(view.view_id);
  scrollConversationToBottom();
}

async function deleteSavedView(viewId) {
  const confirmed = await confirmDeleteSavedView();
  if (!confirmed) return;

  await api(`/assistant/widget/saved-views/${viewId}?user_id=${encodeURIComponent(state.userId)}`, { method: 'DELETE' });
  delete state.analysisByTab[viewId];
  await refreshSavedViews();
  if (state.activeTabId === viewId) state.activeTabId = 'draft';
  render();
}

function hideSaveViewBar() {
  el.saveViewBar.classList.add('hidden');
  el.saveViewName.classList.remove('error-state', 'success-state');
}

function showSaveViewBar() {
  el.saveViewBar.classList.remove('hidden');
  el.saveViewName.value = '';
  el.saveViewName.focus();
}

function canSaveCurrentView() {
  const view = getActiveAnalysis();
  return !!(view.request && view.runs && view.runs.length);
}

async function saveCurrentView() {
  const view = getActiveAnalysis();
  if (!canSaveCurrentView()) {
    state.saveIntent = 'error';
    state.validationMessage = 'Please select a query before saving';
    el.saveViewName.classList.add('error-state');
    render();
    return;
  }
  const name = el.saveViewName.value.trim();
  if (!name) {
    state.saveIntent = 'error';
    state.validationMessage = 'Enter a name for the saved view.';
    el.saveViewName.classList.add('error-state');
    render();
    return;
  }

  const latestRun = view.runs[view.runs.length - 1];
  const payload = {
    action: view.action,
    request: latestRun.request,
    results: latestRun.results,
    saved_at: latestRun.ranAt || new Date().toISOString(),
  };

  const res = await api('/assistant/widget/save-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: state.userId,
      session_id: state.sessionId,
      name,
      view_payload: payload,
    }),
  });

  await refreshSavedViews();
  hideSaveViewBar();
  el.saveViewName.classList.remove('error-state');
  el.saveViewName.classList.add('success-state');
  state.saveIntent = 'success';
  state.validationMessage = 'Saved view stored successfully.';
  loadSavedView(res.saved_view);
}

function buildHallMap() {
  return state.flowConfig.steps.find(step => step.id === 'hall_ids')?.options_by_parent || {};
}

function allHallsForZones(zoneIds) {
  const hallMap = buildHallMap();
  const halls = [];
  zoneIds.forEach(z => (hallMap[z] || []).forEach(h => halls.push(h.value)));
  return [...new Set(halls)];
}

function updateRequest(patch) {
  const view = getActiveAnalysis();
  if (!view.request) return;
  view.request = { ...view.request, ...patch };

  if (patch.scope_type === 'full_venue') {
    view.request.zone_ids = [];
    view.request.hall_ids = [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'zone_ids')) {
    const selected = patch.zone_ids || [];
    const validHalls = new Set(allHallsForZones(selected));
    view.request.hall_ids = view.request.hall_ids.filter(hallId => validHalls.has(hallId));
  }

  state.saveIntent = 'idle';
  state.validationMessage = '';
  render();
}

function render() {
  if (!state.bootstrap) return;
  applyRoleBranding();
  renderTabs();
  renderSavedViewsPanel();
  renderConversation();
  renderQuickControls();
}

function renderTabs() {
  el.tabBar.innerHTML = '';
  state.tabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = `tab-chip ${tab.id === state.activeTabId ? 'active' : ''}`;
    btn.innerHTML = `<span class="tab-chip__label">${tab.name}</span>`;
    btn.onclick = () => switchTab(tab.id);

    if (tab.type === 'saved') {
      const del = document.createElement('button');
      del.className = 'tab-delete';
      del.setAttribute('aria-label', `Delete ${tab.name}`);
      del.innerHTML = '&#128465;';
      del.onclick = e => {
        e.stopPropagation();
        deleteSavedView(tab.id);
      };
      btn.appendChild(del);
    }
    el.tabBar.appendChild(btn);
  });
}

function renderSavedViewsPanel() {
  el.savedViewsList.innerHTML = '';
  state.savedViews.forEach(view => {
    const card = document.createElement('div');
    card.className = `saved-view-item ${view.view_id === state.activeTabId ? 'saved-view-item--active' : ''}`;
    card.innerHTML = `
      <div class="saved-view-item__top">
        <h4>${view.name}</h4>
        <button class="delete-mini" aria-label="Delete saved view">&#128465;</button>
      </div>
      <p>${(view.view_payload?.results?.[0]?.title) || (view.view_payload?.action) || 'Saved analysis'}</p>
    `;
    card.onclick = () => loadSavedView(view);
    card.querySelector('.delete-mini').onclick = e => {
      e.stopPropagation();
      deleteSavedView(view.view_id);
    };
    el.savedViewsList.appendChild(card);
  });
}

function renderConversation() {
  el.conversation.innerHTML = '';
  const view = getActiveAnalysis();

  const intro = document.createElement('div');
  intro.className = 'card intro-card assistant-card';
  intro.innerHTML = `
    <h3>${state.bootstrap.greeting.title}</h3>
    <p>${state.bootstrap.greeting.message}</p>
    <p class="helper">Choose one to begin.</p>
  `;
  const chips = document.createElement('div');
  chips.className = 'chip-row large-gap';
  state.bootstrap.primary_actions.forEach(action => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = action.label;
    btn.onclick = () => startAction(action.label);
    chips.appendChild(btn);
  });
  intro.appendChild(chips);
  el.conversation.appendChild(intro);

  if (state.role === 'EXHIBITOR' && state.assignment) {
    const assignmentCard = document.createElement('div');
    assignmentCard.className = 'card assistant-card';
    assignmentCard.innerHTML = `
      <h3>Assigned booth</h3>
      <p><strong>${state.assignment.event_name}</strong> · Booth ${state.assignment.booth_code}</p>
      <p>${state.assignment.hall_name} · ${state.assignment.zone_id} · ${fmtDate(state.assignment.event_start_date)} to ${fmtDate(state.assignment.event_end_date)}</p>
    `;
    el.conversation.appendChild(assignmentCard);
  }

  if (!view.action || !view.request) return;
  el.conversation.appendChild(renderUserBubble(buildInitialUserMessage(view.action)));

  if (view.loadedMessage) {
    const loaded = document.createElement('div');
    loaded.className = 'status-inline status-inline--success';
    loaded.textContent = view.loadedMessage;
    el.conversation.appendChild(loaded);
  }

  if (view.isEditingForm) {
    el.conversation.appendChild(renderFormCard(view));
  }

  view.runs.forEach((run, index) => {
  el.conversation.appendChild(renderUserBubble(buildRunUserMessage(view.action, run.request)))

  ;

    run.results.forEach(result => {
      el.conversation.appendChild(renderResultCard(result, index));
    });
  });
}

function renderUserBubble(text) {
  const wrap = document.createElement('div');
  wrap.className = 'message-row message-row--user';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble message-bubble--user';
  bubble.textContent = text;

  wrap.appendChild(bubble);
  return wrap;
}

function buildInitialUserMessage(action) {
  if (state.role === 'EXHIBITOR' && state.assignment) {
    return `${action || 'Overview'} for ${state.assignment.booth_code} in ${state.assignment.event_name}`;
  }
  return action || 'Overview';
}

function buildRunUserMessage(action, request) {
  const parts = [];

  parts.push(action);

  if (request.scope_type === 'assignment' && state.assignment) {
    parts.push(`for booth ${state.assignment.booth_code}`);
  } else if (request.scope_type === 'full_venue') {
    parts.push('for full venue');
  } else {
    const zones = request.zone_ids?.length ? request.zone_ids.join(', ') : '';
    const halls = request.hall_ids?.length ? request.hall_ids.join(', ') : '';

    const scopeBits = [];
    if (zones) scopeBits.push(`zones ${zones}`);
    if (halls) scopeBits.push(`halls ${halls}`);

    if (scopeBits.length) {
      parts.push(`for ${scopeBits.join(' and ')}`);
    }
  }

  if (request.start_date && request.end_date) {
    parts.push(`from ${fmtDate(request.start_date)} to ${fmtDate(request.end_date)}`);
  }

  if (action === 'Trends' && request.metric) {
    parts.push(`using ${humanizeMetric(request.metric).toLowerCase()}`);
  }

  if (request.aggregation && state.role === 'EXHIBITOR') {
    parts.push(`with ${request.aggregation}`);
  }

  if (request.compare_with && request.compare_with !== 'none') {
    parts.push(`compared with ${request.compare_with.replaceAll('_', ' ')}`);
  }

  return parts.join(' ');
}

function buildRunTitle(action, request) {
  if (action === 'Trends' && request.metric) {
    return `${action} · ${humanizeMetric(request.metric)}`;
  }
  return action;
}

function buildRunSubtitle(request) {
  const scope = request.scope_type === 'assignment' && state.assignment
    ? `Booth ${state.assignment.booth_code}`
    : request.scope_type === 'custom'
      ? `${request.zone_ids?.length || 0} zone(s) · ${request.hall_ids?.length || 0} hall(s)`
      : 'Full venue';
  const dates = `${fmtDate(request.start_date)} → ${fmtDate(request.end_date)}`;
  const compare = request.compare_with && request.compare_with !== 'none'
    ? ` · Compared with ${request.compare_with.replaceAll('_', ' ')}`
    : '';
  return `${scope} · ${dates}${compare}`;
}

function renderFormCard(view) {
  const card = document.createElement('div');
  card.className = 'card form-card assistant-card';
  card.id = 'activeFormCard';
  const request = view.request;
  card.innerHTML = `<h3>${view.action}</h3><p>Set up ${view.action.toLowerCase()}. Complete the form below.</p>`;

  if (state.validationMessage) {
    const note = document.createElement('div');
    note.className = `status-note ${state.saveIntent === 'error' ? 'status-error' : 'status-success'}`;
    note.textContent = state.validationMessage;
    card.appendChild(note);
  }

  const grid = document.createElement('div');
  grid.className = 'form-grid';

  if (state.role === 'EXHIBITOR' && state.assignment) {
    const assignmentField = document.createElement('div');
    assignmentField.className = 'field field--full';
    assignmentField.innerHTML = `<label>Assignment</label><div class="assignment-box">${state.assignment.event_name}<br/>Booth ${state.assignment.booth_code} · ${state.assignment.hall_name} · ${state.assignment.zone_id}</div>`;
    grid.appendChild(assignmentField);

    const aggOptions = state.flowConfig.steps.find(s => s.id === 'aggregation')?.options || [
      { value: 'hourly', label: 'Hourly' },
      { value: 'daily', label: 'Daily' },
    ];
    grid.appendChild(renderSelect('Aggregation', request.aggregation || 'hourly', aggOptions, value => updateRequest({ aggregation: value })));
  } else {
    grid.appendChild(renderSelect('Scope', request.scope_type, [
      { value: 'full_venue', label: 'Full venue' },
      { value: 'custom', label: 'Zone / hall' },
    ], value => updateRequest({ scope_type: value })));

    if (request.scope_type === 'custom') {
      const zoneOptions = state.flowConfig.steps.find(s => s.id === 'zone_ids').options || [];
      const hallOptions = request.zone_ids.length ? request.zone_ids.flatMap(z => buildHallMap()[z] || []) : [];

      grid.appendChild(renderMultiSelect('Zones', 'zones', zoneOptions, request.zone_ids, ids => updateRequest({ zone_ids: ids })));
      grid.appendChild(renderMultiSelect('Halls', 'halls', hallOptions, request.hall_ids, ids => updateRequest({ hall_ids: ids }), true));
    }
  }

  function scrollToRunStart(runIndex, extraOffset = 72) {
  requestAnimationFrame(() => {
    const target = el.conversation.querySelector(`.result-card[data-run-index="${runIndex}"]`);
    if (!target) {
      scrollConversationToBottom();
      return;
    }

    const conversationRect = el.conversation.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop = el.conversation.scrollTop + (targetRect.top - conversationRect.top) - extraOffset;

    el.conversation.scrollTo({
      top: Math.max(0, nextTop),
      behavior: 'smooth',
    });
  });
}

  const dateRow = document.createElement('div');
  dateRow.className = 'date-row';
  const minDate = state.role === 'EXHIBITOR' ? state.assignment?.event_start_date : state.bootstrap.earliest_available_date;
  const maxDate = state.role === 'EXHIBITOR' ? state.assignment?.event_end_date : state.bootstrap.latest_available_date;
  dateRow.appendChild(renderDateField('Start date', request.start_date, value => updateRequest({ start_date: value }), minDate, maxDate));
  dateRow.appendChild(renderDateField('End date', request.end_date, value => updateRequest({ end_date: value }), minDate, maxDate));
  grid.appendChild(dateRow);

  if (view.action === 'Trends') {
    grid.appendChild(renderSelect(
      'Trend metric',
      request.metric || 'occupancy_trend',
      state.flowConfig.steps.find(s => s.id === 'metric').options,
      value => updateRequest({ metric: value })
    ));
  }

  const shouldShowCompare = state.role !== 'EXHIBITOR' || view.action === 'Comparison';
  if (shouldShowCompare) {
    const compareOptions = state.flowConfig.steps.find(s => s.id === 'compare_with')?.options || [
      { value: 'none', label: 'No comparison' },
      { value: 'yesterday', label: 'Previous day' },
      { value: 'last_7_days', label: 'Previous 7 days' },
    ];
    grid.appendChild(renderSelect('Compare with', request.compare_with || 'none', compareOptions, value => updateRequest({ compare_with: value })));
  }

  card.appendChild(grid);

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const runBtn = document.createElement('button');
  runBtn.className = 'primary-btn';
  runBtn.textContent = 'Run analysis';
  runBtn.onclick = runAnalysis;

  const backBtn = document.createElement('button');
  backBtn.className = 'ghost-btn';
  backBtn.textContent = 'Back to actions';
  backBtn.onclick = backToActions;

  actions.append(runBtn, backBtn);
  card.appendChild(actions);
  return card;
}

function renderSelect(label, value, options, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML = `<label>${label}</label>`;

  const select = document.createElement('select');
  select.className = 'guided-select';
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    option.selected = value === opt.value;
    select.appendChild(option);
  });
  select.onchange = e => onChange(e.target.value);
  wrap.appendChild(select);
  return wrap;
}

function renderDateField(label, fieldKey, value, minDate = '', maxDate = '') {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML = `<label>${label}</label>`;

  const input = document.createElement('input');
  input.type = 'date';
  input.autocomplete = 'off';
  input.className = 'guided-input guided-input--date';
  input.value = value || '';
  input.dataset.dateField = fieldKey;
  input.setAttribute('aria-label', label);

  if (minDate) {
    input.min = minDate;
    input.dataset.minDate = minDate;
  }
  if (maxDate) {
    input.max = maxDate;
    input.dataset.maxDate = maxDate;
  }

  const isLockedForExhibitor = state.role === 'EXHIBITOR';

  if (isLockedForExhibitor) {
    input.disabled = true;
    input.classList.add('guided-input--locked');
    input.setAttribute('aria-disabled', 'true');
    input.title = 'Date is locked to the selected event.';
  } else {
    const commitCurrentValue = target => {
      commitDateDraft(fieldKey, target.value, minDate, maxDate);
    };

    input.oninput = e => {
      setDateDraft(fieldKey, e.target.value);
      state.validationMessage = '';
      state.saveIntent = 'idle';
    };

    input.onblur = e => {
      commitCurrentValue(e.target);
    };

    input.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCurrentValue(e.target);
        e.target.blur();
      }
    };
  }

  wrap.appendChild(input);
  return wrap;
}

function renderMultiSelect(label, key, options, selectedValues, onApply, isHall = false) {
  const wrap = document.createElement('div');
  wrap.className = 'field field--left multi-select-wrap';
  wrap.innerHTML = `<label>${label}</label>`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'multi-toggle';

  const allLabel = isHall ? 'All halls' : 'All zones';
  let text = allLabel;

  if (selectedValues.length && selectedValues.length !== options.length) {
    text = `${selectedValues.length} selected`;
  }

  if (!options.length) {
    text = isHall ? 'No halls available' : allLabel;
  }

  button.textContent = text;
  button.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    state.openMultiKey = state.openMultiKey === key ? null : key;
    render();
  };

  wrap.appendChild(button);

  if (state.openMultiKey === key) {
    const panel = document.createElement('div');
    panel.className = 'multi-panel';
    panel.onclick = e => e.stopPropagation();

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'ghost-btn small-btn multi-panel__select-all';

    const allSelected = options.length > 0 && selectedValues.length === options.length;
    allBtn.textContent = allSelected ? 'Clear all' : 'Select all';
    allBtn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      onApply(allSelected ? [] : options.map(opt => opt.value));
    };

    panel.appendChild(allBtn);

    options.forEach(opt => {
      const row = document.createElement('label');
      row.className = 'check-row';

      const checked = selectedValues.includes(opt.value);
      row.innerHTML = `
        <input type="checkbox" ${checked ? 'checked' : ''} />
        <span class="check-row__label">${opt.label}</span>
      `;

      row.querySelector('input').onchange = ev => {
        const next = ev.target.checked
          ? [...new Set([...selectedValues, opt.value])]
          : selectedValues.filter(v => v !== opt.value);

        onApply(next);
      };

      panel.appendChild(row);
    });

    wrap.appendChild(panel);
  }

  return wrap;
}

async function runAnalysis() {
  const view = getActiveAnalysis();
  if (!view.request?.start_date || !view.request?.end_date) {
    state.saveIntent = 'error';
    state.validationMessage = 'Choose a valid date range.';
    render();
    scrollToForm();
    return;
  }

  const req = JSON.parse(JSON.stringify(view.request));
  const primary = await api('/assistant/widget/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  const results = [primary];
  const shouldAutoAppendComparison = state.role !== 'EXHIBITOR'
    && req.compare_with
    && req.compare_with !== 'none'
    && !isComparisonType(req.analysis_type);

  if (shouldAutoAppendComparison) {
    const comparisonType = state.role === 'SUSTAINABILITY' ? 'sus_time_comparison' : 'time_comparison';
    const comparisonReq = { ...req, analysis_type: comparisonType };
    const comparison = await api('/assistant/widget/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(comparisonReq),
    });
    results.push(comparison);
  }

  view.runs.push({
    request: req,
    results,
    ranAt: new Date().toISOString(),
    fromSavedView: false,
  });

  const newRunIndex = view.runs.length - 1;

  view.isEditingForm = false;
  view.loadedMessage = '';
  state.validationMessage = '';
  state.saveIntent = 'idle';
  render();
  scrollToRunStart(newRunIndex, 88);
}

function renderResultCard(result, runIndex) {
  const card = document.createElement('div');
  card.className = 'card result-card assistant-card';
  card.dataset.runIndex = String(runIndex);
  card.innerHTML = `<h3>${result.title || 'Result'}</h3><p>${result.summary || ''}</p>`;

  if (result.response_type === 'summary_card') card.appendChild(renderSummaryCard(result.data));
  if (result.response_type === 'table_card') card.appendChild(renderTableCard(result.data));
  if (result.response_type === 'chart_card') card.appendChild(renderChartCard(result.data));

  const chips = document.createElement('div');
  chips.className = 'chip-row result-chip-row';

  const edit = document.createElement('button');
  edit.className = 'ghost-btn small-btn';
  edit.textContent = 'Edit scope';
  edit.onclick = () => {
    const view = getActiveAnalysis();
    view.isEditingForm = true;
    state.validationMessage = '';
    render();
    scrollToForm();
  };
  chips.appendChild(edit);

  (result.follow_up_actions || []).slice(0, 2).forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = item.label;
    btn.onclick = async () => {
      const view = getActiveAnalysis();
      view.request = {
        ...view.request,
        ...item.payload,
        user_id: state.userId,
        user_name: state.userName,
        role: state.role,
        session_id: state.sessionId,
      };
      view.action = inferActionLabel(view.request.analysis_type);
      view.isEditingForm = false;
      await runAnalysis();
    };
    chips.appendChild(btn);
  });

  card.appendChild(chips);
  return card;
}


function renderSummaryCard(data) {
  const box = document.createElement('div');
  box.className = 'summary-grid';

  const cards = Array.isArray(data.cards) && data.cards.length
    ? data.cards.map(item => [item.label, item.value])
    : [
        ['Occupancy', data.summary?.total_current_occupancy ?? '—'],
        ['Busiest hall', data.summary?.busiest_hall?.hall_name || '—'],
        ['Avg occupancy ratio', data.summary?.busiest_hall?.occupancy_ratio ?? '—'],
        ['Congestion hotspot', data.summary?.congestion_hotspot?.hall_name || '—'],
      ];

  cards.forEach(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'stat-box';
    item.innerHTML = `<label>${label}</label><strong>${value}</strong>`;
    box.appendChild(item);
  });

  return box;
}

function renderTableCard(data) {
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const rows = data.rows || (data.kpis || []).map(item => ({ metric: item.label, value: item.value }));
  if (!rows.length) {
    wrap.innerHTML = '<p class="table-empty">No rows found for the selected filters.</p>';
    return wrap;
  }
  const keys = Object.keys(rows[0]);
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr>${keys.map(k => `<th>${k.replaceAll('_', ' ')}</th>`).join('')}</tr></thead>`;
  const tbody = document.createElement('tbody');
  rows.slice(0, 8).forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = keys.map(k => `<td>${row[k]}</td>`).join('');
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function renderKpiStrip(kpis) {
  const box = document.createElement('div');
  box.className = 'summary-grid';

  (kpis || []).forEach(item => {
    const card = document.createElement('div');
    card.className = 'stat-box';
    card.innerHTML = `<label>${item.label}</label><strong>${item.value}</strong>`;
    box.appendChild(card);
  });

  return box;
}

function renderChartCard(data) {
  const wrap = document.createElement('div');
  wrap.className = 'chart-card';

  if (Array.isArray(data.kpis) && data.kpis.length) {
    wrap.appendChild(renderKpiStrip(data.kpis));
  }

  const chartBlock = document.createElement('div');
  chartBlock.className = 'chart-block';
  chartBlock.appendChild(renderInteractiveChart(data));
  wrap.appendChild(chartBlock);

  let badges = [];
  if (Array.isArray(data.badges) && data.badges.length) {
    badges = data.badges.map(item => [item.label, item.value]);
  } else {
    const summary = data.summary || {};
    if (summary.peak_period) badges.push(['Peak hour', summary.peak_period]);
    if (summary.lowest_period) badges.push(['Quiet hour', summary.lowest_period]);
    if (summary.best_day) badges.push(['Strongest day', summary.best_day]);
    if (summary.quiet_day) badges.push(['Lowest-traffic day', summary.quiet_day]);
  }

  if (badges.length) {
    const grid = document.createElement('div');
    grid.className = 'mini-summary-grid';

    badges.slice(0, 4).forEach(([label, value]) => {
      const item = document.createElement('div');
      item.className = 'mini-summary';
      item.innerHTML = `<label>${label}</label><strong>${value}</strong>`;
      grid.appendChild(item);
    });

    wrap.appendChild(grid);
  }

  if (Array.isArray(data.table_rows) && data.table_rows.length) {
    wrap.appendChild(renderTableCard({ rows: data.table_rows }));
  }

  return wrap;
}

function renderInteractiveChart(data) {
  const container = document.createElement('div');
  container.className = 'chart-wrap';
  const titleRow = document.createElement('div');
  titleRow.className = 'axis-row';
  titleRow.innerHTML = `<span class="axis-label-y">${data.y_axis_label || 'Occupancy'}</span><span class="axis-label-x">${data.x_axis_label || 'Time'}</span>`;
  container.appendChild(titleRow);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 720 320');
  svg.setAttribute('class', 'chart-svg');
  const plot = { left: 70, right: 18, top: 18, bottom: 44, width: 632, height: 258 };
  const series = data.series || [];
  if (!series.length) {
    const empty = document.createElement('div');
    empty.className = 'table-empty';
    empty.textContent = 'No chart line is shown for this selection. Use the table below for the detailed values.';
    container.appendChild(empty);
    return container;
  }

  const palette = ['#3659d9', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#0f766e'];
  const colorMap = series.map((s, idx) => s.color || palette[idx % palette.length]);
  const points = [];
  series.forEach((s, sIdx) => {
    (s.points || []).forEach(p => points.push({ ...p, name: s.name, color: colorMap[sIdx] }));
  });
  const xs = [...new Set(points.map(p => new Date(p.x).getTime()).filter(value => !Number.isNaN(value)))].sort((a, b) => a - b);
  const ys = points.map(p => Number(p.y));
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 1;
  const yPad = (maxY - minY || 1) * 0.15;
  const domainMin = minY - yPad;
  const domainMax = maxY + yPad;
  const xAt = x => plot.left + ((new Date(x).getTime() - xs[0]) / ((xs[xs.length - 1] - xs[0]) || 1)) * plot.width;
  const yAt = y => plot.top + (1 - ((Number(y) - domainMin) / ((domainMax - domainMin) || 1))) * plot.height;

  for (let i = 0; i < 4; i += 1) {
    const y = plot.top + (plot.height / 3) * i;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', plot.left);
    line.setAttribute('x2', plot.left + plot.width);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('class', 'grid-line');
    svg.appendChild(line);
  }

  const axisX = document.createElementNS(svgNS, 'line');
  axisX.setAttribute('x1', plot.left);
  axisX.setAttribute('x2', plot.left + plot.width);
  axisX.setAttribute('y1', plot.top + plot.height);
  axisX.setAttribute('y2', plot.top + plot.height);
  axisX.setAttribute('class', 'axis-line');
  svg.appendChild(axisX);

  const axisY = document.createElementNS(svgNS, 'line');
  axisY.setAttribute('x1', plot.left);
  axisY.setAttribute('x2', plot.left);
  axisY.setAttribute('y1', plot.top);
  axisY.setAttribute('y2', plot.top + plot.height);
  axisY.setAttribute('class', 'axis-line');
  svg.appendChild(axisY);

  series.forEach((s, sIdx) => {
    const d = (s.points || []).map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${xAt(p.x)} ${yAt(p.y)}`).join(' ');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d || '');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', colorMap[sIdx % colorMap.length]);
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
  });

  const cross = document.createElementNS(svgNS, 'line');
  cross.setAttribute('class', 'crosshair');
  cross.style.display = 'none';
  svg.appendChild(cross);

  const dots = [];
  series.forEach((s, sIdx) => {
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('r', '5');
    c.setAttribute('fill', colorMap[sIdx % colorMap.length]);
    c.style.display = 'none';
    svg.appendChild(c);
    dots.push(c);
  });

  const overlay = document.createElementNS(svgNS, 'rect');
  overlay.setAttribute('x', plot.left);
  overlay.setAttribute('y', plot.top);
  overlay.setAttribute('width', plot.width);
  overlay.setAttribute('height', plot.height);
  overlay.setAttribute('fill', 'transparent');
  svg.appendChild(overlay);

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.style.display = 'none';

  function updateTooltip(clientX) {
    if (!xs.length) return;
    const rect = svg.getBoundingClientRect();
    const scale = 720 / rect.width;
    const x = (clientX - rect.left) * scale;
    let idx = 0;
    let bestDist = Infinity;
    xs.forEach((val, i) => {
      const dist = Math.abs((plot.left + ((val - xs[0]) / ((xs[xs.length - 1] - xs[0]) || 1)) * plot.width) - x);
      if (dist < bestDist) {
        bestDist = dist;
        idx = i;
      }
    });
    const time = new Date(xs[idx]).toISOString().slice(0, 16).replace('T', ' ');
    const xCoord = plot.left + ((xs[idx] - xs[0]) / ((xs[xs.length - 1] - xs[0]) || 1)) * plot.width;
    cross.setAttribute('x1', xCoord);
    cross.setAttribute('x2', xCoord);
    cross.setAttribute('y1', plot.top);
    cross.setAttribute('y2', plot.top + plot.height);
    cross.style.display = 'block';

    tooltip.innerHTML = `<strong>${time}</strong>`;
    series.forEach((s, sIdx) => {
      const point = s.points[idx] || s.points[s.points.length - 1];
      if (!point) return;
      dots[sIdx].setAttribute('cx', xAt(point.x));
      dots[sIdx].setAttribute('cy', yAt(point.y));
      dots[sIdx].style.display = 'block';
      tooltip.innerHTML += `<div>${s.name}: ${point.y}</div>`;
    });
    tooltip.style.display = 'block';
    tooltip.style.left = `${Math.min(rect.width - 150, (xCoord / 720) * rect.width + 12)}px`;
    tooltip.style.top = '24px';
  }

  overlay.addEventListener('mousemove', e => updateTooltip(e.clientX));
  overlay.addEventListener('mouseleave', () => {
    cross.style.display = 'none';
    dots.forEach(d => { d.style.display = 'none'; });
    tooltip.style.display = 'none';
  });

  container.appendChild(svg);
  container.appendChild(tooltip);

  if (series.length) {
    container.appendChild(renderChartLegend(series, colorMap));
  }
  return container;
}

function renderChartLegend(series, colorMap) {
  const legend = document.createElement('div');
  legend.className = 'chart-legend';

  (series || []).forEach((s, idx) => {
    const item = document.createElement('div');
    item.className = 'chart-legend-item';

    const dot = document.createElement('span');
    dot.className = 'chart-legend-dot';
    dot.style.background = colorMap[idx % colorMap.length];

    const label = document.createElement('span');
    label.className = 'chart-legend-label';
    label.textContent = s.name || `Series ${idx + 1}`;

    item.appendChild(dot);
    item.appendChild(label);
    legend.appendChild(item);
  });

  return legend;
}

function renderQuickControls() {
  el.actionArea.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card quick-card';
  box.innerHTML = '<h3>Quick controls</h3>';
  const row = document.createElement('div');
  row.className = 'chip-row';

  const save = document.createElement('button');
  save.className = `primary-btn ${canSaveCurrentView() ? 'success-btn' : 'danger-btn'}`;
  save.textContent = 'Save this view';
  save.onclick = async () => {
    if (!canSaveCurrentView()) {
      state.saveIntent = 'error';
      state.validationMessage = 'Please select a query before saving';
      render();
      scrollToForm();
      await showSaveWarning();
      return;
    }
    showSaveViewBar();
  };

  const restart = document.createElement('button');
  restart.className = 'ghost-btn';
  restart.textContent = 'Start another analysis';
  restart.onclick = backToActions;

  const guide = document.createElement('button');
  guide.className = 'ghost-btn';
  guide.textContent = 'Open user guide';
  guide.onclick = () => window.open('/docs-static/operations_widget_guide.html', '_blank');

  row.append(save, restart, guide);
  box.appendChild(row);
  el.actionArea.appendChild(box);
}

function scrollConversationToBottom() {
  requestAnimationFrame(() => {
    el.conversation.scrollTo({ top: el.conversation.scrollHeight, behavior: 'smooth' });
  });
}

function scrollToForm() {
  requestAnimationFrame(() => {
    const form = document.getElementById('activeFormCard');
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      el.conversation.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

document.addEventListener('click', e => {
  if (!state.openMultiKey) return;

  if (!e.target.closest('.multi-select-wrap')) {
    state.openMultiKey = null;
    render();
  }
});

applyRoleBranding();

if (EMBEDDED) {
  state.isOpen = true;
  el.shell.classList.remove('hidden');
  boot().catch(err => {
    const meta = getRoleMeta();
    el.conversation.innerHTML = `<div class="card"><h3>Unable to load ${meta.assistantName}</h3><p>${err.message}</p></div>`;
  });
} else {
  el.launcher.onclick = openWidget;
}
el.closeBtn.onclick = closeWidget;
el.expandBtn.onclick = toggleExpanded;
el.confirmSaveViewBtn.onclick = saveCurrentView;
el.cancelSaveViewBtn.onclick = hideSaveViewBar;


/* ---- ChatGPT patch: date typing, multiselect scroll retention, embedded expand sync, quick actions footer ---- */
state.quickActionsCollapsed = typeof state.quickActionsCollapsed === 'boolean' ? state.quickActionsCollapsed : true;
state.multiScrollTopByKey = state.multiScrollTopByKey || {};

function notifyParentExpansion() {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'sentina-assistant:expanded', expanded: state.isExpanded }, '*');
  }
}

function applyExpandedState(notifyParent = true) {
  el.shell.classList.toggle('expanded', state.isExpanded);
  if (el.savedViewsPanel) {
    el.savedViewsPanel.classList.toggle('hidden', !state.isExpanded);
  }
  if (el.expandBtn) {
    el.expandBtn.textContent = state.isExpanded ? '⤡' : '⤢';
    el.expandBtn.setAttribute('aria-label', state.isExpanded ? 'Collapse saved views' : 'Expand saved views');
    el.expandBtn.setAttribute('title', state.isExpanded ? 'Collapse saved views' : 'Expand saved views');
  }
  if (notifyParent) notifyParentExpansion();
}

function setExpanded(nextExpanded, notifyParent = true) {
  state.isExpanded = !!nextExpanded;
  applyExpandedState(notifyParent);
}

function toggleExpanded() {
  setExpanded(!state.isExpanded);
}

async function boot() {
  state.bootstrap = await api(
    `/assistant/widget/bootstrap?user_id=${encodeURIComponent(state.userId)}&user_name=${encodeURIComponent(state.userName)}&role=${encodeURIComponent(state.role)}`
  );
  state.flowConfig = await api(`/assistant/widget/flow-config?role=${encodeURIComponent(state.role)}&user_id=${encodeURIComponent(state.userId)}`);
  state.assignment = state.bootstrap.assignment || null;
  state.analysisByTab = { draft: makeEmptyAnalysisState() };
  await refreshSavedViews();
  applyRoleBranding();
  applyExpandedState();
  render();
}

function openWidget() {
  state.isOpen = true;
  el.shell.classList.remove('hidden');
  if (!state.bootstrap) {
    boot().catch(err => {
      const meta = getRoleMeta();
      el.conversation.innerHTML = `<div class="card"><h3>Unable to load ${meta.assistantName}</h3><p>${err.message}</p></div>`;
    });
    return;
  }
  applyRoleBranding();
  applyExpandedState();
  render();
}

function closeWidget() {
  state.isOpen = false;
  el.shell.classList.add('hidden');
  hideSaveViewBar();
  setExpanded(false);
}

function makeEmptyAnalysisState() {
  return {
    action: null,
    request: null,
    runs: [],
    isEditingForm: false,
    loadedMessage: '',
    dateDrafts: { start_date: '', end_date: '' },
  };
}

function syncDateDrafts(view) {
  if (!view) return;
  view.dateDrafts = {
    start_date: toInputDate(view.request?.start_date),
    end_date: toInputDate(view.request?.end_date),
  };
}

function ensureDateDrafts(view) {
  if (!view) return { start_date: '', end_date: '' };
  if (!view.dateDrafts) {
    syncDateDrafts(view);
  }
  return view.dateDrafts;
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const dt = new Date(`${value}T00:00:00`);
  return (
    !Number.isNaN(dt.getTime()) &&
    dt.getFullYear() === year &&
    dt.getMonth() + 1 === month &&
    dt.getDate() === day
  );
}

function setDateDraft(fieldKey, value) {
  const view = getActiveAnalysis();
  const drafts = ensureDateDrafts(view);
  drafts[fieldKey] = value;
}

function commitDateDraft(fieldKey, rawValue, minDate = '', maxDate = '') {
  const nextValue = (rawValue || '').trim();
  const view = getActiveAnalysis();
  const drafts = ensureDateDrafts(view);
  drafts[fieldKey] = nextValue;

  if (!nextValue) {
    updateRequest({ [fieldKey]: '' });
    return true;
  }

  if (!isValidIsoDate(nextValue)) {
    state.saveIntent = 'error';
    state.validationMessage = 'Enter the date as YYYY-MM-DD.';
    render();
    scrollToForm();
    return false;
  }

  if (minDate && nextValue < minDate) {
    state.saveIntent = 'error';
    state.validationMessage = `${fieldKey === 'start_date' ? 'Start' : 'End'} date cannot be before ${fmtDate(minDate)}.`;
    render();
    scrollToForm();
    return false;
  }

  if (maxDate && nextValue > maxDate) {
    state.saveIntent = 'error';
    state.validationMessage = `${fieldKey === 'start_date' ? 'Start' : 'End'} date cannot be after ${fmtDate(maxDate)}.`;
    render();
    scrollToForm();
    return false;
  }

  updateRequest({ [fieldKey]: nextValue });
  return true;
}

function startAction(actionLabel) {
  state.activeTabId = 'draft';
  const request = defaultRequest(actionLabel);
  state.analysisByTab.draft = {
    action: actionLabel,
    request,
    runs: [],
    isEditingForm: true,
    loadedMessage: '',
    dateDrafts: {
      start_date: toInputDate(request.start_date),
      end_date: toInputDate(request.end_date),
    },
  };
  state.openMultiKey = null;
  state.validationMessage = '';
  state.saveIntent = 'idle';
  hideSaveViewBar();
  render();
  scrollConversationToBottom();
}

function ensureSavedAnalysis(view) {
  if (!view) return makeEmptyAnalysisState();
  if (state.analysisByTab[view.view_id]) return state.analysisByTab[view.view_id];

  const payload = view.view_payload || {};
  const action = payload.action || inferActionLabel(payload.request || payload.analysis_type);
  const request = payload.request || defaultRequest(action);
  const results = payload.results || [];

  state.analysisByTab[view.view_id] = {
    action,
    request,
    runs: results.length ? [{ request, results, ranAt: payload.saved_at || view.created_at, fromSavedView: true }] : [],
    isEditingForm: false,
    loadedMessage: 'Saved view loaded.',
    dateDrafts: {
      start_date: toInputDate(request?.start_date),
      end_date: toInputDate(request?.end_date),
    },
  };
  return state.analysisByTab[view.view_id];
}

function updateRequest(patch) {
  const view = getActiveAnalysis();
  if (!view.request) return;
  view.request = { ...view.request, ...patch };

  if (Object.prototype.hasOwnProperty.call(patch, 'start_date') || Object.prototype.hasOwnProperty.call(patch, 'end_date')) {
    const drafts = ensureDateDrafts(view);
    if (Object.prototype.hasOwnProperty.call(patch, 'start_date')) {
      drafts.start_date = toInputDate(patch.start_date);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'end_date')) {
      drafts.end_date = toInputDate(patch.end_date);
    }
  }

  if (patch.scope_type === 'full_venue') {
    view.request.zone_ids = [];
    view.request.hall_ids = [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'zone_ids')) {
    const selected = patch.zone_ids || [];
    const validHalls = new Set(allHallsForZones(selected));
    view.request.hall_ids = view.request.hall_ids.filter(hallId => validHalls.has(hallId));
  }

  state.saveIntent = 'idle';
  state.validationMessage = '';
  render();
}

function renderFormCard(view) {
  const card = document.createElement('div');
  card.className = 'card form-card assistant-card';
  card.id = 'activeFormCard';
  const request = view.request;
  const dateDrafts = ensureDateDrafts(view);
  card.innerHTML = `<h3>${view.action}</h3><p>Set up ${view.action.toLowerCase()}. Complete the form below.</p>`;

  if (state.validationMessage) {
    const note = document.createElement('div');
    note.className = `status-note ${state.saveIntent === 'error' ? 'status-error' : 'status-success'}`;
    note.textContent = state.validationMessage;
    card.appendChild(note);
  }

  const grid = document.createElement('div');
  grid.className = 'form-grid';

  if (state.role === 'EXHIBITOR' && state.assignment) {
    const assignmentField = document.createElement('div');
    assignmentField.className = 'field field--full';
    assignmentField.innerHTML = `<label>Assignment</label><div class="assignment-box">${state.assignment.event_name}<br/>Booth ${state.assignment.booth_code} · ${state.assignment.hall_name} · ${state.assignment.zone_id}</div>`;
    grid.appendChild(assignmentField);

    const aggOptions = state.flowConfig.steps.find(s => s.id === 'aggregation')?.options || [
      { value: 'hourly', label: 'Hourly' },
      { value: 'daily', label: 'Daily' },
    ];
    grid.appendChild(renderSelect('Aggregation', request.aggregation || 'hourly', aggOptions, value => updateRequest({ aggregation: value })));
  } else {
    grid.appendChild(renderSelect('Scope', request.scope_type, [
      { value: 'full_venue', label: 'Full venue' },
      { value: 'custom', label: 'Zone / hall' },
    ], value => updateRequest({ scope_type: value })));

    if (request.scope_type === 'custom') {
      const zoneOptions = state.flowConfig.steps.find(s => s.id === 'zone_ids').options || [];
      const hallOptions = request.zone_ids.length ? request.zone_ids.flatMap(z => buildHallMap()[z] || []) : [];

      grid.appendChild(renderMultiSelect('Zones', 'zones', zoneOptions, request.zone_ids, ids => updateRequest({ zone_ids: ids })));
      grid.appendChild(renderMultiSelect('Halls', 'halls', hallOptions, request.hall_ids, ids => updateRequest({ hall_ids: ids }), true));
    }
  }

  const dateRow = document.createElement('div');
  dateRow.className = 'date-row';
  const minDate = state.role === 'EXHIBITOR' ? state.assignment?.event_start_date : state.bootstrap.earliest_available_date;
  const maxDate = state.role === 'EXHIBITOR' ? state.assignment?.event_end_date : state.bootstrap.latest_available_date;
  dateRow.appendChild(renderDateField('Start date', 'start_date', dateDrafts.start_date, minDate, maxDate));
  dateRow.appendChild(renderDateField('End date', 'end_date', dateDrafts.end_date, minDate, maxDate));
  grid.appendChild(dateRow);

  if (view.action === 'Trends') {
    grid.appendChild(renderSelect(
      'Trend metric',
      request.metric || 'occupancy_trend',
      state.flowConfig.steps.find(s => s.id === 'metric').options,
      value => updateRequest({ metric: value })
    ));
  }

  const shouldShowCompare = state.role !== 'EXHIBITOR' || view.action === 'Comparison';
  if (shouldShowCompare) {
    const compareOptions = state.flowConfig.steps.find(s => s.id === 'compare_with')?.options || [
      { value: 'none', label: 'No comparison' },
      { value: 'yesterday', label: 'Previous day' },
      { value: 'last_7_days', label: 'Previous 7 days' },
    ];
    grid.appendChild(renderSelect('Compare with', request.compare_with || 'none', compareOptions, value => updateRequest({ compare_with: value })));
  }

  card.appendChild(grid);

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const runBtn = document.createElement('button');
  runBtn.className = 'primary-btn';
  runBtn.textContent = 'Run analysis';
  runBtn.onclick = runAnalysis;

  const backBtn = document.createElement('button');
  backBtn.className = 'ghost-btn';
  backBtn.textContent = 'Back to actions';
  backBtn.onclick = backToActions;

  actions.append(runBtn, backBtn);
  card.appendChild(actions);
  return card;
}

function renderDateField(label, fieldKey, value, minDate = '', maxDate = '') {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML = `<label>${label}</label>`;

  const input = document.createElement('input');
  input.type = 'date';
  input.autocomplete = 'off';
  input.className = 'guided-input guided-input--date';
  input.value = value || '';
  input.dataset.dateField = fieldKey;
  input.setAttribute('aria-label', label);

  if (minDate) {
    input.min = minDate;
    input.dataset.minDate = minDate;
  }
  if (maxDate) {
    input.max = maxDate;
    input.dataset.maxDate = maxDate;
  }

  const isLockedForExhibitor = state.role === 'EXHIBITOR';

  if (isLockedForExhibitor) {
    input.disabled = true;
    input.classList.add('guided-input--locked');
    input.setAttribute('aria-disabled', 'true');
    input.title = 'Date is locked to the selected event.';
  } else {
    const commitCurrentValue = target => {
      commitDateDraft(fieldKey, target.value, minDate, maxDate);
    };

    input.oninput = e => {
      setDateDraft(fieldKey, e.target.value);
      state.validationMessage = '';
      state.saveIntent = 'idle';
    };

    input.onblur = e => {
      commitCurrentValue(e.target);
    };

    input.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCurrentValue(e.target);
        e.target.blur();
      }
    };
  }

  wrap.appendChild(input);
  return wrap;
}

function renderMultiSelect(label, key, options, selectedValues, onApply, isHall = false) {
  const wrap = document.createElement('div');
  wrap.className = 'field field--left multi-select-wrap';
  wrap.innerHTML = `<label>${label}</label>`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'multi-toggle';

  const allLabel = isHall ? 'All halls' : 'All zones';
  let text = allLabel;

  if (selectedValues.length && selectedValues.length !== options.length) {
    text = `${selectedValues.length} selected`;
  }

  if (!options.length) {
    text = isHall ? 'No halls available' : allLabel;
  }

  button.textContent = text;
  button.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    state.openMultiKey = state.openMultiKey === key ? null : key;
    render();
  };

  wrap.appendChild(button);

  if (state.openMultiKey === key) {
    const panel = document.createElement('div');
    panel.className = 'multi-panel';
    panel.dataset.multiKey = key;
    panel.onclick = e => e.stopPropagation();
    panel.onscroll = () => {
      state.multiScrollTopByKey[key] = panel.scrollTop;
    };

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'ghost-btn small-btn multi-panel__select-all';

    const allSelected = options.length > 0 && selectedValues.length === options.length;
    allBtn.textContent = allSelected ? 'Clear all' : 'Select all';
    allBtn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      state.multiScrollTopByKey[key] = panel.scrollTop;
      onApply(allSelected ? [] : options.map(opt => opt.value));
    };

    panel.appendChild(allBtn);

    options.forEach(opt => {
      const row = document.createElement('label');
      row.className = 'check-row';

      const checked = selectedValues.includes(opt.value);
      row.innerHTML = `
        <input type="checkbox" ${checked ? 'checked' : ''} />
        <span class="check-row__label">${opt.label}</span>
      `;

      row.querySelector('input').onchange = ev => {
        state.multiScrollTopByKey[key] = panel.scrollTop;
        const next = ev.target.checked
          ? [...new Set([...selectedValues, opt.value])]
          : selectedValues.filter(v => v !== opt.value);

        onApply(next);
      };

      panel.appendChild(row);
    });

    wrap.appendChild(panel);

    requestAnimationFrame(() => {
      panel.scrollTop = state.multiScrollTopByKey[key] || 0;
    });
  }

  return wrap;
}

function toggleQuickActions() {
  state.quickActionsCollapsed = !state.quickActionsCollapsed;
  renderQuickControls();
}

function renderQuickControls() {
  el.actionArea.innerHTML = '';

  const box = document.createElement('div');
  box.className = `card quick-card${state.quickActionsCollapsed ? ' is-collapsed' : ''}`;

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'quick-card__header';
  header.setAttribute('aria-expanded', String(!state.quickActionsCollapsed));
  header.innerHTML = `
    <span>Quick actions</span>
    <span class="quick-card__chevron" aria-hidden="true">⌃</span>
  `;
  header.onclick = toggleQuickActions;

  const body = document.createElement('div');
  body.className = 'quick-card__body';
  body.setAttribute('aria-hidden', String(state.quickActionsCollapsed));

  const row = document.createElement('div');
  row.className = 'chip-row quick-card__actions';

  const save = document.createElement('button');
  save.className = `primary-btn ${canSaveCurrentView() ? 'success-btn' : 'danger-btn'}`;
  save.textContent = 'Save this view';
  save.onclick = async () => {
    if (!canSaveCurrentView()) {
      state.saveIntent = 'error';
      state.validationMessage = 'Please select a query before saving';
      render();
      scrollToForm();
      await showSaveWarning();
      return;
    }
    showSaveViewBar();
  };

  const restart = document.createElement('button');
  restart.className = 'ghost-btn';
  restart.textContent = 'Start another analysis';
  restart.onclick = backToActions;

  const guide = document.createElement('button');
  guide.className = 'ghost-btn';
  guide.textContent = 'Open user guide';
  guide.onclick = () => window.open('/docs-static/operations_widget_guide.html', '_blank');

  row.append(save, restart, guide);
  body.appendChild(row);

  box.appendChild(body);
  box.appendChild(header);
  el.actionArea.appendChild(box);
}


window.addEventListener('message', event => {
  const data = event.data || {};
  if (!data || typeof data !== 'object') return;

  if (data.type === 'sentina-assistant:set-expanded') {
    setExpanded(data.expanded, false);
  }

  if (data.type === 'sentina-assistant:toggle-expanded') {
    toggleExpanded();
  }
});

/* ---- Final patch: scroll to top of generated cards, click-away quick actions close, real slide animation hooks ---- */
state.quickActionsCollapsed = typeof state.quickActionsCollapsed === 'boolean' ? state.quickActionsCollapsed : true;
state.multiScrollTopByKey = state.multiScrollTopByKey || {};

function scrollConversationToElement(targetOrSelector, offset = 14) {
  requestAnimationFrame(() => {
    const target = typeof targetOrSelector === 'string'
      ? el.conversation.querySelector(targetOrSelector)
      : targetOrSelector;

    if (!target || !el.conversation) return;

    const conversationRect = el.conversation.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop = el.conversation.scrollTop + (targetRect.top - conversationRect.top) - offset;

    el.conversation.scrollTo({
      top: Math.max(0, nextTop),
      behavior: 'smooth',
    });
  });
}

function scrollToGeneratedCardTop(runIndex, offset = 14) {
  scrollConversationToElement(`.result-card[data-run-index="${runIndex}"]`, offset);
}

function scrollToActiveFormTop(offset = 14) {
  scrollConversationToElement('#activeFormCard', offset);
}

function startAction(actionLabel) {
  state.activeTabId = 'draft';
  const request = defaultRequest(actionLabel);
  state.analysisByTab.draft = {
    action: actionLabel,
    request,
    runs: [],
    isEditingForm: true,
    loadedMessage: '',
    dateDrafts: {
      start_date: toInputDate(request.start_date),
      end_date: toInputDate(request.end_date),
    },
  };
  state.openMultiKey = null;
  state.validationMessage = '';
  state.saveIntent = 'idle';
  hideSaveViewBar();
  render();
  scrollToActiveFormTop(12);
}

async function runAnalysis() {
  const view = getActiveAnalysis();
  if (!view.request?.start_date || !view.request?.end_date) {
    state.saveIntent = 'error';
    state.validationMessage = 'Choose a valid date range.';
    render();
    scrollToForm();
    return;
  }

  const req = JSON.parse(JSON.stringify(view.request));
  const primary = await api('/assistant/widget/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  const results = [primary];
  const shouldAutoAppendComparison = state.role !== 'EXHIBITOR'
    && req.compare_with
    && req.compare_with !== 'none'
    && !isComparisonType(req.analysis_type);

  if (shouldAutoAppendComparison) {
    const comparisonType = state.role === 'SUSTAINABILITY' ? 'sus_time_comparison' : 'time_comparison';
    const comparisonReq = { ...req, analysis_type: comparisonType };
    const comparison = await api('/assistant/widget/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(comparisonReq),
    });
    results.push(comparison);
  }

  view.runs.push({
    request: req,
    results,
    ranAt: new Date().toISOString(),
    fromSavedView: false,
  });

  const newRunIndex = view.runs.length - 1;

  view.isEditingForm = false;
  view.loadedMessage = '';
  state.validationMessage = '';
  state.saveIntent = 'idle';
  render();
  scrollToGeneratedCardTop(newRunIndex, 12);
}

function renderResultCard(result, runIndex) {
  const card = document.createElement('div');
  card.className = 'card result-card assistant-card';
  card.dataset.runIndex = String(runIndex);
  card.innerHTML = `<h3>${result.title || 'Result'}</h3><p>${result.summary || ''}</p>`;

  if (result.response_type === 'summary_card') card.appendChild(renderSummaryCard(result.data));
  if (result.response_type === 'table_card') card.appendChild(renderTableCard(result.data));
  if (result.response_type === 'chart_card') card.appendChild(renderChartCard(result.data));

  const chips = document.createElement('div');
  chips.className = 'chip-row result-chip-row';

  const edit = document.createElement('button');
  edit.className = 'ghost-btn small-btn';
  edit.textContent = 'Edit scope';
  edit.onclick = () => {
    const view = getActiveAnalysis();
    view.isEditingForm = true;
    state.validationMessage = '';
    render();
    scrollToActiveFormTop(12);
  };
  chips.appendChild(edit);

  (result.follow_up_actions || []).slice(0, 2).forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = item.label;
    btn.onclick = async () => {
      const view = getActiveAnalysis();
      view.request = {
        ...view.request,
        ...item.payload,
        user_id: state.userId,
        user_name: state.userName,
        role: state.role,
        session_id: state.sessionId,
      };
      view.action = inferActionLabel(view.request.analysis_type);
      view.isEditingForm = false;
      await runAnalysis();
    };
    chips.appendChild(btn);
  });

  card.appendChild(chips);
  return card;
}

function buildQuickActionsCard() {
  const box = document.createElement('div');
  box.className = 'card quick-card';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'quick-card__header';
  header.innerHTML = `
    <span>Quick actions</span>
    <span class="quick-card__chevron" aria-hidden="true">⌃</span>
  `;
  header.onclick = event => {
    event.stopPropagation();
    toggleQuickActions();
  };

  const body = document.createElement('div');
  body.className = 'quick-card__body';
  body.onclick = event => event.stopPropagation();

  const row = document.createElement('div');
  row.className = 'chip-row quick-card__actions';

  const save = document.createElement('button');
  save.dataset.action = 'save-view';
  save.textContent = 'Save this view';
  save.onclick = async () => {
    if (!canSaveCurrentView()) {
      state.saveIntent = 'error';
      state.validationMessage = 'Please select a query before saving';
      render();
      scrollToForm();
      await showSaveWarning();
      return;
    }
    showSaveViewBar();
  };

  const restart = document.createElement('button');
  restart.className = 'ghost-btn';
  restart.textContent = 'Start another analysis';
  restart.onclick = backToActions;

  const guide = document.createElement('button');
  guide.className = 'ghost-btn';
  guide.textContent = 'Open user guide';
  guide.onclick = () => window.open('/docs-static/operations_widget_guide.html', '_blank');

  row.append(save, restart, guide);
  body.appendChild(row);
  box.append(body, header);
  return box;
}

function syncQuickActionsCard() {
  if (!el.actionArea) return;

  let box = el.actionArea.querySelector('.quick-card');
  if (!box) {
    el.actionArea.innerHTML = '';
    box = buildQuickActionsCard();
    el.actionArea.appendChild(box);
  }

  box.classList.toggle('is-collapsed', state.quickActionsCollapsed);

  const header = box.querySelector('.quick-card__header');
  const body = box.querySelector('.quick-card__body');
  const save = box.querySelector('[data-action="save-view"]');

  if (header) {
    header.setAttribute('aria-expanded', String(!state.quickActionsCollapsed));
  }

  if (body) {
    body.setAttribute('aria-hidden', String(state.quickActionsCollapsed));
  }

  if (save) {
    save.className = `primary-btn ${canSaveCurrentView() ? 'success-btn' : 'danger-btn'}`;
  }
}

function renderQuickControls() {
  syncQuickActionsCard();
}

function toggleQuickActions(forceValue) {
  const nextValue = typeof forceValue === 'boolean'
    ? forceValue
    : !state.quickActionsCollapsed;

  if (nextValue === state.quickActionsCollapsed) return;
  state.quickActionsCollapsed = nextValue;
  syncQuickActionsCard();
}

if (!window.__sentinaQuickActionsOutsideCloseBound) {
  window.__sentinaQuickActionsOutsideCloseBound = true;
  document.addEventListener('click', event => {
    if (state.quickActionsCollapsed) return;
    if (event.target.closest('.quick-card')) return;
    toggleQuickActions(true);
  });
}


/* ---- Final patch: side-panel-only delete, opened saved-view tabs only, top-tab close icon ---- */

function trashIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M9 7V5.8c0-.9.7-1.6 1.6-1.6h2.8c.9 0 1.6.7 1.6 1.6V7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7.2 7l.8 11.1c.1.9.8 1.5 1.7 1.5h4.6c.9 0 1.6-.7 1.7-1.5L16.8 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 10.2v6.2M14 10.2v6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;
}

function closeIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
    </svg>
  `;
}

function syncTabs() {
  const fixed = { id: 'draft', name: 'Current analysis', type: 'draft' };
  const activeSavedView = state.savedViews.find(view => view.view_id === state.activeTabId);

  state.tabs = activeSavedView
    ? [fixed, { id: activeSavedView.view_id, name: activeSavedView.name, type: 'saved-open' }]
    : [fixed];

  const allowed = new Set(['draft', ...state.savedViews.map(view => view.view_id)]);
  Object.keys(state.analysisByTab).forEach(tabId => {
    if (!allowed.has(tabId)) delete state.analysisByTab[tabId];
  });

  if (state.activeTabId !== 'draft' && !state.savedViews.some(view => view.view_id === state.activeTabId)) {
    state.activeTabId = 'draft';
  }
}

function closeSavedViewTab(tabId) {
  if (state.activeTabId === tabId) {
    state.activeTabId = 'draft';
  }
  state.validationMessage = '';
  state.saveIntent = 'idle';
  hideSaveViewBar();
  syncTabs();
  render();
}

function switchTab(tabId) {
  state.activeTabId = tabId;
  state.validationMessage = '';
  state.saveIntent = 'idle';
  hideSaveViewBar();

  if (tabId !== 'draft') {
    const view = state.savedViews.find(item => item.view_id === tabId);
    ensureSavedAnalysis(view);
  }

  syncTabs();
  render();
}

function loadSavedView(view) {
  ensureSavedAnalysis(view);
  state.activeTabId = view.view_id;
  syncTabs();
  render();
}

function renderTabs() {
  el.tabBar.innerHTML = '';

  state.tabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = `tab-chip ${tab.id === state.activeTabId ? 'active' : ''}${tab.type === 'saved-open' ? ' tab-chip--saved-open' : ''}`;
    btn.innerHTML = `<span class="tab-chip__label">${tab.name}</span>`;
    btn.onclick = () => switchTab(tab.id);

    if (tab.type === 'saved-open') {
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tab-close';
      closeBtn.setAttribute('aria-label', `Close ${tab.name}`);
      closeBtn.setAttribute('title', `Close ${tab.name}`);
      closeBtn.innerHTML = closeIconSvg();
      closeBtn.onclick = event => {
        event.stopPropagation();
        closeSavedViewTab(tab.id);
      };
      btn.appendChild(closeBtn);
    }

    el.tabBar.appendChild(btn);
  });
}

function renderSavedViewsPanel() {
  el.savedViewsList.innerHTML = '';

  state.savedViews.forEach(view => {
    const card = document.createElement('div');
    card.className = `saved-view-item ${view.view_id === state.activeTabId ? 'saved-view-item--active' : ''}`;
    card.innerHTML = `
      <div class="saved-view-item__top">
        <h4>${view.name}</h4>
        <button type="button" class="saved-view-delete" aria-label="Delete saved view" title="Delete saved view">
          ${trashIconSvg()}
        </button>
      </div>
      <p>${(view.view_payload?.results?.[0]?.title) || (view.view_payload?.action) || 'Saved analysis'}</p>
    `;

    card.onclick = () => loadSavedView(view);

    const deleteBtn = card.querySelector('.saved-view-delete');
    deleteBtn.onclick = event => {
      event.stopPropagation();
      deleteSavedView(view.view_id);
    };

    el.savedViewsList.appendChild(card);
  });
}

/* ---- Final patch: exhibitor multi-event selection with locked dates per selected event ---- */
state.assignments = Array.isArray(state.assignments) ? state.assignments : [];

function normalizeExhibitorAssignment(raw) {
  if (!raw) return null;
  return {
    exhibitor_id: String(raw.exhibitor_id ?? raw.exhibitorId ?? ''),
    exhibitor_name: String(raw.exhibitor_name ?? raw.exhibitorName ?? ''),
    event_id: String(raw.event_id ?? raw.eventId ?? ''),
    event_name: String(raw.event_name ?? raw.eventName ?? ''),
    event_start_date: String(raw.event_start_date ?? raw.eventStartDate ?? ''),
    event_end_date: String(raw.event_end_date ?? raw.eventEndDate ?? ''),
    booth_id: String(raw.booth_id ?? raw.boothId ?? ''),
    booth_code: String(raw.booth_code ?? raw.boothCode ?? ''),
    hall_id: String(raw.hall_id ?? raw.hallId ?? ''),
    hall_name: String(raw.hall_name ?? raw.hallName ?? ''),
    zone_id: String(raw.zone_id ?? raw.zoneId ?? ''),
    package_tier: raw.package_tier ?? raw.packageTier ?? null,
    amount_paid_aed: raw.amount_paid_aed ?? raw.amountPaidAed ?? null,
  };
}

function getExhibitorAssignments() {
  return Array.isArray(state.assignments) ? state.assignments : [];
}

function findExhibitorAssignment(eventId) {
  return getExhibitorAssignments().find(item => String(item.event_id) === String(eventId)) || null;
}

function getSelectedExhibitorAssignment() {
  if (state.role !== 'EXHIBITOR') return null;
  return normalizeExhibitorAssignment(state.assignment) || getExhibitorAssignments()[0] || null;
}

function getAssignmentForRequest(request) {
  if (state.role !== 'EXHIBITOR') return null;
  return findExhibitorAssignment(request?.event_id) || getSelectedExhibitorAssignment();
}

function syncSelectedAssignmentFromRequest(request) {
  const assignment = getAssignmentForRequest(request);
  if (assignment) {
    state.assignment = assignment;
  }
  return assignment;
}

async function boot() {
  state.bootstrap = await api(
    `/assistant/widget/bootstrap?user_id=${encodeURIComponent(state.userId)}&user_name=${encodeURIComponent(state.userName)}&role=${encodeURIComponent(state.role)}`
  );
  state.flowConfig = await api(`/assistant/widget/flow-config?role=${encodeURIComponent(state.role)}&user_id=${encodeURIComponent(state.userId)}`);
  state.assignments = state.role === 'EXHIBITOR'
    ? (state.bootstrap.assignments || []).map(normalizeExhibitorAssignment).filter(Boolean)
    : [];
  state.assignment = state.role === 'EXHIBITOR'
    ? (normalizeExhibitorAssignment(state.bootstrap.assignment) || state.assignments[0] || null)
    : (state.bootstrap.assignment || null);
  state.analysisByTab = { draft: makeEmptyAnalysisState() };
  await refreshSavedViews();
  applyRoleBranding();
  applyExpandedState();
  render();
}

function defaultRequest(actionLabel) {
  const assignment = state.role === 'EXHIBITOR'
    ? (getSelectedExhibitorAssignment() || {})
    : (state.bootstrap?.assignment || {});

  return {
    user_id: state.userId,
    user_name: state.userName,
    role: state.role,
    session_id: state.sessionId,
    analysis_type: analysisTypeForAction(actionLabel),
    metric: actionLabel === 'Trends' ? 'occupancy_trend' : null,
    scope_type: state.role === 'EXHIBITOR' ? 'assignment' : 'full_venue',
    zone_ids: state.role === 'EXHIBITOR' && assignment.zone_id ? [assignment.zone_id] : [],
    hall_ids: state.role === 'EXHIBITOR' && assignment.hall_id ? [assignment.hall_id] : [],
    time_range: 'custom',
    start_date: state.role === 'EXHIBITOR' ? assignment.event_start_date : state.bootstrap.earliest_available_date,
    end_date: state.role === 'EXHIBITOR' ? assignment.event_end_date : state.bootstrap.latest_available_date,
    compare_with: state.role === 'EXHIBITOR' && actionLabel === 'Comparison' ? 'event_average' : 'none',
    aggregation: 'hourly',
    event_id: state.role === 'EXHIBITOR' ? assignment.event_id : null,
    booth_id: state.role === 'EXHIBITOR' ? assignment.booth_id : null,
    limit: 5,
  };
}

function applyExhibitorEventSelection(eventId) {
  const assignment = findExhibitorAssignment(eventId);
  if (!assignment) return;

  state.assignment = assignment;
  updateRequest({
    scope_type: 'assignment',
    event_id: assignment.event_id,
    booth_id: assignment.booth_id,
    zone_ids: assignment.zone_id ? [assignment.zone_id] : [],
    hall_ids: assignment.hall_id ? [assignment.hall_id] : [],
    start_date: assignment.event_start_date,
    end_date: assignment.event_end_date,
  });
}

function switchTab(tabId) {
  state.activeTabId = tabId;
  state.validationMessage = '';
  state.saveIntent = 'idle';
  hideSaveViewBar();

  if (tabId !== 'draft') {
    const view = state.savedViews.find(item => item.view_id === tabId);
    const savedAnalysis = ensureSavedAnalysis(view);
    syncSelectedAssignmentFromRequest(savedAnalysis?.request);
  }

  render();
}

function buildInitialUserMessage(action) {
  const assignment = getSelectedExhibitorAssignment();
  if (state.role === 'EXHIBITOR' && assignment) {
    return `${action || 'Overview'} for ${assignment.booth_code} in ${assignment.event_name}`;
  }
  return action || 'Overview';
}

function buildRunUserMessage(action, request) {
  const parts = [];
  const assignment = getAssignmentForRequest(request);

  parts.push(action);

  if (request.scope_type === 'assignment' && assignment) {
    parts.push(`for booth ${assignment.booth_code}`);
  } else if (request.scope_type === 'full_venue') {
    parts.push('for full venue');
  } else {
    const zones = request.zone_ids?.length ? request.zone_ids.join(', ') : '';
    const halls = request.hall_ids?.length ? request.hall_ids.join(', ') : '';

    const scopeBits = [];
    if (zones) scopeBits.push(`zones ${zones}`);
    if (halls) scopeBits.push(`halls ${halls}`);

    if (scopeBits.length) {
      parts.push(`for ${scopeBits.join(' and ')}`);
    }
  }

  if (request.start_date && request.end_date) {
    parts.push(`from ${fmtDate(request.start_date)} to ${fmtDate(request.end_date)}`);
  }

  if (action === 'Trends' && request.metric) {
    parts.push(`using ${humanizeMetric(request.metric).toLowerCase()}`);
  }

  if (request.aggregation && state.role === 'EXHIBITOR') {
    parts.push(`with ${request.aggregation}`);
  }

  if (request.compare_with && request.compare_with !== 'none') {
    parts.push(`compared with ${request.compare_with.replaceAll('_', ' ')}`);
  }

  return parts.join(' ');
}

function buildRunSubtitle(request) {
  const assignment = getAssignmentForRequest(request);
  const scope = request.scope_type === 'assignment' && assignment
    ? `Booth ${assignment.booth_code}`
    : request.scope_type === 'custom'
      ? `${request.zone_ids?.length || 0} zone(s) · ${request.hall_ids?.length || 0} hall(s)`
      : 'Full venue';
  const dates = `${fmtDate(request.start_date)} → ${fmtDate(request.end_date)}`;
  const compare = request.compare_with && request.compare_with !== 'none'
    ? ` · Compared with ${request.compare_with.replaceAll('_', ' ')}`
    : '';
  return `${scope} · ${dates}${compare}`;
}

function renderConversation() {
  el.conversation.innerHTML = '';
  const view = getActiveAnalysis();
  const currentAssignment = state.role === 'EXHIBITOR'
    ? (getAssignmentForRequest(view.request) || getSelectedExhibitorAssignment())
    : null;

  const intro = document.createElement('div');
  intro.className = 'card intro-card assistant-card';
  intro.innerHTML = `
    <h3>${state.bootstrap.greeting.title}</h3>
    <p>${state.bootstrap.greeting.message}</p>
    <p class="helper">Choose one to begin.</p>
  `;
  const chips = document.createElement('div');
  chips.className = 'chip-row large-gap';
  state.bootstrap.primary_actions.forEach(action => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = action.label;
    btn.onclick = () => startAction(action.label);
    chips.appendChild(btn);
  });
  intro.appendChild(chips);
  el.conversation.appendChild(intro);

  if (state.role === 'EXHIBITOR' && currentAssignment) {
    const assignmentCard = document.createElement('div');
    assignmentCard.className = 'card assistant-card';
    assignmentCard.innerHTML = `
      <h3>Selected booth</h3>
      <p><strong>${currentAssignment.event_name}</strong> · Booth ${currentAssignment.booth_code}</p>
      <p>${currentAssignment.hall_name} · ${currentAssignment.zone_id} · ${fmtDate(currentAssignment.event_start_date)} to ${fmtDate(currentAssignment.event_end_date)}</p>
    `;
    el.conversation.appendChild(assignmentCard);
  }

  if (!view.action || !view.request) return;
  el.conversation.appendChild(renderUserBubble(buildInitialUserMessage(view.action)));

  if (view.loadedMessage) {
    const loaded = document.createElement('div');
    loaded.className = 'status-inline status-inline--success';
    loaded.textContent = view.loadedMessage;
    el.conversation.appendChild(loaded);
  }

  if (view.isEditingForm) {
    el.conversation.appendChild(renderFormCard(view));
  }

  view.runs.forEach((run, index) => {
    el.conversation.appendChild(renderUserBubble(buildRunUserMessage(view.action, run.request)));
    run.results.forEach(result => {
      el.conversation.appendChild(renderResultCard(result, index));
    });
  });
}

function renderFormCard(view) {
  const card = document.createElement('div');
  card.className = 'card form-card assistant-card';
  card.id = 'activeFormCard';
  const request = view.request;
  const dateDrafts = ensureDateDrafts(view);
  const currentAssignment = getAssignmentForRequest(request) || getSelectedExhibitorAssignment();
  card.innerHTML = `<h3>${view.action}</h3><p>Set up ${view.action.toLowerCase()}. Complete the form below.</p>`;

  if (state.validationMessage) {
    const note = document.createElement('div');
    note.className = `status-note ${state.saveIntent === 'error' ? 'status-error' : 'status-success'}`;
    note.textContent = state.validationMessage;
    card.appendChild(note);
  }

  const grid = document.createElement('div');
  grid.className = 'form-grid';

  if (state.role === 'EXHIBITOR' && currentAssignment) {
    const eventOptions = getExhibitorAssignments().map(item => ({
      value: item.event_id,
      label: `${item.event_name} · Booth ${item.booth_code}`,
    }));

    if (eventOptions.length > 1) {
      grid.appendChild(
        renderSelect('Event', currentAssignment.event_id, eventOptions, value => applyExhibitorEventSelection(value))
      );
    }

    const assignmentField = document.createElement('div');
    assignmentField.className = 'field field--full';
    assignmentField.innerHTML = `<label>Assignment</label><div class="assignment-box">${currentAssignment.event_name}<br/>Booth ${currentAssignment.booth_code} · ${currentAssignment.hall_name} · ${currentAssignment.zone_id}</div>`;
    grid.appendChild(assignmentField);

    const aggOptions = state.flowConfig.steps.find(s => s.id === 'aggregation')?.options || [
      { value: 'hourly', label: 'Hourly' },
      { value: 'daily', label: 'Daily' },
    ];
    grid.appendChild(renderSelect('Aggregation', request.aggregation || 'hourly', aggOptions, value => updateRequest({ aggregation: value })));
  } else {
    grid.appendChild(renderSelect('Scope', request.scope_type, [
      { value: 'full_venue', label: 'Full venue' },
      { value: 'custom', label: 'Zone / hall' },
    ], value => updateRequest({ scope_type: value })));

    if (request.scope_type === 'custom') {
      const zoneOptions = state.flowConfig.steps.find(s => s.id === 'zone_ids').options || [];
      const hallOptions = request.zone_ids.length ? request.zone_ids.flatMap(z => buildHallMap()[z] || []) : [];

      grid.appendChild(renderMultiSelect('Zones', 'zones', zoneOptions, request.zone_ids, ids => updateRequest({ zone_ids: ids })));
      grid.appendChild(renderMultiSelect('Halls', 'halls', hallOptions, request.hall_ids, ids => updateRequest({ hall_ids: ids }), true));
    }
  }

  const dateRow = document.createElement('div');
  dateRow.className = 'date-row';
  const minDate = state.role === 'EXHIBITOR' ? currentAssignment?.event_start_date : state.bootstrap.earliest_available_date;
  const maxDate = state.role === 'EXHIBITOR' ? currentAssignment?.event_end_date : state.bootstrap.latest_available_date;
  dateRow.appendChild(renderDateField('Start date', 'start_date', dateDrafts.start_date, minDate, maxDate));
  dateRow.appendChild(renderDateField('End date', 'end_date', dateDrafts.end_date, minDate, maxDate));
  grid.appendChild(dateRow);

  if (view.action === 'Trends') {
    grid.appendChild(renderSelect(
      'Trend metric',
      request.metric || 'occupancy_trend',
      state.flowConfig.steps.find(s => s.id === 'metric').options,
      value => updateRequest({ metric: value })
    ));
  }

  const shouldShowCompare = state.role !== 'EXHIBITOR' || view.action === 'Comparison';
  if (shouldShowCompare) {
    const compareOptions = state.flowConfig.steps.find(s => s.id === 'compare_with')?.options || [
      { value: 'none', label: 'No comparison' },
      { value: 'yesterday', label: 'Previous day' },
      { value: 'last_7_days', label: 'Previous 7 days' },
    ];
    grid.appendChild(renderSelect('Compare with', request.compare_with || 'none', compareOptions, value => updateRequest({ compare_with: value })));
  }

  card.appendChild(grid);

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const runBtn = document.createElement('button');
  runBtn.className = 'primary-btn';
  runBtn.textContent = 'Run analysis';
  runBtn.onclick = runAnalysis;

  const backBtn = document.createElement('button');
  backBtn.className = 'ghost-btn';
  backBtn.textContent = 'Back to actions';
  backBtn.onclick = backToActions;

  actions.append(runBtn, backBtn);
  card.appendChild(actions);
  return card;
}

function renderDateField(label, fieldKey, value, minDate = '', maxDate = '') {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML = `<label>${label}</label>`;

  const input = document.createElement('input');
  input.type = 'date';
  input.autocomplete = 'off';
  input.className = 'guided-input guided-input--date';
  input.value = value || '';
  input.dataset.dateField = fieldKey;
  input.setAttribute('aria-label', label);

  if (minDate) {
    input.min = minDate;
    input.dataset.minDate = minDate;
  }
  if (maxDate) {
    input.max = maxDate;
    input.dataset.maxDate = maxDate;
  }

  const isLockedForExhibitor = state.role === 'EXHIBITOR';
  if (isLockedForExhibitor) {
    input.disabled = true;
    input.classList.add('guided-input--locked');
    input.setAttribute('aria-disabled', 'true');
    input.title = 'Date is locked to the selected event.';
  } else {
    const commitCurrentValue = target => {
      commitDateDraft(fieldKey, target.value, minDate, maxDate);
    };

    input.oninput = e => {
      setDateDraft(fieldKey, e.target.value);
      state.validationMessage = '';
      state.saveIntent = 'idle';
    };

    input.onblur = e => {
      commitCurrentValue(e.target);
    };

    input.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCurrentValue(e.target);
        e.target.blur();
      }
    };
  }

  wrap.appendChild(input);
  return wrap;
}
