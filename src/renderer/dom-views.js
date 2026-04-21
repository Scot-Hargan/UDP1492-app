export function renderCommanderButtonState(button, { pressed = false, held = false, text = '' } = {}) {
  if (!button) return;
  if (text) button.textContent = text;
  button.classList.toggle('is-active', !!pressed);
  button.classList.toggle('is-held', !!held);
  button.setAttribute('aria-pressed', String(!!pressed));
}

export function renderPeerModalOtherFields({
  document,
  container,
  peer,
  selectionKey,
  newPeerValue
}) {
  if (!container) return;
  container.innerHTML = '';
  if (selectionKey === newPeerValue) return;

  for (const attr of Object.keys(peer || {})) {
    if (['name', 'ip', 'port', 'sharedKey', 'gain'].includes(attr)) continue;
    const row = document.createElement('div');
    row.className = 'other-row';
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Remove';
    deleteButton.onclick = () => {
      row.remove();
    };
    const label = document.createElement('span');
    label.textContent = attr;
    row.append(deleteButton, label);
    container.appendChild(row);
  }
}

function renderManagedSlotSummary(elements, viewModel, isActiveSlot) {
  if (elements.title) elements.title.textContent = viewModel.title;
  if (elements.status) elements.status.textContent = `${viewModel.statusText}${isActiveSlot ? ' | active slot' : ''}`;
  if (elements.intent) elements.intent.textContent = viewModel.intentText;
  if (elements.peerSync) elements.peerSync.textContent = viewModel.peerSyncText;
}

