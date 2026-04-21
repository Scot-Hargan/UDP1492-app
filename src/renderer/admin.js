// admin.js v0.1.3
(() => {
  'use strict';

  const platform = window.udp1492;
  const $ = (selector) => document.querySelector(selector);

  const adminOverviewStatusEl = $('#adminOverviewStatus');
  const adminRefreshStatusEl = $('#adminRefreshStatus');
  const adminRefreshMetaEl = $('#adminRefreshMeta');
  const adminErrorTextEl = $('#adminErrorText');
  const adminSessionStatusEl = $('#adminSessionStatus');
  const adminSessionMetaEl = $('#adminSessionMeta');
  const adminTransportStatusEl = $('#adminTransportStatus');
  const adminTransportMetaEl = $('#adminTransportMeta');
  const adminBackendStatusEl = $('#adminBackendStatus');
  const adminBackendMetaEl = $('#adminBackendMeta');
  const adminBackendCopyEl = $('#adminBackendCopy');
  const adminBackendFactsEl = $('#adminBackendFacts');
  const adminChannelsMetaEl = $('#adminChannelsMeta');
  const adminChannelsListEl = $('#adminChannelsList');
  const adminSlotsMetaEl = $('#adminSlotsMeta');
  const adminSlotsGridEl = $('#adminSlotsGrid');
  const adminEndpointsMetaEl = $('#adminEndpointsMeta');
  const adminEndpointTableBodyEl = $('#adminEndpointTable tbody');
  const adminNatMetaEl = $('#adminNatMeta');
  const adminNatStatusEl = $('#adminNatStatus');
  const adminNatSummaryEl = $('#adminNatSummary');
  const adminNatErrorEl = $('#adminNatError');
  const adminNatCandidateListEl = $('#adminNatCandidateList');
  const adminNatProbeListEl = $('#adminNatProbeList');
  const adminStatsMetaEl = $('#adminStatsMeta');
  const adminStatsGridEl = $('#adminStatsGrid');
  const adminRefreshAllBtn = $('#adminRefreshAllBtn');
  const adminRefreshChannelsBtn = $('#adminRefreshChannelsBtn');
  const adminRefreshPeersBtn = $('#adminRefreshPeersBtn');

  let snapshot = null;

  function formatTimestamp(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString();
  }

  function formatMetricValue(value, suffix = '') {
    return Number.isFinite(value) ? `${value}${suffix}` : '--';
  }

  function formatNatStatusLabel(status) {
    const normalized = String(status || 'idle').trim();
    if (!normalized) return 'Idle';
    return normalized
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function buildNatCandidateRows(nextSnapshot) {
    const slotStates = nextSnapshot?.managed?.nat?.slots || {};
    return ['A', 'B'].flatMap((slotId) => {
      const slotState = slotStates?.[slotId] || {};
      const localCandidates = Array.isArray(slotState.localCandidates) ? slotState.localCandidates : [];
      const publicCandidates = Array.isArray(slotState.publicCandidates) ? slotState.publicCandidates : [];
      return [...localCandidates, ...publicCandidates].map((candidate) => ({
        slotId,
        ...candidate
      }));
    });
  }

  function buildNatProbeRows(nextSnapshot) {
    return Object.entries(nextSnapshot?.managed?.nat?.probes || {})
      .map(([probeKey, probe]) => ({
        probeKey,
        ...(probe || {})
      }));
  }

  function setButtonBusyState(nextSnapshot) {
    const loadingAction = String(nextSnapshot?.adminSurface?.loadingAction || 'idle');
    const sessionOpen = !!nextSnapshot?.managed?.session?.sessionId;
    const joinedSlotCount = Number(nextSnapshot?.managed?.joinedSlotCount || 0);
    const busy = loadingAction !== 'idle';
    if (adminRefreshAllBtn) adminRefreshAllBtn.disabled = busy || !sessionOpen;
    if (adminRefreshChannelsBtn) adminRefreshChannelsBtn.disabled = busy || !sessionOpen;
    if (adminRefreshPeersBtn) adminRefreshPeersBtn.disabled = busy || joinedSlotCount === 0;
  }

  function renderEmptyState(message = 'Waiting for the main control window to publish an inspection snapshot.') {
    if (adminOverviewStatusEl) adminOverviewStatusEl.textContent = message;
    if (adminRefreshStatusEl) adminRefreshStatusEl.textContent = 'Waiting for snapshot';
    if (adminRefreshMetaEl) adminRefreshMetaEl.textContent = 'The admin surface is read-only and relays data from the main renderer.';
    if (adminSessionStatusEl) adminSessionStatusEl.textContent = 'No managed session';
    if (adminSessionMetaEl) adminSessionMetaEl.textContent = 'Managed session data has not been opened yet.';
    if (adminTransportStatusEl) adminTransportStatusEl.textContent = '0 active transport peers';
    if (adminTransportMetaEl) adminTransportMetaEl.textContent = 'Transport and peer-health summary will appear here.';
    if (adminBackendStatusEl) adminBackendStatusEl.textContent = 'No backend summary';
    if (adminBackendMetaEl) adminBackendMetaEl.textContent = 'Unavailable';
    if (adminBackendCopyEl) adminBackendCopyEl.textContent = 'Refresh channels or all data to request backend-authored admin facts.';
    if (adminBackendFactsEl) {
      adminBackendFactsEl.innerHTML = '';
      const item = document.createElement('li');
      item.className = 'managed-list-item';
      item.textContent = 'Backend-authored admin facts are not cached yet.';
      adminBackendFactsEl.appendChild(item);
    }
    if (adminChannelsMetaEl) adminChannelsMetaEl.textContent = 'No channels cached';
    if (adminChannelsListEl) {
      adminChannelsListEl.innerHTML = '';
      const item = document.createElement('li');
      item.className = 'managed-list-item';
      item.textContent = 'No channels cached yet.';
      adminChannelsListEl.appendChild(item);
    }
    if (adminSlotsMetaEl) adminSlotsMetaEl.textContent = 'No joined slots';
    if (adminSlotsGridEl) {
      adminSlotsGridEl.innerHTML = '';
      for (const slotId of ['A', 'B']) {
        const card = document.createElement('section');
        card.className = 'managed-slot-summary';
        card.innerHTML = `<p class="managed-card-label">Group ${slotId}</p><h4>No channel selected</h4><p class="managed-card-copy">No active managed membership</p>`;
        adminSlotsGridEl.appendChild(card);
      }
    }
    if (adminEndpointsMetaEl) adminEndpointsMetaEl.textContent = 'No resolved endpoints';
    if (adminEndpointTableBodyEl) {
      adminEndpointTableBodyEl.innerHTML = '';
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="8">No resolved endpoints have been published yet.</td>';
      adminEndpointTableBodyEl.appendChild(row);
    }
    if (adminNatMetaEl) adminNatMetaEl.textContent = 'No candidate data';
    if (adminNatStatusEl) adminNatStatusEl.textContent = 'Idle';
    if (adminNatSummaryEl) adminNatSummaryEl.textContent = 'No NAT discovery has been attempted yet.';
    if (adminNatErrorEl) {
      adminNatErrorEl.hidden = true;
      adminNatErrorEl.textContent = '';
    }
    if (adminNatCandidateListEl) {
      adminNatCandidateListEl.innerHTML = '';
      const item = document.createElement('div');
      item.className = 'admin-candidate-item';
      item.innerHTML = '<strong>No candidates</strong><span class="admin-candidate-meta">Open managed mode and refresh NAT readiness to populate this view.</span>';
      adminNatCandidateListEl.appendChild(item);
    }
    if (adminNatProbeListEl) {
      adminNatProbeListEl.innerHTML = '';
      const item = document.createElement('div');
      item.className = 'admin-candidate-item';
      item.innerHTML = '<strong>No probe state</strong><span class="admin-candidate-meta">Peer probe status will appear here after managed peers are refreshed.</span>';
      adminNatProbeListEl.appendChild(item);
    }
    if (adminStatsMetaEl) adminStatsMetaEl.textContent = 'No stats yet';
    if (adminStatsGridEl) {
      adminStatsGridEl.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'admin-stat-card';
      card.innerHTML = '<span class="admin-stat-label">Stats</span><strong class="admin-stat-value">Waiting</strong><span class="admin-stat-copy">Open or use the main window to populate read-only admin stats.</span>';
      adminStatsGridEl.appendChild(card);
    }
    if (adminErrorTextEl) {
      adminErrorTextEl.hidden = true;
      adminErrorTextEl.textContent = '';
    }
    setButtonBusyState(null);
  }

  function renderBackendAdmin(nextSnapshot) {
    const backendAdmin = nextSnapshot?.managed?.backendAdmin || {};
    const viewer = backendAdmin?.viewer || {};
    const directory = backendAdmin?.directory || {};
    const permissions = backendAdmin?.permissions || {};
    const roleLabel = String(viewer.role || '').trim() || 'member';
    const canRead = !!permissions.canReadAdminSummary;
    const observedAt = formatTimestamp(directory.observedAt);

    if (adminBackendStatusEl) {
      adminBackendStatusEl.textContent = canRead
        ? `${roleLabel} session`
        : 'Summary unavailable';
    }
    if (adminBackendMetaEl) {
      adminBackendMetaEl.textContent = canRead
        ? `${Number(directory.activeSessionCount) || 0} session(s) | ${Number(directory.activeChannelCount) || 0} active channel(s)`
        : 'Unavailable';
    }
    if (adminBackendCopyEl) {
      adminBackendCopyEl.textContent = canRead
        ? `${viewer.displayName || viewer.userId || viewer.sessionId || 'Operator'} can read backend-authored admin facts${observedAt ? ` | observed ${observedAt}` : ''}`
        : String(backendAdmin?.errorMessage || 'This session does not currently have permission to read backend admin facts.');
    }
    if (!adminBackendFactsEl) return;
    adminBackendFactsEl.innerHTML = '';
    const facts = canRead
      ? [
          `${Number(directory.channelCount) || 0} channel(s) | ${Number(directory.protectedChannelCount) || 0} protected | ${Number(directory.openChannelCount) || 0} open`,
          `${Number(directory.activeMemberCount) || 0} joined member(s) | ${Number(directory.onlineMemberCount) || 0} online | ${Number(directory.readyEndpointCount) || 0} ready endpoint(s)`,
          `${Number(directory.joinedSlotCount) || 0} joined slot(s) | ${Number(directory.activeOperatorSessionCount) || 0} operator session(s) | ${Number(directory.activeMemberSessionCount) || 0} member session(s)`,
          `Permissions | channels ${permissions.canManageChannels ? 'yes' : 'no'} | passcodes ${permissions.canManagePasscodes ? 'yes' : 'no'}`
        ]
      : [
          String(backendAdmin?.errorMessage || 'Backend admin summary has not been granted to this session.')
        ];
    for (const fact of facts) {
      const item = document.createElement('li');
      item.className = 'managed-list-item';
      item.textContent = fact;
      adminBackendFactsEl.appendChild(item);
    }
  }

  function renderChannels(nextSnapshot) {
    const channels = Array.isArray(nextSnapshot?.managed?.channels) ? nextSnapshot.managed.channels : [];
    if (adminChannelsMetaEl) {
      adminChannelsMetaEl.textContent = channels.length
        ? `${channels.length} cached${nextSnapshot?.managed?.cache?.lastUpdatedAt ? ` | synced ${formatTimestamp(nextSnapshot.managed.cache.lastUpdatedAt)}` : ''}`
        : 'No channels cached';
    }
    if (!adminChannelsListEl) return;
    adminChannelsListEl.innerHTML = '';
    if (!channels.length) {
      const item = document.createElement('li');
      item.className = 'managed-list-item';
      item.textContent = 'No channels cached in the current renderer session.';
      adminChannelsListEl.appendChild(item);
      return;
    }
    for (const channel of channels) {
      const item = document.createElement('li');
      item.className = 'managed-list-item';
      const titleRow = document.createElement('div');
      titleRow.className = 'managed-list-title';
      const title = document.createElement('strong');
      title.textContent = channel.name || channel.channelId || 'Unnamed channel';
      const security = document.createElement('span');
      security.className = `managed-badge ${channel.requiresPasscode ? 'is-protected' : 'is-open'}`;
      security.textContent = channel.requiresPasscode ? 'Protected' : 'Open';
      const state = document.createElement('span');
      state.className = 'managed-badge';
      state.textContent = channel.slotLabels?.length ? channel.slotLabels.join(' | ') : 'Visible';
      titleRow.append(title, security, state);
      const detail = document.createElement('span');
      detail.textContent = channel.description || channel.note || channel.channelId || 'Managed channel';
      const note = document.createElement('p');
      note.className = 'managed-list-note';
      note.textContent = `${Number(channel.memberCount) || 0} member(s) | ${channel.slotIntentLabels?.length ? `intended by ${channel.slotIntentLabels.join(', ')}` : 'not targeted by a slot'}`;
      item.append(titleRow, detail, note);
      adminChannelsListEl.appendChild(item);
    }
  }

  function renderSlots(nextSnapshot) {
    const slots = Array.isArray(nextSnapshot?.managed?.slots) ? nextSnapshot.managed.slots : [];
    const joinedCount = slots.filter((slot) => !!slot.channelId).length;
    if (adminSlotsMetaEl) {
      adminSlotsMetaEl.textContent = joinedCount
        ? `${joinedCount} joined slot(s) | active ${nextSnapshot?.managed?.activeSlotId ? `Group ${nextSnapshot.managed.activeSlotId}` : 'none'}`
        : 'No joined slots';
    }
    if (!adminSlotsGridEl) return;
    adminSlotsGridEl.innerHTML = '';
    for (const slot of slots) {
      const card = document.createElement('section');
      card.className = 'managed-slot-summary';
      const title = slot.channelName || slot.intendedChannelName || 'No channel selected';
      const intentText = slot.intendedChannelName
        ? `Intent ${slot.intendedChannelName}${slot.channelId && slot.channelId === slot.intendedChannelId ? ' | joined' : ''}`
        : `No intended channel for Group ${slot.slotId}.`;
      const syncText = slot.lastPeerSyncAt
        ? `${slot.transportPeerCount} transport peer(s) | peer sync ${formatTimestamp(slot.lastPeerSyncAt)}`
        : `${slot.transportPeerCount} transport peer(s) | no peer sync yet`;
      card.innerHTML = `
        <p class="managed-card-label">Group ${slot.slotId}</p>
        <h4>${title}</h4>
        <p class="managed-card-copy">${slot.membershipState || 'none'} | presence ${slot.presenceState || 'offline'}${slot.isActiveSlot ? ' | active slot' : ''}</p>
        <p class="managed-slot-copy">${intentText}</p>
        <p class="managed-card-foot">${syncText}</p>
      `;
      if (slot.errorMessage) {
        const error = document.createElement('p');
        error.className = 'managed-error';
        error.textContent = slot.errorMessage;
        card.appendChild(error);
      }
      adminSlotsGridEl.appendChild(card);
    }
  }

  function renderEndpoints(nextSnapshot) {
    const endpoints = Array.isArray(nextSnapshot?.managed?.resolvedEndpoints) ? nextSnapshot.managed.resolvedEndpoints : [];
    if (adminEndpointsMetaEl) {
      adminEndpointsMetaEl.textContent = endpoints.length
        ? `${endpoints.length} endpoint row(s) published`
        : 'No resolved endpoints';
    }
    if (!adminEndpointTableBodyEl) return;
    adminEndpointTableBodyEl.innerHTML = '';
    if (!endpoints.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="8">No resolved endpoints are available for the current managed snapshot.</td>';
      adminEndpointTableBodyEl.appendChild(row);
      return;
    }
    for (const entry of endpoints) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>Group ${entry.slotId}</td>
        <td>${entry.displayName || entry.peerKey || 'Unknown peer'}</td>
        <td>${entry.channelName || entry.channelId || '--'}</td>
        <td>${entry.connectionState || 'unknown'}</td>
        <td>${entry.ip}:${entry.port}</td>
        <td>${entry.kind || 'unknown'}${entry.selectedTransport ? ' | transport' : ''}</td>
        <td>${entry.registrationState || 'unknown'}</td>
        <td>${formatTimestamp(entry.lastValidatedAt) || '--'}</td>
      `;
      adminEndpointTableBodyEl.appendChild(row);
    }
  }

  function renderStats(nextSnapshot) {
    const stats = nextSnapshot?.stats || {};
    const metrics = [
      {
        label: 'Operating Mode',
        value: nextSnapshot?.operatingMode || 'direct',
        copy: stats.joinedSlotCount ? `${stats.joinedSlotCount} joined managed slot(s)` : 'Main window is not joined to any managed slot.'
      },
      {
        label: 'Transport Peers',
        value: String(Number(stats.activeTransportPeerCount) || 0),
        copy: `${Number(stats.connectedPeerCount) || 0} connected | ${Number(stats.managedTransportPeerCount) || 0} managed-adapted`
      },
      {
        label: 'Peer Stats',
        value: `${formatMetricValue(stats.peerSummary?.rtt, ' ms')} RTT`,
        copy: `${formatMetricValue(stats.peerSummary?.jitter, ' ms')} jitter | ${formatMetricValue(stats.peerSummary?.loss)} loss`
      },
      {
        label: 'Routing',
        value: stats.routeSummary || 'No active routes',
        copy: stats.commanderSummary || 'Commander summary unavailable'
      }
    ];
    if (adminStatsMetaEl) {
      adminStatsMetaEl.textContent = `${Number(stats.activeTransportPeerCount) || 0} active peer(s) | snapshot ${formatTimestamp(nextSnapshot?.generatedAt) || 'pending'}`;
    }
    if (!adminStatsGridEl) return;
    adminStatsGridEl.innerHTML = '';
    for (const metric of metrics) {
      const card = document.createElement('div');
      card.className = 'admin-stat-card';
      card.innerHTML = `
        <span class="admin-stat-label">${metric.label}</span>
        <strong class="admin-stat-value">${metric.value}</strong>
        <span class="admin-stat-copy">${metric.copy}</span>
      `;
      adminStatsGridEl.appendChild(card);
    }
  }

  function renderNat(nextSnapshot) {
    const nat = nextSnapshot?.managed?.nat || {};
    const gatherer = nat.gatherer || {};
    const slotStates = nat.slots || {};
    const candidateRows = buildNatCandidateRows(nextSnapshot);
    const probeRows = buildNatProbeRows(nextSnapshot);
    const localCount = candidateRows.filter((candidate) => candidate.kind === 'local').length;
    const publicCount = candidateRows.filter((candidate) => candidate.kind === 'public').length;
    const readyProbeCount = probeRows.filter((probe) => probe.status === 'ready').length;
    const probingProbeCount = probeRows.filter((probe) => probe.status === 'probing').length;
    const succeededProbeCount = probeRows.filter((probe) => probe.status === 'succeeded').length;
    const transportSucceededProbeCount = probeRows.filter((probe) => probe.status === 'succeeded' && probe.authority === 'transport').length;
    const advisorySucceededProbeCount = probeRows.filter((probe) => probe.status === 'succeeded' && probe.authority !== 'transport').length;
    const timedOutProbeCount = probeRows.filter((probe) => probe.status === 'timed_out').length;
    const failedProbeCount = probeRows.filter((probe) => probe.status === 'failed').length;
    const activeSlotId = nextSnapshot?.managed?.activeSlotId || 'A';
    const activeSlotState = slotStates?.[activeSlotId] || {};
    const activeLocalCount = Array.isArray(activeSlotState.localCandidates) ? activeSlotState.localCandidates.length : 0;
    const activePublicCount = Array.isArray(activeSlotState.publicCandidates) ? activeSlotState.publicCandidates.length : 0;

    if (adminNatMetaEl) {
      adminNatMetaEl.textContent = candidateRows.length
        ? `${localCount} local | ${publicCount} public${probeRows.length ? ` | ${probeRows.length} probe(s)` : ''}${gatherer.lastCompletedAt ? ` | updated ${formatTimestamp(gatherer.lastCompletedAt)}` : ''}`
        : 'No candidate data';
    }
    if (adminNatStatusEl) {
      adminNatStatusEl.textContent = formatNatStatusLabel(gatherer.status || nat.status || 'idle');
    }
    if (adminNatSummaryEl) {
      if (gatherer.status === 'gathering') {
        adminNatSummaryEl.textContent = `Gathering local and mapped public candidates for Group ${activeSlotId}.`;
      } else if (probingProbeCount) {
        adminNatSummaryEl.textContent = `Group ${activeSlotId} currently has ${probingProbeCount} peer probe(s) in progress.`;
      } else if (timedOutProbeCount) {
        adminNatSummaryEl.textContent = `Group ${activeSlotId} currently has ${timedOutProbeCount} peer probe(s) timed out while session and peer state remain healthy.`;
      } else if (failedProbeCount) {
        adminNatSummaryEl.textContent = `Group ${activeSlotId} currently has ${failedProbeCount} peer probe(s) failed while session and peer state remain healthy.`;
      } else if (transportSucceededProbeCount) {
        adminNatSummaryEl.textContent = `Group ${activeSlotId} currently has ${transportSucceededProbeCount} transport-authoritative peer probe(s) succeeded.`;
      } else if (advisorySucceededProbeCount) {
        adminNatSummaryEl.textContent = `Group ${activeSlotId} currently has ${advisorySucceededProbeCount} advisory peer probe(s) succeeded.`;
      } else if (succeededProbeCount) {
        adminNatSummaryEl.textContent = `Group ${activeSlotId} currently has ${succeededProbeCount} peer probe(s) succeeded.`;
      } else if (readyProbeCount) {
        adminNatSummaryEl.textContent = `Group ${activeSlotId} currently has ${readyProbeCount} peer probe(s) ready for future transport-authoritative probing.`;
      } else if (gatherer.status === 'failed') {
        adminNatSummaryEl.textContent = `Group ${activeSlotId} retained ${activeLocalCount} local candidate(s), but mapped public candidate discovery failed.`;
      } else if (activePublicCount) {
        adminNatSummaryEl.textContent = `Group ${activeSlotId} currently has ${activeLocalCount} local and ${activePublicCount} mapped public candidate(s). Public mappings remain advisory until transport-authoritative probing exists.`;
      } else if (activeLocalCount) {
        adminNatSummaryEl.textContent = `Group ${activeSlotId} currently has ${activeLocalCount} local candidate(s) and no mapped public candidate.`;
      } else {
        adminNatSummaryEl.textContent = 'No NAT discovery has been attempted yet.';
      }
    }
    if (adminNatErrorEl) {
      const errorMessage = String(gatherer.lastError || '');
      adminNatErrorEl.hidden = !errorMessage;
      adminNatErrorEl.textContent = errorMessage;
    }
    if (adminNatCandidateListEl) adminNatCandidateListEl.innerHTML = '';
    if (!candidateRows.length && adminNatCandidateListEl) {
      const item = document.createElement('div');
      item.className = 'admin-candidate-item';
      item.innerHTML = '<strong>No candidates</strong><span class="admin-candidate-meta">No local or mapped public candidates are available in the current snapshot.</span>';
      adminNatCandidateListEl.appendChild(item);
    }
    if (adminNatCandidateListEl) {
      for (const candidate of candidateRows.sort((left, right) => {
        return `${left.slotId}:${left.kind}:${left.ip}:${left.port}`.localeCompare(`${right.slotId}:${right.kind}:${right.ip}:${right.port}`);
      })) {
        const item = document.createElement('div');
        item.className = 'admin-candidate-item';
        const title = document.createElement('strong');
        title.textContent = `Group ${candidate.slotId} | ${formatNatStatusLabel(candidate.kind || 'unknown')}`;
        const meta = document.createElement('span');
        meta.className = 'admin-candidate-meta';
        const endpoint = candidate.ip && candidate.port ? `${candidate.ip}:${candidate.port}` : 'Unknown endpoint';
        const protocol = candidate.protocol ? String(candidate.protocol).toUpperCase() : 'UDP';
        const source = candidate.source ? ` | ${candidate.source}` : '';
        const discoveredAt = candidate.discoveredAt ? ` | ${formatTimestamp(candidate.discoveredAt)}` : '';
        meta.textContent = `${endpoint} | ${protocol}${source}${discoveredAt}`;
        item.append(title, meta);
        adminNatCandidateListEl.appendChild(item);
      }
    }
    if (!adminNatProbeListEl) return;
    adminNatProbeListEl.innerHTML = '';
    if (!probeRows.length) {
      const item = document.createElement('div');
      item.className = 'admin-candidate-item';
      item.innerHTML = '<strong>No probe state</strong><span class="admin-candidate-meta">Refresh peers after NAT discovery to populate probe visibility.</span>';
      adminNatProbeListEl.appendChild(item);
      return;
    }
    for (const probe of probeRows.sort((left, right) => `${left.slotId}:${left.displayName || left.peerKey}:${left.peerKey}`.localeCompare(`${right.slotId}:${right.displayName || right.peerKey}:${right.peerKey}`))) {
      const item = document.createElement('div');
      item.className = 'admin-candidate-item';
      const title = document.createElement('strong');
      title.textContent = `Group ${probe.slotId || 'A'} | ${probe.displayName || probe.peerKey || 'Unknown peer'} | ${formatNatStatusLabel(probe.status || 'idle')}`;
      const meta = document.createElement('span');
      meta.className = 'admin-candidate-meta';
      const endpoint = probe.ip && probe.port ? `${probe.ip}:${probe.port}` : (probe.peerKey || 'Unknown endpoint');
      const detailParts = [endpoint];
      if (probe.endpointKind) detailParts.push(formatNatStatusLabel(probe.endpointKind));
      if (probe.authority) detailParts.push(probe.authority === 'transport' ? 'Transport evidence' : 'Advisory');
      if (Number.isFinite(Number(probe.lastRttMs))) detailParts.push(`${Math.round(Number(probe.lastRttMs))} ms`);
      if (probe.lastCompletedAt) detailParts.push(formatTimestamp(probe.lastCompletedAt));
      if (probe.lastError) detailParts.push(probe.lastError);
      meta.textContent = detailParts.filter(Boolean).join(' | ');
      item.append(title, meta);
      adminNatProbeListEl.appendChild(item);
    }
  }

  function render(nextSnapshot) {
    snapshot = nextSnapshot;
    if (!snapshot) {
      renderEmptyState();
      return;
    }
    document.body.classList.toggle('theme-light', snapshot.theme === 'light');
    document.body.classList.toggle('theme-dark', snapshot.theme !== 'light');
    if (adminOverviewStatusEl) {
      adminOverviewStatusEl.textContent = `${snapshot.operatingMode === 'managed' ? 'Managed mode' : 'Direct mode'} | snapshot ${formatTimestamp(snapshot.generatedAt) || 'pending'}${snapshot?.managed?.baseUrl ? ` | backend ${snapshot.managed.baseUrl}` : ''}`;
    }
    if (adminRefreshStatusEl) {
      const loadingAction = String(snapshot?.adminSurface?.loadingAction || 'idle');
      adminRefreshStatusEl.textContent = loadingAction === 'idle'
        ? 'Read-only snapshot ready'
        : `Refreshing ${loadingAction}`;
    }
    if (adminRefreshMetaEl) {
      const completedAt = formatTimestamp(snapshot?.adminSurface?.lastCompletedAt);
      adminRefreshMetaEl.textContent = snapshot?.adminSurface?.lastAction
        ? `${snapshot.adminSurface.lastAction}${completedAt ? ` | completed ${completedAt}` : ''}`
        : 'The admin surface is read-only and relays data from the main renderer.';
    }
    if (adminErrorTextEl) {
      const message = String(snapshot?.adminSurface?.errorMessage || '');
      adminErrorTextEl.hidden = !message;
      adminErrorTextEl.textContent = message;
    }
    if (adminSessionStatusEl) {
      const sessionId = snapshot?.managed?.session?.sessionId;
      adminSessionStatusEl.textContent = sessionId
        ? `Session ${sessionId}`
        : 'No managed session';
    }
    if (adminSessionMetaEl) {
      const managedSession = snapshot?.managed?.session || {};
      adminSessionMetaEl.textContent = managedSession.sessionId
        ? `${managedSession.status || 'open'} | ${managedSession.userId || 'unknown user'}${managedSession.expiresAt ? ` | expires ${formatTimestamp(managedSession.expiresAt)}` : ''}`
        : 'Managed session data has not been opened yet.';
    }
    if (adminTransportStatusEl) {
      adminTransportStatusEl.textContent = `${Number(snapshot?.stats?.activeTransportPeerCount) || 0} active transport peers`;
    }
    if (adminTransportMetaEl) {
      adminTransportMetaEl.textContent = snapshot?.stats?.hostStatusSummary || 'Host bridge and transport status are not available yet.';
    }
    renderBackendAdmin(snapshot);
    renderChannels(snapshot);
    renderSlots(snapshot);
    renderEndpoints(snapshot);
    renderNat(snapshot);
    renderStats(snapshot);
    setButtonBusyState(snapshot);
  }

  async function requestRefresh(action) {
    try {
      await platform.requestAdminRefresh({ action, source: 'admin-window' });
    } catch (error) {
      render({
        ...snapshot,
        adminSurface: {
          ...(snapshot?.adminSurface || {}),
          errorMessage: error?.message || 'Failed to request admin refresh.',
          loadingAction: 'idle'
        }
      });
    }
  }

  adminRefreshAllBtn?.addEventListener('click', () => { requestRefresh('all').catch((error) => console.error('admin refresh all error', error)); });
  adminRefreshChannelsBtn?.addEventListener('click', () => { requestRefresh('channels').catch((error) => console.error('admin refresh channels error', error)); });
  adminRefreshPeersBtn?.addEventListener('click', () => { requestRefresh('peers').catch((error) => console.error('admin refresh peers error', error)); });

  platform.onAdminState((nextSnapshot) => {
    render(nextSnapshot);
  });

  (async function init() {
    renderEmptyState();
    try {
      render(await platform.getAdminState());
    } catch (error) {
      renderEmptyState(error?.message || 'Failed to load the latest admin snapshot.');
    }
  })();
})();
