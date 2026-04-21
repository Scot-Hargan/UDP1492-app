// udp_audio1492_host.js (v0.3.1) - encryption mismatch detection & status reporting
// udp_audio1492_host.js (v0.4.0) - Steve cleanup/re-structure
// udp_audio1492_host.js (v0.4.4) - Steve adding multiple peers, better encryption, native vs extension and statistics
// udp_audio1492_host.js (v0.4.5) - bugs created from 0.4.0 to 0.4.4 appear to be worked out, still need to handle config updates
// udp_audio1492_host.js (v0.4.6) - audio again
// udp_audio1492_host.js (v0.4.10.1) - added handshake/reconnect diagnostic logging
const dgram = require('dgram');
const crypto = require('crypto');
const zlib = require('zlib');

const HOST_VERSION = '0.4.10.1';
const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;
const IPC_MODE = typeof process.send === 'function';

//SUCS packet types (SECURE UDP COMMUNICATION SYSTEM)
const TYPE_PING = 0xC0;           //[type:1B][timestamp 8B]
const TYPE_PONG = 0xC1;           //[type:1B][timestamp 8B]
const TYPE_LOGOFF = 0xC2;         //[type:1B][sig:64B][myIdPubKey]
const TYPE_HANDSHAKE_INIT = 0xE1; //[type:1B][sig:64B][timestamp:8B][myNonce:32B]   [myEphPub:44B]   [proof:32B][myIdPubKey]    (proof is all 0's if there is not sharedkey)
const TYPE_HANDSHAKE_RESP = 0xE2; //[type:1B][sig:64B][timestamp:8B][theirNonce:32B][theirEphPub:44B][proof:32B][theirIdPubKey] (proof is all 0's if there is not sharedkey)
const TYPE_DATA = 0xD0;           //[type:1B][proof:32B][handling:1B][dataType:1B][timestamp:8B][sequence:4B][length:2B][data]
                                                       //handling, bit 1: base64 encoded data, bit 2: record stats, bit 3: gzip
const TYPE_DATA_ENCRYPTED = 0xDE; //[type:1B][IV:12B][tag:16B][ciphertext(of TYPE_DATA without type byte or proof)]
const TYPE_ERROR = 0x0E;          //[type:1B][errorCode:1B][sig:64B][textLen:2B][text][myIdPubKey]
let peers = new Map(), listening = false, PORT = 1492, encryptionEnabled = true;
let deadTime = 15000, pingInterval = 5000, pingHistoryDuration = 60000;
let statsReportInterval = 1000, jitterSamplesCount = 100;
//attempt to close if not launched through extension on accident
let versionTimer = setTimeout(() => {
  process.exit(1);
}, 1000);

// Setup Network Messaging
const udp = dgram.createSocket({ type: 'udp4' });
udp.on('error', (err) => postMessage({ type: 'error', message: 'UDP error: ' + err.message }));
udp.on('message', (msg, rinfo) => {
  if (!msg || msg.length === 0) return;
  if (!peers.has(`${rinfo.address}:${rinfo.port}`)) return;
  handleNetworkMessage(msg,rinfo)
});
udp.on('listening', () => {
  const addr = udp.address();
  listening = true;
  postMessage({ type: 'log', message: `UDP listening on ${addr.address}:${addr.port}` });
});

// Setup host control messaging for either native messaging or Electron IPC.
if (IPC_MODE) {
  process.on('message', handleExtensionMessage);
} else {
  let inputBuffer = Buffer.alloc(0);
  process.stdin.on('readable', () => {
    let chunk;
    while ((chunk = process.stdin.read()) !== null) {
      inputBuffer = Buffer.concat([inputBuffer, Buffer.from(chunk)]);
      while (inputBuffer.length >= 4) {
        const msgLen = inputBuffer.readUInt32LE(0);
        if (inputBuffer.length < 4 + msgLen) break;
        const jsonBytes = inputBuffer.subarray(4, 4 + msgLen);
        inputBuffer = inputBuffer.subarray(4 + msgLen);
        let msg;
        try { msg = JSON.parse(jsonBytes.toString('utf8')); } catch { continue; }
        handleExtensionMessage(msg);
      }
    }
  });
  process.stdin.on('end', () => {
    console.log('Extension disconnected (stdin ended). Exiting...');
    setTimeout(() => process.exit(0), 500);
  });
  process.stdin.on('error', (err) => {
    console.error('stdin error:', err);
    process.exit(1);
  });
}

function handleExtensionMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'configure':
      receiveConfig(msg);
      break;
    case 'sendData':
      if (!msg.destination || msg.destination == 'all') {
        peers.forEach(peer => {
          if (peer.connected) sendData(msg,peer);
        });
      } else {
        let peer = peers.get(msg.destination);
        if (peer && peer.connected) sendData(msg,peer);
      }
      break;
    case 'disconnect':
      stopCommunication();
      setTimeout(() => {process.exit(0);}, 500);
      break;
    case 'version':
      if (versionTimer) {
        clearTimeout(versionTimer);
        versionTimer = null;
      }
      postMessage({type:"version",version:HOST_VERSION})
      break;
    default:
      postMessage({ type: 'error', message: 'Unknown message type: ' + msg.type });
  }
}
function postMessage(obj) {
  if (IPC_MODE) {
    try { process.send(obj); } catch {}
    return;
  }
  const s = JSON.stringify(obj);
  const len = Buffer.byteLength(s, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(len, 0);
  try {
    process.stdout.write(header);
    process.stdout.write(s, 'utf8');
  } catch {}
}
function receiveConfig(msg){
  if (typeof msg.port === 'number' && msg.port !== PORT) {
    if (listening) udp.close();
    PORT = msg.port;
  }
  if (!listening) {
    try {
      udp.bind({ address: '0.0.0.0', port: PORT, exclusive: true });
      //write port check here, not using "reuse" appears to have killed automatic ip fragmentation
      //reuse options reusePort: true reuseAddr: true
      //other options recvBufferSize: 65536  sendBufferSize: 8192
    } catch (e) {
      postMessage({ type: 'error', message: 'Bind failed: ' + e.message });
      process.exit(1);
    }
  }
  if (typeof msg.encryptionEnabled === 'boolean') encryptionEnabled = msg.encryptionEnabled;
  if (typeof msg.deadTime === 'number') deadTime = msg.deadTime;
  if (typeof msg.pingInterval === 'number') pingInterval = msg.pingInterval;
  if (typeof msg.pingHistoryDuration === 'number') pingHistoryDuration = msg.pingHistoryDuration;
  if (typeof msg.statsReportInterval === 'number') statsReportInterval = msg.statsReportInterval;
  if (typeof msg.jitterSamplesCount === 'number') jitterSamplesCount = msg.jitterSamplesCount;

  if (msg.peers){
    msg.peers.forEach(p => {
      try {
        const key = `${p.ip}:${p.port}`;
        let peer = peers.get(key);
        if (!peer && !p.remove) {
          peer = {
            name: p.name,
            ip: p.ip,
            port: p.port,
            sharedKey: p.sharedKey,
            theirId: null,
            theirIdDer: null,
            theirIdExported: null,
            lastSeen: null,
            pingHistory: [],
            statsMap: new Map(),
            statsMapTimers: new Map(),
            txSeq: 0
          }
          if (p.theirId) {
            peer.theirId = crypto.createPublicKey(p.theirId);
            peer.theirIdDer = peer.theirId.export({ type: 'spki', format: 'der' });
            peer.theirIdExported = peer.theirId;
          }
          if (p.myId) {
            peer.myId={
              publicKey: crypto.createPublicKey(p.myId.publicKey),
              privateKey: crypto.createPrivateKey(p.myId.privateKey)
            };
            peer.myIdExport=p.myId.publicKey
          } else {
            peer.myId=crypto.generateKeyPairSync('ed25519')
            let exported = {
              publicKey: peer.myId.publicKey.export({ type: 'spki', format: 'pem' }),
              privateKey: peer.myId.privateKey.export({ type: 'pkcs8', format: 'pem' })
            };
            peer.myIdExport=exported.publicKey
            postMessage({ type: 'peerUpdate', message: `New local ID for peer ${p.name}`, key:`${p.ip}:${p.port}`, field:'myId', myId:exported});
          }
          peers.set(key,peer);
          peer.pingTimer = setInterval(() => pingPeer(peer), pingInterval);
          pingPeer(peer);
          postMessage({ type: 'log', message: `Started peer ${p.name}` });
        } else if (peer && p.remove) {
          stopCommunication(peer);
        } else if (peer && peer.name != p.name) {
          postMessage({ type: 'log', message: `Renaming peer "${peer.name}" to "${p.name}"`});
          peer.name = p.name
        } else {
          postMessage({ type: 'log', message: `No action taken for peer "${p.name}"`});
        }
      } catch (err) {
        postMessage({ type: 'error', message: `Peer config failed for ${p.name}: ${err.message}` });
      }
    });
  }
}
function stopCommunication(peer){
  if (peer){
    if (peer.connected){
      let type = TYPE_LOGOFF
      let msgToVerify = Buffer.concat([Buffer.from([type]), peer.sessionKey])
      let sig = crypto.sign(null, msgToVerify, peer.myId.privateKey);
      let out = Buffer.concat([Buffer.from([type]),sig, peer.myId.publicKey.export({type:'spki',format:'der'})]);
      udp.send(out, 0, out.length, peer.port, peer.ip, (err) => {
        if (err) postMessage({ type: 'error', message: 'Logoff send error: ' + err.message });
      });
      postMessage({ type: 'log', message: `logoff sent to ${peer.name}`});
      clearInterval(peer.connectedTimer);
    }
    
    clearInterval(peer.pingTimer);
    for (let t of peer.statsMapTimers.values()) {
      clearInterval(t);
    }
    let peerName = peer.name
    peers.delete(`${peer.ip}:${peer.port}`);
    postMessage({ type: 'log', message: `Peer ${peerName} removed`});
  } else {
    for (let p of peers.values()) {
      stopCommunication(p);
    }
  }
}

function handleNetworkMessage(msg,rinfo) {
  const now = Number(process.hrtime.bigint() / 1000n); // microseconds
  const peer = peers.get(`${rinfo.address}:${rinfo.port}`);
  if (!peer.seen) {
    postMessage({ type: 'log', message: `Peer first seen: ${peer.name}`});
    peer.seen = true
  }
  peer.lastSeen = now
  const kind = msg[0];

  if (kind === TYPE_PING) {
    let out = Buffer.concat([Buffer.from([TYPE_PONG]), msg.subarray(1, 9)]);
    udp.send(out, 0, out.length, rinfo.port, rinfo.address, (err) => {
      if (err) postMessage({ type: 'error', message: 'Pong send error: ' + err.message });
    });
    if (!peer.connected) {
      postMessage({ type: 'log', message: `PING from unconnected peer ${peer.name} - initiating handshake (connected=${peer.connected}, myEph=${!!peer.myEph})` });
      sendHandshake(peer,TYPE_HANDSHAKE_INIT);
    }
  } else if (kind === TYPE_PONG) {
    const then=Number(msg.readBigUInt64BE(1))
    const entry = peer.pingHistory.find(p => p.sent === then);
    if (entry) {
      entry.received = now;
      entry.rtt = now-Number(then);
      postMessage({ type: 'pingHistory', peerKey:`${peer.ip}:${peer.port}`, pingHistory:peer.pingHistory });
      if (!peer.responding){
        peer.responding = true;
        postMessage({ type: 'log', message: `Peer responding to ping: ${peer.name}`});
        peer.connectedTimer = setInterval(() => updateStatus(peer), pingInterval);
      }
    }
  } else if (kind === TYPE_HANDSHAKE_INIT) {
    postMessage({ type: 'log', message: `HANDSHAKE_INIT received from ${peer.name} (connected=${peer.connected}, myEph=${!!peer.myEph}, keyEpoch=${peer.keyEpoch ? peer.keyEpoch.toString() : 'null'})` });
    // Rate-limit: ignore if we got a handshake from this peer within the last 500ms
    const nowMs = Date.now();
    if (peer.lastHandshakeRx && (nowMs - peer.lastHandshakeRx) < 500) {
      postMessage({ type: 'log', message: `HANDSHAKE_INIT from ${peer.name} suppressed (rate limit, ${nowMs - peer.lastHandshakeRx}ms since last)` });
      return;
    }
    peer.lastHandshakeRx = nowMs;
    sendHandshake(peer,TYPE_HANDSHAKE_RESP);
    readHandshake(peer,msg,kind);
  } else if (peer.myEph && kind === TYPE_HANDSHAKE_RESP) {
    postMessage({ type: 'log', message: `HANDSHAKE_RESP received from ${peer.name} (connected=${peer.connected}, myEph=${!!peer.myEph}, keyEpoch=${peer.keyEpoch ? peer.keyEpoch.toString() : 'null'})` });
    // Rate-limit: ignore if we got a handshake from this peer within the last 500ms
    const nowMs = Date.now();
    if (peer.lastHandshakeRx && (nowMs - peer.lastHandshakeRx) < 500) {
      postMessage({ type: 'log', message: `HANDSHAKE_RESP from ${peer.name} suppressed (rate limit, ${nowMs - peer.lastHandshakeRx}ms since last)` });
      return;
    }
    peer.lastHandshakeRx = nowMs;
    readHandshake(peer,msg,kind)
  } else if (peer.connected && (kind === TYPE_DATA || kind === TYPE_DATA_ENCRYPTED)) {
    //if (kind === TYPE_DATA && peer.encryptionEnabled && !peer.encryptionMismatchDetected) {
    //  peer.encryptionMismatchDetected = true;
    //  postMessage({type: 'error',message: `received unencrypted data packet from peer: ${peer.name}`});
    //}
    receiveData(msg, peer, now);
  } else if (kind === TYPE_DATA || kind === TYPE_DATA_ENCRYPTED) {
    //ADD-CODE Handle data when not connected
  } else if (peer.connected && kind === TYPE_LOGOFF) {
    let offset = 1;
    let theirSig   = msg.subarray(offset, offset += 64);
    let theirIdDer = msg.subarray(offset);
    if (!peer.theirIdDer.equals(theirIdDer)) {
      postMessage({ type: 'error', message: `logoff id mismatch from peer ${peer.name}` });
      return;
    }
    if (!crypto.verify(null,Buffer.concat([Buffer.from([TYPE_LOGOFF]), peer.sessionKey]),peer.theirId,theirSig)) {
      postMessage({ type: 'error', message: `invalid logoff signature for peer ${peer.name}` });
      return;
    }
    peer.connected = false;
    clearInterval(peer.connectedTimer);
    peer.sessionKey = null;
    postMessage({ type: 'log', message: `peer ${peer.name} logged off` });
    postMessage({type: 'peerUpdate',key: `${peer.ip}:${peer.port}`,field: 'connected',connected: false});
    return;
  } else if (kind === TYPE_ERROR) {
    //ADD-CODE Handle error message
  } else {
    postMessage({ type: 'log', message: `Unhandled packet type 0x${kind.toString(16)} from ${peer.name} (connected=${peer.connected}, myEph=${!!peer.myEph})` });
  }
}
function sendData(msg,peer) {
  try {
    let handling = 0;
    const tsNum = (msg.timestamp === 0 || msg.timestamp) ? Number(msg.timestamp) : null;
    const timestamp = Number.isFinite(tsNum) ? BigInt(Math.trunc(tsNum)) : (process.hrtime.bigint() / 1000n); // microseconds

    if (msg.isBase64) {
      if (!msg.didBase64) msg.data = Buffer.from(msg.data, 'base64');
      handling |= 0x01;
      msg.didBase64 = true;
    }
    if (!msg.data || !msg.data.length) return;

    if (msg.doStats) handling |= 0x02;
    if (msg.doGzip) {
      if (!msg.didGzip) msg.data = zlib.gzipSync(msg.data);
      handling |= 0x04;
      msg.didGzip = true;
    }

    const seq = peer.txSeq++;
    let out = Buffer.alloc(16 + msg.data.length);
    out.writeUInt8(handling, 0);
    out.writeUInt8(msg.dataType, 1);
    out.writeBigUInt64BE(timestamp, 2);
    out.writeUInt32BE(seq, 10);
    out.writeUInt16BE(msg.data.length, 14);
    msg.data.copy(out, 16)

    if (encryptionEnabled) {
      out = encryptWithKey(peer.sessionKey,out);
      out = Buffer.concat([Buffer.from([TYPE_DATA_ENCRYPTED]),out]);
    } else {
      let proof = crypto.createHmac('sha256', peer.sessionKey).update(out).digest();
      out = Buffer.concat([Buffer.from([TYPE_DATA]),proof,out]);
    }

    
    udp.send(out, 0, out.length, peer.port, peer.ip, (err) => {
      if (err) postMessage({ type: 'error', message: 'Audio send error: ' + err.message });
    });
  } catch (err) {
    postMessage({ type: 'error', message: 'Audio encode error: ' + err.message });
  }
}
function receiveData(msg,peer,now) {
  let type = msg[0];
  let body = msg.slice(1);
  let signature = "valid";
  if (type === TYPE_DATA_ENCRYPTED) {
    try { body = decryptWithKey(peer.sessionKey, body); }
    catch (e) {postMessage({type:'error', message:`decrypt failed: ${e.message}`});return;}
  } else {
    let proof = msg.slice(1, 33);
    body  = msg.slice(33);
    let expected = crypto.createHmac('sha256', peer.sessionKey).update(body).digest();
    if (!proof.equals(expected)) {
      postMessage({ type:'error', message:`data proof failed for ${peer.name}` });
      signature = "fail";
    }
  }

  let handling   = body.readUInt8(0);
  let dataType   = body.readUInt8(1);
  let timestamp  = Number(body.readBigUInt64BE(2));
  let seq        = body.readUInt32BE(10);
  let payloadLen = body.readUInt16BE(14);
  let data       = body.slice(16, 16 + payloadLen);
  let isBase64   = !!(handling & 0x01);
  let doStats    = !!(handling & 0x02);
  let doGzip     = !!(handling & 0x04);

  if (doGzip) {
    try { data = zlib.gunzipSync(data); }
    catch (e) { postMessage({ type:'error', message:`gunzip failed: ${e.message}` }); return; }
  }
  if (isBase64) data = data.toString("base64");

  postMessage({type:'receivedata',dataType,timestamp,data,isBase64,doStats,doGzip,signature,encrypted:type === TYPE_DATA_ENCRYPTED,peerKey:`${peer.ip}:${peer.port}`});

  if (doStats) calcStats(getStatsBucket(peer, dataType), seq, now, timestamp);
}

function readHandshake(peer,msg,type){
  postMessage({ type: 'log', message: `readHandshake enter: peer=${peer.name} type=${type===TYPE_HANDSHAKE_INIT?'INIT':'RESP'} connected=${peer.connected} myEph=${!!peer.myEph} keyEpoch=${peer.keyEpoch?peer.keyEpoch.toString():'null'}` });

  let offset = 1;
  peer.theirSig    = msg.subarray(offset, offset += 64);
  let keyEpoch     = msg.subarray(offset, offset += 8);
  peer.theirNonce  = msg.subarray(offset, offset += 32);
  let theirEph     = msg.subarray(offset, offset += 44);
  peer.theirProof  = msg.subarray(offset, offset += 32);
  let tempPeer     ={theirIdDer:msg.subarray(offset)}

  peer.theirEph    = crypto.createPublicKey({ key: theirEph, format: 'der', type: 'spki' });
  tempPeer.theirId = crypto.createPublicKey({ key: tempPeer.theirIdDer, format: 'der', type: 'spki' });
  tempPeer.theirIdExported = tempPeer.theirId.export({ type: 'spki', format: 'pem' });
  const idChange   = peer.theirIdDer != null && !peer.theirIdDer.equals(tempPeer.theirIdDer);
  
  if (!isAllZero(peer.theirProof)) {
    const expected = crypto.createHmac('sha256', peer.sharedKey).update(tempPeer.theirIdDer).digest();
    tempPeer.validated = peer.theirProof.equals(expected);
  } else {
    tempPeer.validated = false;
  }

  const msgToVerify = Buffer.concat([Buffer.from([TYPE_HANDSHAKE_INIT]), keyEpoch, peer.theirNonce, theirEph]);
  const ok = crypto.verify(null, msgToVerify, tempPeer.theirId, peer.theirSig);

  postMessage({ type: 'log', message: `readHandshake sig verify: peer=${peer.name} ok=${ok} validated=${tempPeer.validated} idChange=${idChange} incomingEpoch=${Buffer.from(keyEpoch).readBigUInt64BE(0).toString()} storedEpoch=${peer.keyEpoch?peer.keyEpoch.readBigUInt64BE?peer.keyEpoch.readBigUInt64BE(0).toString():peer.keyEpoch:'null'}` });

  if (tempPeer.validated != peer.validated) {
    peer.validated = tempPeer.validated;
    postMessage({ type: 'peerUpdate', key:`${peer.ip}:${peer.port}`, field:'validated', validated:peer.validated});
  }

  if (!ok) {
    postMessage({ type: 'error', message: `readHandshake EARLY RETURN: sig verify failed for peer ${peer.name}` });
    return;
  } else if (peer.keyEpoch && Buffer.compare(peer.keyEpoch, keyEpoch) >= 0) {
    postMessage({ type: 'error', message: `readHandshake EARLY RETURN: old epoch from peer ${peer.name} - stored=${peer.keyEpoch} incoming=${keyEpoch}` });
    return;
  } else if (!tempPeer.validated) {
    //alert the extension, don't save/send ID
    postMessage({ type: 'error', message: `readHandshake: invalid peer ID for peer ${peer.name} (validated against psk)` });
  } else if ((idChange || !peer.theirId) && tempPeer.validated) {
    //ID new or changed, and the PSK checked out, log and save
    peer.theirId = tempPeer.theirId;
    peer.theirIdExported = tempPeer.theirIdExported;
    peer.theirIdDer = tempPeer.theirIdDer;
    postMessage({ type: 'log', message: `Peer ID updated for peer ${peer.name} (validated by psk)` });
    postMessage({ type: 'peerUpdate', key:`${peer.ip}:${peer.port}`, field:'theirId', theirId:peer.theirIdExported});
  } else if (!peer.theirId) {
    //new ID, log and save
    peer.theirId = tempPeer.theirId;
    peer.theirIdExported = tempPeer.theirIdExported;
    peer.theirIdDer = tempPeer.theirIdDer;
    postMessage({ type: 'log', message: `Peer ID updated for peer ${peer.name}` });
    postMessage({ type: 'peerUpdate', key:`${peer.ip}:${peer.port}`, field:'theirId', theirId:peer.theirIdExported});
  } else if (idChange) {
    //alert the extension, don't save ID
    postMessage({ type: 'error', message: `readHandshake EARLY RETURN: peer ID changed for peer ${peer.name}, unable to verify, not saving` });
    postMessage({ type: 'peerUpdate', message: `unverified Peer ID change for peer ${peer.name}`, key:`${peer.ip}:${peer.port}`, field:'validated', validated:false});
    return;
  }

  let initiatorNonce  = (type === TYPE_HANDSHAKE_INIT) ? peer.theirNonce : peer.myNonce;
  let responderNonce  = (type === TYPE_HANDSHAKE_INIT) ? peer.myNonce    : peer.theirNonce;

  const shared = crypto.diffieHellman({privateKey:peer.myEph.privateKey,publicKey:peer.theirEph});
  peer.sessionKey = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.concat([initiatorNonce, responderNonce]), Buffer.from('udp-handshake'), 32));
  peer.keyEpoch = keyEpoch;
  peer.connected = true;
  postMessage({ type: 'log', message: `Encryption setup for peer ${peer.name}` });
  postMessage({ type: 'peerUpdate', key:`${peer.ip}:${peer.port}`, field:'connected', connected:true});

  peer.theirEph = null;
  peer.theirNonce = null;
  peer.theirSig = null;
  peer.myEph = null;
  peer.myEphExported = null;
  peer.myNonce = null;

  postMessage({ type: 'log', message: `readHandshake complete: peer=${peer.name} session established` });
}
function sendHandshake(peer,type){
  postMessage({ type: 'log', message: `sendHandshake: peer=${peer.name} type=${type===TYPE_HANDSHAKE_INIT?'INIT':'RESP'} connected=${peer.connected} myEph=${!!peer.myEph}` });
  let keyEpoch = Buffer.alloc(8);
  keyEpoch.writeBigUInt64BE(BigInt(Date.now()));
  peer.myEph = crypto.generateKeyPairSync('x25519');
  peer.myEphExported = peer.myEph.publicKey.export({ type: 'spki', format: 'der' });
  peer.myNonce = crypto.randomBytes(32);
  const proof = peer.sharedKey? crypto.createHmac('sha256', peer.sharedKey).update(peer.myId.publicKey.export({ type: 'spki', format: 'der' })).digest() : Buffer.alloc(32, 0);
  let msgToVerify = Buffer.concat([Buffer.from([TYPE_HANDSHAKE_INIT]), keyEpoch, peer.myNonce, peer.myEphExported])
  let sig = crypto.sign(null, msgToVerify, peer.myId.privateKey);
  let out = Buffer.concat([
    Buffer.from([type]),
    sig,                // 64 bytes
    keyEpoch,           // 8 bytes
    peer.myNonce,       // 32 bytes
    peer.myEphExported, // 44 bytes
    proof,              // 32 bytes
    peer.myId.publicKey.export({ type: 'spki', format: 'der' })
  ]);
  udp.send(out, 0, out.length, peer.port, peer.ip, (err) => {
    if (err) postMessage({ type: 'error', message: 'Handshake send error: ' + err.message });
  });
  postMessage({ type: 'log', message: `Handshake sent to ${peer.name}`});
}