export function renderManagedShellView({
  document,
  elements,
  constants,
  state,
  helpers,
  actions
}) {
  const {
    OPERATING_MODES,
    GROUP_SLOT_IDS,
    MIC_MODE_IDS,
    COMMANDER_SCOPE_IDS,
    NAT_DISCOVERY_STATES
  } = constants;
  const {
    operatingModeSummaryEl,
    transportPeersHeadingEl,
    managedModeShellEl,
    managedModeStatusEl,
    managedIdentityNameEl,
    managedIdentityMetaEl,
    managedProfileStatusEl,
    managedChannelListEl,
    managedLobbyStatusEl,
    managedActiveSlotLabelEl,
    managedSelectGroupABtn,
    managedSelectGroupBBtn,
    managedActiveChannelEl,
    managedActiveSlotStatusEl,
    managedGroupATitleEl,
    managedGroupAStatusEl,
    managedGroupAIntentEl,
    managedGroupAPeerSyncEl,
    managedGroupBTitleEl,
    managedGroupBStatusEl,
    managedGroupBIntentEl,
    managedGroupBPeerSyncEl,
    managedIntentStatusEl,
    managedDisplayNameInputEl,
    managedBackendBaseUrlInputEl,
    managedRefreshChannelsBtn,
    managedRefreshNatBtn,
    managedRefreshPeersBtn,
    managedLeaveChannelBtn,
    managedPeerSyncMetaEl,
    managedNatStatusEl,
    managedRoutingStatusEl,
    managedCommanderStatusEl,
    managedMicModeSingleBtn,
    managedMicModeCommanderBtn,
    managedMuteAllBtn,
    managedMuteGroupABtn,
    managedMuteGroupBBtn,
    managedPttAllBtn,
    managedPttGroupABtn,
    managedPttGroupBBtn,
    managedErrorTextEl,
    managedPasscodeLabelEl,
    managedJoinPasscodeInputEl
  } = elements;

  const operatingMode = helpers.getOperatingMode();
  const managedSession = helpers.getManagedSession();
  const activeSlotId = helpers.getActiveManagedSlotId();
  const activeSlotView = helpers.buildManagedSlotViewModel(activeSlotId);
  const slotAView = helpers.buildManagedSlotViewModel(GROUP_SLOT_IDS.A);
  const slotBView = helpers.buildManagedSlotViewModel(GROUP_SLOT_IDS.B);
  const runtimeConfig = helpers.getManagedRuntimeConfig();
  const effectiveManagedBaseUrl = helpers.getManagedBaseUrl();
  const backendUrlSource = helpers.getConfiguredManagedBaseUrl()
    ? 'profile'
    : (runtimeConfig?.managedBackendUrl ? 'app config' : '');
  const joinedSlotCount = helpers.getManagedSlotIds().filter((slotId) => !!helpers.getManagedSlot(slotId).channelId).length;
  const activeSlotLabel = helpers.getManagedSlotLabel(activeSlotId);
  const managedProfile = state.managedProfile;
  const managedCache = state.managedCache;
  const natRuntime = state.natRuntime;
  const commanderHoldState = state.commanderHoldState;

  document.body.dataset.operatingMode = operatingMode;
  actions.updateOperatingModeButtons();

  if (transportPeersHeadingEl) {
    transportPeersHeadingEl.textContent = operatingMode === OPERATING_MODES.MANAGED ? 'Transport Peers' : 'Active Peers';
  }
  if (operatingModeSummaryEl) {
    operatingModeSummaryEl.textContent = operatingMode === OPERATING_MODES.MANAGED
      ? 'Managed mode uses the documented session, channel, presence, and peer-resolution contract over HTTP.'
      : 'Direct mode uses the saved UDP peer list and current host bridge.';
  }
  if (managedModeShellEl) managedModeShellEl.hidden = operatingMode !== OPERATING_MODES.MANAGED;
  if (managedModeStatusEl) {
    managedModeStatusEl.textContent = operatingMode === OPERATING_MODES.MANAGED
      ? (managedSession.sessionId
          ? `Session ${managedSession.status || 'open'} | ${joinedSlotCount} slot(s) joined${managedSession.expiresAt ? ` | until ${helpers.formatManagedTimestamp(managedSession.expiresAt)}` : ''}`
          : 'Open a managed session, then target Group A or Group B from the lobby.')
      : 'Managed shell is idle while direct mode is active.';
  }
  if (managedIdentityNameEl) {
    managedIdentityNameEl.textContent = managedProfile.displayName || managedSession.displayName || managedProfile.callsign || 'Unconfigured operator';
  }
  if (managedIdentityMetaEl) {
    managedIdentityMetaEl.textContent = managedSession.userId
      ? `User ${managedSession.userId}${managedSession.sessionId ? ` | Session ${managedSession.sessionId}` : ''}`
      : (managedProfile.callsign ? `Callsign ${managedProfile.callsign}` : 'Managed identity scaffold only');
  }
  if (managedProfileStatusEl) {
    managedProfileStatusEl.textContent = effectiveManagedBaseUrl
      ? `Backend ${effectiveManagedBaseUrl}${backendUrlSource === 'app config' ? ' | app config' : ''}`
      : 'Backend base URL not set yet';
  }
  if (managedDisplayNameInputEl) managedDisplayNameInputEl.value = managedProfile.displayName || '';
  if (managedBackendBaseUrlInputEl) {
    managedBackendBaseUrlInputEl.value = helpers.getConfiguredManagedBaseUrl() || '';
    managedBackendBaseUrlInputEl.placeholder = runtimeConfig?.managedBackendUrl || 'https://managed.example.test';
  }
  if (managedLobbyStatusEl) {
    const protectedCount = managedCache.channels.filter((channel) => helpers.channelRequiresPasscode(channel)).length;
    const openCount = Math.max(0, managedCache.channels.length - protectedCount);
    managedLobbyStatusEl.textContent = managedCache.channels.length
      ? `${managedCache.channels.length} channel(s) cached | ${openCount} open | ${protectedCount} protected${managedCache.lastUpdatedAt ? ` | synced ${helpers.formatManagedTimestamp(managedCache.lastUpdatedAt)}` : ''}`
      : 'No channels loaded yet';
  }
  if (managedActiveSlotLabelEl) {
    managedActiveSlotLabelEl.textContent = activeSlotLabel;
  }
  if (managedSelectGroupABtn) {
    managedSelectGroupABtn.classList.toggle('is-active', activeSlotId === GROUP_SLOT_IDS.A);
    managedSelectGroupABtn.setAttribute('aria-pressed', String(activeSlotId === GROUP_SLOT_IDS.A));
  }
  if (managedSelectGroupBBtn) {
    managedSelectGroupBBtn.classList.toggle('is-active', activeSlotId === GROUP_SLOT_IDS.B);
    managedSelectGroupBBtn.setAttribute('aria-pressed', String(activeSlotId === GROUP_SLOT_IDS.B));
  }
  if (managedActiveChannelEl) {
    managedActiveChannelEl.textContent = activeSlotView.slotState.channelId
      ? activeSlotView.title
      : `${activeSlotLabel} has no active membership`;
  }
  if (managedActiveSlotStatusEl) {
    managedActiveSlotStatusEl.textContent = `${activeSlotLabel} | ${activeSlotView.statusText}`;
  }
  if (managedIntentStatusEl) {
    managedIntentStatusEl.hidden = !activeSlotView.intentText;
    managedIntentStatusEl.textContent = activeSlotView.intentText;
  }
  if (managedPeerSyncMetaEl) {
    managedPeerSyncMetaEl.textContent = activeSlotView.peerSyncText;
  }
  if (managedNatStatusEl) {
    managedNatStatusEl.textContent = helpers.getNatStatusText(activeSlotId);
  }
  if (managedRoutingStatusEl) {
    managedRoutingStatusEl.hidden = operatingMode !== OPERATING_MODES.MANAGED;
    managedRoutingStatusEl.textContent = helpers.getManagedRoutingSummary();
  }
  if (managedCommanderStatusEl) {
    managedCommanderStatusEl.textContent = helpers.getCommanderStatusText();
  }

  renderCommanderButtonState(managedMicModeSingleBtn, {
    pressed: helpers.getCommanderMicMode() === MIC_MODE_IDS.SINGLE,
    text: 'Single'
  });
  renderCommanderButtonState(managedMicModeCommanderBtn, {
    pressed: helpers.getCommanderMicMode() === MIC_MODE_IDS.COMMANDER,
    text: 'Commander'
  });
  renderCommanderButtonState(managedMuteAllBtn, {
    pressed: helpers.isCommanderScopeMuted(COMMANDER_SCOPE_IDS.ALL),
    text: helpers.isCommanderScopeMuted(COMMANDER_SCOPE_IDS.ALL) ? 'Muted' : 'Mute'
  });
  renderCommanderButtonState(managedMuteGroupABtn, {
    pressed: helpers.isCommanderScopeMuted(COMMANDER_SCOPE_IDS.A),
    text: helpers.isCommanderScopeMuted(COMMANDER_SCOPE_IDS.A) ? 'Muted' : 'Mute'
  });
  renderCommanderButtonState(managedMuteGroupBBtn, {
    pressed: helpers.isCommanderScopeMuted(COMMANDER_SCOPE_IDS.B),
    text: helpers.isCommanderScopeMuted(COMMANDER_SCOPE_IDS.B) ? 'Muted' : 'Mute'
  });
  renderCommanderButtonState(managedPttAllBtn, {
    pressed: !!commanderHoldState.all,
    held: !!commanderHoldState.all,
    text: commanderHoldState.all ? 'Talking' : 'Hold To Talk'
  });
  renderCommanderButtonState(managedPttGroupABtn, {
    pressed: !!commanderHoldState.A,
    held: !!commanderHoldState.A,
    text: commanderHoldState.A ? 'Talking' : 'Hold To Talk'
  });
  renderCommanderButtonState(managedPttGroupBBtn, {
    pressed: !!commanderHoldState.B,
    held: !!commanderHoldState.B,
    text: commanderHoldState.B ? 'Talking' : 'Hold To Talk'
  });

  const commanderModeEnabled = helpers.getCommanderMicMode() === MIC_MODE_IDS.COMMANDER;
  if (managedMuteGroupABtn) managedMuteGroupABtn.disabled = !commanderModeEnabled;
  if (managedMuteGroupBBtn) managedMuteGroupBBtn.disabled = !commanderModeEnabled;
  if (managedPttAllBtn) managedPttAllBtn.disabled = !commanderModeEnabled;
  if (managedPttGroupABtn) managedPttGroupABtn.disabled = !commanderModeEnabled;
  if (managedPttGroupBBtn) managedPttGroupBBtn.disabled = !commanderModeEnabled;

  renderManagedSlotSummary({
    title: managedGroupATitleEl,
    status: managedGroupAStatusEl,
    intent: managedGroupAIntentEl,
    peerSync: managedGroupAPeerSyncEl
  }, slotAView, activeSlotId === GROUP_SLOT_IDS.A);
  renderManagedSlotSummary({
    title: managedGroupBTitleEl,
    status: managedGroupBStatusEl,
    intent: managedGroupBIntentEl,
    peerSync: managedGroupBPeerSyncEl
  }, slotBView, activeSlotId === GROUP_SLOT_IDS.B);

  if (managedPasscodeLabelEl) {
    managedPasscodeLabelEl.textContent = activeSlotView.passcodeRequired
      ? `${activeSlotLabel} Passcode (Required)`
      : `${activeSlotLabel} Passcode`;
  }
  if (managedJoinPasscodeInputEl) {
    managedJoinPasscodeInputEl.placeholder = activeSlotView.passcodeRequired
      ? (activeSlotView.hasDifferentIntent
          ? `Enter the protected channel passcode to switch ${activeSlotLabel}`
          : 'Enter the protected channel passcode')
      : 'Only for protected channels';
    managedJoinPasscodeInputEl.value = helpers.getManagedJoinPasscode(helpers.getActiveManagedSlotId());
  }
  if (managedErrorTextEl) {
    const errorMessage = activeSlotView.slotState.errorMessage || managedSession.errorMessage || '';
    managedErrorTextEl.hidden = !errorMessage;
    managedErrorTextEl.textContent = errorMessage;
  }

  actions.syncManagedInputButtonState();

  if (managedRefreshChannelsBtn) {
    managedRefreshChannelsBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || !managedSession.sessionId;
  }
  if (managedRefreshNatBtn) {
    managedRefreshNatBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || natRuntime.gatherer.status === NAT_DISCOVERY_STATES.GATHERING;
  }
  if (managedRefreshPeersBtn) {
    managedRefreshPeersBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || !activeSlotView.slotState.channelId;
  }
  if (managedLeaveChannelBtn) {
    managedLeaveChannelBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || !activeSlotView.slotState.channelId;
  }

  if (managedChannelListEl) {
    managedChannelListEl.innerHTML = '';
    const channels = managedCache.channels.length ? managedCache.channels : [];
    if (!channels.length) {
      const item = document.createElement('li');
      item.className = 'managed-list-item';
      const title = document.createElement('strong');
      title.textContent = managedSession.sessionId ? 'No visible channels' : 'Session not opened';
      const detail = document.createElement('span');
      detail.textContent = managedSession.sessionId
        ? 'Refresh channels or verify the backend returned lobby data.'
        : 'Open a managed session to load the channel lobby.';
      item.append(title, detail);
      managedChannelListEl.appendChild(item);
    }

    for (const channel of channels) {
      const item = document.createElement('li');
      item.className = 'managed-list-item';
      item.dataset.securityMode = helpers.getManagedChannelSecurityMode(channel);
      const header = document.createElement('div');
      header.className = 'managed-list-item-header';
      const summary = document.createElement('div');
      const titleRow = document.createElement('div');
      titleRow.className = 'managed-list-title';
      const title = document.createElement('strong');
      title.textContent = channel.name || channel.channelId || 'Unnamed channel';
      const isProtected = helpers.channelRequiresPasscode(channel);
      const isActive = activeSlotView.slotState.channelId === channel.channelId;
      const isSelected = !isActive && activeSlotView.selectedChannelId === channel.channelId;
      const stateBadge = document.createElement('span');
      stateBadge.className = 'managed-badge';
      if (isActive) {
        stateBadge.textContent = 'Joined';
      } else if (isSelected) {
        stateBadge.textContent = 'Selected';
      }
      stateBadge.hidden = !isActive && !isSelected;
      const detail = document.createElement('span');
      detail.textContent = channel.description || channel.note || channel.channelId || 'Managed channel';
      const meta = document.createElement('div');
      meta.className = 'managed-list-meta';
      const security = document.createElement('span');
      security.className = `managed-badge ${isProtected ? 'is-protected' : 'is-open'}`;
      security.textContent = helpers.getManagedChannelSecurityLabel(channel);
      const members = document.createElement('span');
      members.className = 'managed-badge';
      members.textContent = `${Number(channel.memberCount) || 0} member(s)`;
      const note = document.createElement('p');
      note.className = 'managed-list-note';
      note.textContent = isProtected
        ? 'Passcode required before join.'
        : 'Open channel. No passcode required.';
      titleRow.append(title, stateBadge);
      meta.append(security, members);
      summary.append(titleRow, detail, meta, note);
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = isActive ? 'secondary' : 'primary';
      actionButton.textContent = isActive ? 'Joined' : (isSelected ? 'Join Selected' : (isProtected ? 'Join Protected' : 'Join'));
      actionButton.disabled = !managedSession.sessionId || isActive;
      item.classList.toggle('is-active', isActive);
      item.classList.toggle('is-selected', isSelected);
      actionButton.addEventListener('click', () => {
        actions.onManagedChannelAction(activeSlotId, channel.channelId);
      });
      header.append(summary, actionButton);
      item.append(header);
      managedChannelListEl.appendChild(item);
    }
  }

  actions.queueAdminSnapshotPublish();
}
