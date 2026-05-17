'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const twitchStatus     = document.getElementById('twitch-status');
const syncBadge        = document.getElementById('sync-badge');
const errorBanner      = document.getElementById('error-banner');
const channelList      = document.getElementById('channel-list');
const channelInput     = document.getElementById('channel-input');
const btnSetChannel    = document.getElementById('btn-set-channel');
const lastSyncEl       = document.getElementById('last-sync');
const nextSyncEl       = document.getElementById('next-sync');
const btnSync          = document.getElementById('btn-sync');
const btnInvite        = document.getElementById('btn-invite');
const cgList               = document.getElementById('cg-list');
const sidebarChRow         = document.getElementById('sidebar-ch-row');
const sidebarChannelSelector = document.getElementById('sidebar-channel-selector');
const sidebarChAvatar      = document.getElementById('sidebar-ch-avatar');
const scheduleChAvatar     = document.getElementById('schedule-ch-avatar');
const logPanel         = document.getElementById('log-panel');
const btnScrollTop     = document.getElementById('btn-scroll-top');
const btnClearLogs     = document.getElementById('btn-clear-logs');
const mainTitle        = document.getElementById('main-title');
const mainAvatar       = document.getElementById('main-avatar');
const titleTemplateEl    = document.getElementById('title-template');
const descTemplateEl     = document.getElementById('desc-template');
const titleCountEl       = document.getElementById('title-count');
const descCountEl        = document.getElementById('desc-count');
const imageTypeEl        = document.getElementById('image-type');
const maxEventsEl        = document.getElementById('max-events');
const btnSaveSettings    = document.getElementById('btn-save-settings');
const settingsSavedEl    = document.getElementById('settings-saved');
const applyAllServers    = document.getElementById('apply-all-servers');
const channelSelector    = document.getElementById('channel-selector');
const guildSelector      = document.getElementById('guild-selector');
const scheduleEmpty      = document.getElementById('schedule-empty');
const scheduleForm       = document.getElementById('schedule-form');
const scheduleNoGuild    = document.getElementById('schedule-no-guild');
const scheduleFields     = document.getElementById('schedule-fields');