function pingPeer(peer) {
  const now = Number(process.hrtime.bigint() / 1000n); // µs
  const buf = Buffer.alloc(9);
  buf[0] = TYPE_PING;
  buf.writeBigUInt64BE(BigInt(now), 1);

  udp.send(buf, 0, buf.length, peer.port, peer.ip, (err) => {
    if (err) {
      postMessage({ type: 'error', message: `Ping send error: ${err.message}` });
      return;
    }
    peer.pingHistory.push({ sent: now, received: null });
    const cutoff = now - ( pingHistoryDuration * 1000 )
    peer.pingHistory = peer.pingHistory.filter(e => e.sent > cutoff);
  });
}
function updateStatus(peer) {
  const now = Number(process.hrtime.bigint() / 1000n); // microseconds
  const elapsed = (now - peer.lastSeen)/1000;
  if (elapsed > deadTime) {
    peer.connected = false;
    peer.responding = false;
    peer.status = null;
    postMessage({type: 'error', message: `Peer ${peer.name} disconnected (reset ping interval to ${pingInterval}ms)` });
    postMessage({type: 'peerUpdate', key:`${peer.ip}:${peer.port}`, field: 'connected', connected:false });
    clearInterval(peer.pingTimer);
    peer.pingTimer = setInterval(() => pingPeer(peer), pingInterval);
    clearInterval(peer.connectedTimer);
  } else if (elapsed > pingInterval && peer.status != 'degraded') {
    peer.status = 'degraded';
    const newInterval = Math.max(1000, Math.floor(pingInterval * 0.2));
    clearInterval(peer.pingTimer);
    peer.pingTimer = setInterval(() => pingPeer(peer), newInterval);
    postMessage({ type: 'log', message: `Peer ${peer.name} degraded (ping rate increased to interval ${newInterval}ms)` });
  } else if (peer.status == 'degraded' && elapsed < pingInterval) {
    peer.status = null;
    clearInterval(peer.pingTimer);
    peer.pingTimer = setInterval(() => pingPeer(peer), pingInterval);
    postMessage({ type: 'log', message: `Peer ${peer.name} recovered (reset ping interval to ${pingInterval}ms)` });
  }
}


