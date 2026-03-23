export const ICONS = {
  remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18"/></svg>',
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 5V4L9 9H5Z"/><path d="m16 9 3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  unmute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 5V4L9 9H5Z"/><path d="M16 8c1.5 1 2.5 2.7 2.5 4.5S17.5 16 16 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  encOpen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="2"/><rect x="6" y="11" width="12" height="9" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 14v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  encClosed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="6" y="11" width="12" height="9" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 14v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};

function sanitizePeerKey(peerKey) {
  return (peerKey || '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

function addOption(selectEl, name, value) {
  const option = selectEl.ownerDocument.createElement('option');
  option.value = value;
  option.textContent = name;
  selectEl.appendChild(option);
}

function createCell(documentRef, text, className) {
  const cell = documentRef.createElement('td');
  if (className) cell.className = className;
  if (text != null) cell.textContent = text;
  return cell;
}

export function getPeerRowId(peerKey) {
  return `peer-${sanitizePeerKey(peerKey)}`;
}

export function getPeerMeterId(peerKey) {
  return `peer-meter-${sanitizePeerKey(peerKey)}`;
}

export function getPeerMuteButtonId(peerKey) {
  return `peer-mute-${sanitizePeerKey(peerKey)}`;
}

export function fillSelect(selectEl, options, selectedValue) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  for (const option of options) {
    addOption(selectEl, option.name, option.value);
  }
  if (selectedValue && options.some((option) => option.value === selectedValue)) {
    selectEl.value = selectedValue;
  } else if (options.length) {
    selectEl.value = options[0].value;
  }
}

export function refreshPeerSelects({
  allPeers,
  peerListEl,
  peerModalSelectEl,
  mainSelected,
  modalSelected,
  newPeerValue
}) {
  const options = [{ name: '<New Peer>', value: newPeerValue }];
  for (const peer of allPeers) {
    const value = `${peer.ip}:${peer.port}`;
    options.push({ name: peer.name || value, value });
  }
  fillSelect(peerListEl, options, mainSelected);
  fillSelect(peerModalSelectEl, options, modalSelected ?? mainSelected);
}

export function setMuteButtonVisual(button, muted) {
  if (!button) return;
  button.innerHTML = muted ? ICONS.mute : ICONS.unmute;
  button.title = muted ? 'Unmute peer' : 'Mute peer';
  button.classList.toggle('peer-muted', muted);
}

export function createPeerTableRow({ document: documentRef, peer, onDeactivate, onToggleMute }) {
  const peerKey = `${peer.ip}:${peer.port}`;
  const row = documentRef.createElement('tr');
  row.id = getPeerRowId(peerKey);

  row.appendChild(createCell(documentRef, peer.name));
  row.appendChild(createCell(documentRef, peerKey));

  const iconCell = createCell(documentRef, null, 'peer-icons');

  const removeButton = documentRef.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'peer-remove';
  removeButton.title = 'Remove peer';
  removeButton.innerHTML = ICONS.remove;
  removeButton.onclick = () => onDeactivate(peerKey);

  const muteButton = documentRef.createElement('button');
  muteButton.type = 'button';
  muteButton.className = 'peer-mute';
  muteButton.id = getPeerMuteButtonId(peerKey);
  setMuteButtonVisual(muteButton, false);
  muteButton.onclick = () => onToggleMute(peerKey);

  const statusIcon = documentRef.createElement('span');
  statusIcon.title = 'Initial Status';
  statusIcon.className = 'status-dot dot-gray';

  const encryptionIcon = documentRef.createElement('span');
  encryptionIcon.title = 'Initial encryption';
  encryptionIcon.className = 'peer-enc peer-enc-open';
  encryptionIcon.innerHTML = ICONS.encOpen;

  iconCell.appendChild(removeButton);
  iconCell.appendChild(muteButton);
  iconCell.appendChild(statusIcon);
  iconCell.appendChild(encryptionIcon);
  row.appendChild(iconCell);

  const meterCell = documentRef.createElement('td');
  const meterWrapper = documentRef.createElement('div');
  meterWrapper.className = 'meter';
  const meterEl = documentRef.createElement('progress');
  meterEl.id = getPeerMeterId(peerKey);
  meterEl.max = 1;
  meterEl.value = 0;
  meterWrapper.appendChild(meterEl);
  meterCell.appendChild(meterWrapper);
  row.appendChild(meterCell);

  row.appendChild(createCell(documentRef, '--', 'rtt'));
  row.appendChild(createCell(documentRef, '--', 'jitter'));
  row.appendChild(createCell(documentRef, '--', 'ooo'));
  row.appendChild(createCell(documentRef, '--', 'dups'));
  row.appendChild(createCell(documentRef, '--', 'loss'));

  return { peerKey, row, meterEl };
}