const TITLE_MAX = 100;
const DESC_MAX = 940;
const descToolbar = document.getElementById('desc-toolbar');

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(isoStr) {
  if (!isoStr) return 'Never';
  const diff = Date.now() - new Date(isoStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function timeIn(isoStr) {
  if (!isoStr) return '—';
  const diff = new Date(isoStr).getTime() - Date.now();
  if (diff <= 0) return 'soon';
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function showError(msg) {
  if (!msg) { errorBanner.style.display = 'none'; return; }
  errorBanner.textContent = msg;
  errorBanner.style.display = 'block';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function guildInitial(name) {
  const t = String(name || '').trim();
  if (!t) return '?';
  const ch = t[0];
  return /[a-zA-Z0-9]/.test(ch) ? ch.toUpperCase() : '#';
}

function updateCharCounts() {
  titleCountEl.textContent = String(titleTemplateEl.value.length);
  descCountEl.textContent = String(descTemplateEl.value.length);
}

function clampTemplatesToLimits() {
  if (titleTemplateEl.value.length > TITLE_MAX) {
    titleTemplateEl.value = titleTemplateEl.value.slice(0, TITLE_MAX);
  }
  if (descTemplateEl.value.length > DESC_MAX) {
    descTemplateEl.value = descTemplateEl.value.slice(0, DESC_MAX);
  }
  updateCharCounts();
}

// ── Shared channel + guild selection state ────────────────────────────────────
let activeChannelId    = null;   // shared between sidebar and schedule tab
let selectedGuildId    = null;
let cachedChannels     = [];
let cachedGuilds       = [];
let cachedChannelLinks = {};

function updateAllChannelAvatars() {
  const ch = cachedChannels.find(c => c.broadcaster_id === activeChannelId);
  const url = (ch && ch.profile_image_url) ? ch.profile_image_url : '';

  for (const el of [sidebarChAvatar, scheduleChAvatar]) {
    if (url) { el.src = url; el.style.display = ''; }
    else      { el.style.display = 'none'; }
  }
}

function updateSaveBtnText() {
  const linkedCount = (cachedChannelLinks[activeChannelId] || []).length;
  btnSaveSettings.textContent = applyAllServers.checked && linkedCount > 1
    ? `Save to all ${linkedCount} servers`
    : 'Save settings';
}

function setActiveChannel(id) {
  activeChannelId = id;
  selectedGuildId = null;
  applyAllServers.checked = false;
  updateSaveBtnText();
  if (channelSelector.value !== id) channelSelector.value = id;
  if (sidebarChannelSelector.value !== id) sidebarChannelSelector.value = id;
  updateAllChannelAvatars();
  renderSidebarGuilds();
  refreshGuildSelector(true);
}

function updateScheduleSelectors(channels, guilds, channelLinks) {
  cachedChannels = channels || [];
  cachedGuilds = guilds || [];
  cachedChannelLinks = channelLinks || {};

  if (!channels || channels.length === 0) {
    scheduleEmpty.style.display = '';
    scheduleForm.style.display  = 'none';
    return;
  }

  scheduleEmpty.style.display = 'none';
  scheduleForm.style.display  = '';

  const channelIds = channels.map(c => c.broadcaster_id);

  if (channelSelector.options.length !== channels.length ||
      [...channelSelector.options].some((o, i) => o.value !== channelIds[i])) {
    channelSelector.innerHTML = channels.map(c =>
      `<option value="${escHtml(c.broadcaster_id)}">twitch.tv/${escHtml(c.broadcaster_name)}</option>`
    ).join('');
  }

  if (!activeChannelId || !channelIds.includes(activeChannelId)) {
    activeChannelId = channelIds[0];
    selectedGuildId = null;
    channelSelector.value = activeChannelId;
    if (sidebarChannelSelector.value !== activeChannelId) sidebarChannelSelector.value = activeChannelId;
    updateAllChannelAvatars();
    refreshGuildSelector(true);
  } else {
    channelSelector.value = activeChannelId;
    refreshGuildSelector(false);
  }
}

function refreshGuildSelector(forceReload) {
  const linkedGuildIds = cachedChannelLinks[activeChannelId] || [];
  const guildMap = Object.fromEntries(cachedGuilds.map(g => [g.guild_id, g]));
  const linkedGuilds = linkedGuildIds.map(id => guildMap[id]).filter(Boolean);

  if (linkedGuilds.length === 0) {
    guildSelector.innerHTML = '';
    selectedGuildId = null;
    scheduleNoGuild.style.display = '';
    scheduleFields.style.display  = 'none';
    return;
  }

  scheduleNoGuild.style.display = 'none';
  scheduleFields.style.display  = '';

  const guildIds = linkedGuilds.map(g => g.guild_id);

  if (guildSelector.options.length !== linkedGuilds.length ||
      [...guildSelector.options].some((o, i) => o.value !== guildIds[i])) {
    guildSelector.innerHTML = linkedGuilds.map(g =>
      `<option value="${escHtml(g.guild_id)}">${escHtml(g.name)}</option>`
    ).join('');
  }

  if (!selectedGuildId || !guildIds.includes(selectedGuildId)) {
    selectedGuildId = guildIds[0];
    guildSelector.value = selectedGuildId;
    loadLinkSettings(activeChannelId, selectedGuildId);
  } else if (forceReload) {
    guildSelector.value = selectedGuildId;
    loadLinkSettings(activeChannelId, selectedGuildId);
  } else {
    guildSelector.value = selectedGuildId;
  }
}

async function loadLinkSettings(broadcasterId, guildId) {
  try {
    const res = await fetch(`/api/channels/${broadcasterId}/guilds/${guildId}/settings`);
    if (!res.ok) return;
    const s = await res.json();
    titleTemplateEl.value = s.title_template;
    descTemplateEl.value  = s.description_template;
    imageTypeEl.value     = s.image_type;
    maxEventsEl.value     = String(s.max_events);
    clampTemplatesToLimits();
  } catch (_) {}
}

async function toggleChannelGuild(broadcasterId, guildId, checkbox) {
  checkbox.disabled = true;
  try {
    const res = await fetch(`/api/channels/${broadcasterId}/guilds/${guildId}/toggle`, { method: 'POST' });
    if (!res.ok) { checkbox.checked = !checkbox.checked; }
    else await pollStatus();
  } catch (_) { checkbox.checked = !checkbox.checked; }
  finally { checkbox.disabled = false; }
}
window.toggleChannelGuild = toggleChannelGuild;

channelSelector.addEventListener('change', () => setActiveChannel(channelSelector.value));

guildSelector.addEventListener('change', () => {
  selectedGuildId = guildSelector.value;
  applyAllServers.checked = false;
  updateSaveBtnText();
  if (activeChannelId && selectedGuildId) {
    loadLinkSettings(activeChannelId, selectedGuildId);
  }
});

// ── Tabs ───────────────────────────────────────────────────────────────────────
function setTab(name) {
  document.querySelectorAll('.nav-item[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === name);
  });
  ['overview', 'schedule', 'logs'].forEach(id => {
    const panel = document.getElementById(`panel-${id}`);
    if (!panel) return;
    const active = id === name;
    panel.classList.toggle('active', active);
    if (active) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
  });
}

document.querySelectorAll('.nav-item[data-tab]').forEach(el => {
  el.addEventListener('click', () => setTab(el.dataset.tab));
});

// ── Status polling ────────────────────────────────────────────────────────────
let lastStatusKey = '';

async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();

    const connected = data.twitchConnected;
    twitchStatus.className = connected ? 'pill connected' : 'pill disconnected';
    if (connected && data.channels.length === 1 && data.channels[0].profile_image_url) {
      const ch = data.channels[0];
      twitchStatus.innerHTML = `<img src="${escHtml(ch.profile_image_url)}" class="status-avatar" alt="" onerror="this.remove()"><span>${escHtml(ch.display_name)}</span>`;
    } else {
      twitchStatus.textContent = connected
        ? (data.channels.length === 1 ? data.channels[0].display_name : `${data.channels.length} channels`)
        : 'Not connected';
    }

    btnSync.disabled = !connected || data.syncInProgress;
    syncBadge.style.display = data.syncInProgress ? '' : 'none';

    lastSyncEl.textContent = timeAgo(data.lastSync);
    nextSyncEl.textContent = connected ? timeIn(data.nextSync) : '—';

    const statusKey = JSON.stringify({ ch: data.channels, g: data.guilds, cl: data.channelLinks });
    if (statusKey !== lastStatusKey) {
      lastStatusKey = statusKey;
      renderChannels(data.channels);
      updateScheduleSelectors(data.channels, data.guilds, data.channelLinks || {});
      updateSidebarSelector(data.channels);
      renderSidebarGuilds();
    }
  } catch (e) {
    showError('Could not reach server: ' + e.message);
  }
}

function renderChannels(channels) {
  for (const t of pendingRemovals.values()) clearTimeout(t);
  pendingRemovals.clear();
  if (!channels || channels.length === 0) {
    channelList.innerHTML = '<div class="channel-empty">No channels added yet.</div>';
    return;
  }
  channelList.innerHTML = channels.map(c => {
    const avatarHtml = c.profile_image_url
      ? `<img class="channel-avatar" src="${escHtml(c.profile_image_url)}" alt="" onerror="this.style.display='none'">`
      : `<div class="channel-dot"></div>`;
    return `
    <div class="channel-row" id="channel-row-${escHtml(c.broadcaster_id)}">
      ${avatarHtml}
      <div class="channel-name">${escHtml(c.display_name)}</div>
      <div class="channel-login">twitch.tv/${escHtml(c.broadcaster_name)}</div>
      <button type="button" class="btn-channel-sync" title="Sync this channel" onclick="syncChannel('${escHtml(c.broadcaster_id)}', this)">↻</button>
      <button type="button" class="btn-remove" title="Remove channel" onclick="removeChannel('${escHtml(c.broadcaster_id)}', this)">✕</button>
    </div>`;
  }).join('');
}

async function syncChannel(broadcasterId, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  showError('');
  try {
    const res = await fetch(`/api/channels/${broadcasterId}/sync`, { method: 'POST' });
    if (!res.ok) { const d = await res.json(); showError(d.error || 'Sync failed'); }
    else await pollStatus();
  } catch (e) {
    showError('Sync failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '↻';
  }
}
window.syncChannel = syncChannel;

const pendingRemovals = new Map();

async function removeChannel(broadcasterId, btn) {
  if (pendingRemovals.has(broadcasterId)) {
    clearTimeout(pendingRemovals.get(broadcasterId));
    pendingRemovals.delete(broadcasterId);
    btn.textContent = '✕';
    btn.classList.remove('btn-remove-confirm');
    btn.disabled = true;
    showError('');
    try {
      const res = await fetch(`/api/channels/${broadcasterId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); showError(d.error || 'Remove failed'); }
      else await pollStatus();
    } catch (e) {
      showError('Remove failed: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  } else {
    btn.textContent = 'Remove?';
    btn.classList.add('btn-remove-confirm');
    const t = setTimeout(() => {
      if (pendingRemovals.has(broadcasterId)) {
        pendingRemovals.delete(broadcasterId);
        btn.textContent = '✕';
        btn.classList.remove('btn-remove-confirm');
      }
    }, 3000);
    pendingRemovals.set(broadcasterId, t);
  }
}
window.removeChannel = removeChannel;

// ── Channel-guild sidebar ─────────────────────────────────────────────────────
function updateSidebarSelector(channels) {
  if (!channels || channels.length === 0) {
    sidebarChRow.style.display = 'none';
    cgList.innerHTML = '<div class="empty-state sidebar-empty">No channels configured</div>';
    return;
  }

  sidebarChRow.style.display = '';
  const ids = channels.map(c => c.broadcaster_id);

  if (sidebarChannelSelector.options.length !== channels.length ||
      [...sidebarChannelSelector.options].some((o, i) => o.value !== ids[i])) {
    sidebarChannelSelector.innerHTML = channels.map(c =>
      `<option value="${escHtml(c.broadcaster_id)}">twitch.tv/${escHtml(c.broadcaster_name)}</option>`
    ).join('');
  }

  sidebarChannelSelector.value = activeChannelId;
  updateAllChannelAvatars();
}

function renderSidebarGuilds() {
  if (!activeChannelId) return;

  const linkedIds = new Set(cachedChannelLinks[activeChannelId] || []);
  const allGuilds = cachedGuilds || [];

  if (allGuilds.length === 0) {
    cgList.innerHTML = '<div class="cg-guild-empty" style="padding:8px 10px">No servers found — add bot below.</div>';
    return;
  }

  const linked = allGuilds.filter(g => linkedIds.has(g.guild_id));

  if (linked.length === 0) {
    cgList.innerHTML = '<div class="empty-state sidebar-empty">No servers linked to this channel</div>';
    return;
  }

  const renderRow = g => {
    const iconHtml = g.icon
      ? `<img class="cg-guild-icon guild-avatar-img" src="${escHtml(g.icon)}" alt="">`
      : `<div class="cg-guild-icon cg-guild-letter">${escHtml(guildInitial(g.name))}</div>`;
    return `
    <div class="cg-guild-row" onclick="goToSchedule('${escHtml(activeChannelId)}','${escHtml(g.guild_id)}')">
      ${iconHtml}
      <span class="cg-guild-name">${escHtml(g.name)}</span>
      <label class="toggle" title="Unlink from this channel" onclick="event.stopPropagation()">
        <input type="checkbox" checked
          onchange="toggleChannelGuild('${escHtml(activeChannelId)}','${escHtml(g.guild_id)}',this)">
        <span class="toggle-slider"></span>
      </label>
    </div>`;
  };

  cgList.innerHTML = linked.map(renderRow).join('');
}

function goToSchedule(broadcasterId, guildId) {
  activeChannelId = broadcasterId;
  channelSelector.value = broadcasterId;
  selectedGuildId = guildId;
  refreshGuildSelector();
  setTab('schedule');
}
window.goToSchedule = goToSchedule;

sidebarChannelSelector.addEventListener('change', () => setActiveChannel(sidebarChannelSelector.value));

// ── Log polling ───────────────────────────────────────────────────────────────
let lastLogId = -1;
let autoScroll = true;

logPanel.addEventListener('scroll', () => {
  autoScroll = logPanel.scrollHeight - logPanel.scrollTop - logPanel.clientHeight < 40;
});

btnScrollTop.addEventListener('click', () => {
  logPanel.scrollTop = 0;
  autoScroll = false;
});

btnClearLogs.addEventListener('click', async () => {
  if (!confirm('Clear all log entries?')) return;
  try {
    await fetch('/api/logs', { method: 'DELETE' });
    lastLogId = -1;
    logPanel.innerHTML = '<div class="empty-state">No log entries yet.</div>';
  } catch (e) {
    showError('Could not clear logs: ' + e.message);
  }
});

async function pollLogs() {
  try {
    const res = await fetch('/api/logs?limit=200');
    if (!res.ok) return;
    const logs = await res.json();
    if (!logs.length || logs[0].id === lastLogId) return;
    lastLogId = logs[0].id;

    logPanel.innerHTML = logs.slice().reverse().map(entry => {
      const d = new Date(entry.ts);
      const ts = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `<div class="log-entry">
        <span class="log-ts">${escHtml(ts)}</span>
        <span class="log-level ${escHtml(entry.level)}" title="${escHtml(entry.level.toUpperCase())}"></span>
        <div class="log-body">
          <div class="log-msg" title="${escHtml(entry.message)}">${escHtml(entry.message)}</div>
          <div class="log-scope">${escHtml(entry.scope)}</div>
        </div>
      </div>`;
    }).join('');

    if (autoScroll) logPanel.scrollTop = logPanel.scrollHeight;
  } catch (_) {}
}

// ── Channel setup ─────────────────────────────────────────────────────────────
async function addChannel() {
  const name = channelInput.value.trim();
  if (!name) return;
  btnSetChannel.disabled = true;
  btnSetChannel.textContent = 'Adding…';
  showError('');
  try {
    const res = await fetch('/auth/twitch/channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName: name }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error ?? 'Failed to add channel');
    } else {
      channelInput.value = '';
      await pollStatus();
    }
  } catch (e) {
    showError('Request failed: ' + e.message);
  } finally {
    btnSetChannel.disabled = false;
    btnSetChannel.textContent = 'Add';
  }
}

btnSetChannel.addEventListener('click', addChannel);
channelInput.addEventListener('keydown', e => { if (e.key === 'Enter') addChannel(); });

// ── Sync ──────────────────────────────────────────────────────────────────────
async function triggerSync() {
  btnSync.disabled = true;
  showError('');
  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    if (!res.ok) { const d = await res.json(); showError(d.error || 'Sync failed'); }
  } catch (e) {
    showError('Sync request failed: ' + e.message);
  } finally {
    await pollStatus();
  }
}

btnSync.addEventListener('click', triggerSync);

btnInvite.addEventListener('click', async () => {
  showError('');
  try {
    const res = await fetch('/api/invite');
    if (!res.ok) { showError('Bot not ready yet.'); return; }
    const { url } = await res.json();
    await navigator.clipboard.writeText(url);
    const orig = btnInvite.textContent;
    btnInvite.textContent = 'Copied invite link';
    setTimeout(() => { btnInvite.textContent = orig; }, 2000);
  } catch (e) {
    showError('Could not copy invite link: ' + e.message);
  }
});

// ── Description template toolbar (markdown inserts) ───────────────────────────
function descInsertRaw(str) {
  const ta = descTemplateEl;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  const next = val.slice(0, start) + str + val.slice(end);
  if (next.length > DESC_MAX) return;
  ta.value = next;
  const pos = start + str.length;
  ta.setSelectionRange(pos, pos);
  updateCharCounts();
}

function descWrap(open, close) {
  const ta = descTemplateEl;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  const sel = val.slice(start, end);
  const mid = sel || 'text';
  const insert = open + mid + close;
  const next = val.slice(0, start) + insert + val.slice(end);
  if (next.length > DESC_MAX) return;
  ta.value = next;
  if (sel) {
    const pos = start + insert.length;
    ta.setSelectionRange(pos, pos);
  } else {
    ta.setSelectionRange(start + open.length, start + open.length + mid.length);
  }
  updateCharCounts();
}


function descInsertLink() {
  const ta = descTemplateEl;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  const sel = val.slice(start, end);
  const insert = sel ? `[${sel}](https://)` : '[text](https://)';
  const next = val.slice(0, start) + insert + val.slice(end);
  if (next.length > DESC_MAX) return;
  ta.value = next;
  if (!sel) {
    ta.setSelectionRange(start + 1, start + 5);
  } else {
    const pos = start + insert.length;
    ta.setSelectionRange(pos, pos);
  }
  updateCharCounts();
}

if (descToolbar) {
  descToolbar.addEventListener('mousedown', e => {
    if (e.target.closest('.fmt-btn')) e.preventDefault();
  });
  descToolbar.addEventListener('click', e => {
    const btn = e.target.closest('.fmt-btn');
    if (!btn) return;
    const fmt = btn.dataset.fmt;
    switch (fmt) {
      case 'channel': descInsertRaw('#'); break;
      case 'role': descInsertRaw('@'); break;
      case 'bold': descWrap('**', '**'); break;
      case 'italic': descWrap('*', '*'); break;
      case 'underline': descWrap('__', '__'); break;
      case 'strike': descWrap('~~', '~~'); break;
      case 'link': descInsertLink(); break;
      case 'code': descWrap('`', '`'); break;
      default: break;
    }
  });
}

// ── Settings (per connection) ─────────────────────────────────────────────────
titleTemplateEl.addEventListener('input', updateCharCounts);
descTemplateEl.addEventListener('input', updateCharCounts);
applyAllServers.addEventListener('change', updateSaveBtnText);

btnSaveSettings.addEventListener('click', async () => {
  if (!activeChannelId || !selectedGuildId) return;
  btnSaveSettings.disabled = true;
  settingsSavedEl.style.display = 'none';
  showError('');

  const payload = {
    title_template:       titleTemplateEl.value,
    description_template: descTemplateEl.value,
    image_type:           imageTypeEl.value,
    max_events:           maxEventsEl.value,
  };

  const targetGuildIds = applyAllServers.checked
    ? (cachedChannelLinks[activeChannelId] || [])
    : [selectedGuildId];

  try {
    const results = await Promise.all(
      targetGuildIds.map(gid =>
        fetch(`/api/channels/${activeChannelId}/guilds/${gid}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(r => r.ok ? null : r.json().then(d => d.error || 'Failed'))
      )
    );
    const errors = results.filter(Boolean);
    if (errors.length) {
      showError(errors[0]);
    } else {
      applyAllServers.checked = false;
      updateSaveBtnText();
      settingsSavedEl.style.display = '';
      setTimeout(() => { settingsSavedEl.style.display = 'none'; }, 2500);
    }
  } catch (e) {
    showError('Save failed: ' + e.message);
  } finally {
    btnSaveSettings.disabled = false;
  }
});

// ── Start polling ─────────────────────────────────────────────────────────────
pollStatus();
pollLogs();
updateCharCounts();
setInterval(pollStatus, 5000);
setInterval(pollLogs, 3000);