function encryptWithKey(key, plaintext) {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}
function decryptWithKey(key, blob) {
  const iv = blob.subarray(0, GCM_IV_LENGTH);
  const tag = blob.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_TAG_LENGTH);
  const ciphertext = blob.subarray(GCM_IV_LENGTH + GCM_TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
function isAllZero(buf) {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 0) return false;
  }
  return true;
}
function getStatsBucket(peer, dataType) {
  let stats = peer.statsMap.get(dataType);
  if (!stats) {
    stats = {
      rxSeq: 0,
      lastRxTime: null,
      lossDetected: 0,
      oooCount: 0,
      duplicateCount: 0,
      jitterSamples: []
    };
    peer.statsMap.set(dataType, stats);
    const t = setInterval(() => {postMessage({ type: 'stats', dataType, stats, peerKey:`${peer.ip}:${peer.port}` }); }, statsReportInterval);
    peer.statsMapTimers.set(dataType, t);
  }
  return stats;
}
function calcStats(stats, seq, now, timestamp) {
  if (stats.rxSeq > 0) {
    let expected = stats.rxSeq + 1;
    if      (seq >  expected    && timestamp >  stats.lastTimestamp) stats.lossDetected += (seq - expected);
    else if (seq == stats.rxSeq && timestamp == stats.lastTimestamp) stats.duplicateCount++;
    else if (seq <  stats.rxSeq && timestamp <  stats.lastTimestamp) stats.oooCount++;
    else if (!(seq == expected  && timestamp > stats.lastTimestamp)) stats.rxSeq = seq;

    if (stats.lastRxTime !== null) {
      let delta = now - stats.lastRxTime;
      stats.jitterSamples.push(delta);
     if (stats.jitterSamples.length > jitterSamplesCount) stats.jitterSamples.shift();
    }
  }

  if (seq > stats.rxSeq) stats.rxSeq = seq;
  stats.lastRxTime = now;
  stats.lastTimestamp = timestamp;
}
