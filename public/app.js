(() => {
  'use strict';

  const CHUNK_SIZE = 64 * 1024;
  let ICE_SERVERS = [];

  // --- Theme toggle ---
  const themeBtn = document.getElementById('theme-toggle-btn');
  const sunSvg  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const moonSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

  function applyTheme(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    themeBtn.innerHTML = dark ? sunSvg : moonSvg;
    themeBtn.title = dark ? 'ライトテーマに切替' : 'ダークテーマに切替';
  }

  applyTheme(document.documentElement.dataset.theme !== 'light');
  themeBtn.addEventListener('click', () => {
    const nextDark = document.documentElement.dataset.theme !== 'dark';
    localStorage.setItem('theme', nextDark ? 'dark' : 'light');
    applyTheme(nextDark);
  });

  // Views
  const viewHome = document.getElementById('view-home');
  const viewWait = document.getElementById('view-wait');
  const viewTransfer = document.getElementById('view-transfer');

  // Auth / home
  const authArea = document.getElementById('auth-area');
  const sendAuthUi = document.getElementById('send-auth-ui');
  const roomInput = document.getElementById('room-input');
  const btnJoin = document.getElementById('btn-join');

  // Wait
  const waitLabel = document.getElementById('wait-label');
  const shareLinkText = document.getElementById('share-link-text');
  const roomIdDisplay = document.getElementById('room-id-display');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnCancelWait = document.getElementById('btn-cancel-wait');

  // Transfer
  const btnDisconnect = document.getElementById('btn-disconnect');
  const sendArea = document.getElementById('send-area');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const sendProgressWrap = document.getElementById('send-progress-wrap');
  const sendFilename = document.getElementById('send-filename');
  const sendPercent = document.getElementById('send-percent');
  const sendBar = document.getElementById('send-bar');
  const sendSpeed = document.getElementById('send-speed');
  const receivedList = document.getElementById('received-list');
  const toast = document.getElementById('toast');

  // State
  let ws = null;
  let pc = null;
  let dataChannel = null;
  let currentRoom = null;
  let myRole = null;
  let toastTimer = null;

  // Receive state
  let recvMeta = null;
  let recvChunks = [];
  let recvBytes = 0;
  let recvItemEl = null;

  // Send state
  let sendStartTime = null;

  // --- Init ---
  async function init() {
    let me;
    try {
      [me, ICE_SERVERS] = await Promise.all([
        fetch('/api/me').then(r => r.json()),
        fetch('/api/ice-servers').then(r => r.json()),
      ]);
    } catch {
      me = { authenticated: false, oidcAvailable: false };
      ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
    }

    renderAuth(me);

    if (new URLSearchParams(location.search).get('auth_error')) {
      showToast('認証に失敗しました。再度お試しください。', 'error');
    }

    const autoJoinId = new URLSearchParams(location.search).get('join');
    if (autoJoinId) {
      history.replaceState({}, '', '/');
      startConnect(autoJoinId.toUpperCase(), 'receiver');
    } else {
      showView('home');
    }
  }

  // --- Auth rendering ---
  function renderAuth(me) {
    if (me.authenticated) {
      const { name, email, picture, role } = me.user;
      const initial = (name || email || '?')[0].toUpperCase();

      authArea.innerHTML = `
        <div class="profile-menu">
          <button id="profile-btn" class="user-chip" aria-expanded="false">
            ${picture
              ? `<img src="${escHtml(picture)}" class="avatar" alt="">`
              : `<div class="avatar-placeholder">${initial}</div>`}
            <span class="user-name">${escHtml(name || email || '')}</span>
          </button>
          <div id="profile-dropdown" class="profile-dropdown hidden">
            <a href="/settings" class="menu-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              アカウント
            </a>
            ${role === 'admin' ? `
            <a href="/admin/server" class="menu-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="8" rx="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
              サーバー管理
            </a>` : ''}
            <div class="menu-sep"></div>
            <a href="/auth/logout" class="menu-item menu-danger">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              ログアウト
            </a>
          </div>
        </div>
      `;
      const btn = document.getElementById('profile-btn');
      const dropdown = document.getElementById('profile-dropdown');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !dropdown.classList.contains('hidden');
        dropdown.classList.toggle('hidden', open);
        btn.setAttribute('aria-expanded', String(!open));
      });
      document.addEventListener('click', () => dropdown.classList.add('hidden'), { capture: true });

      sendAuthUi.innerHTML = `
        <button id="btn-create" class="btn btn-primary btn-block">ルームを作成</button>
      `;
      document.getElementById('btn-create').addEventListener('click', createRoom);
    } else {
      authArea.innerHTML = `<a href="/login" class="btn btn-primary btn-sm">ログイン</a>`;
      sendAuthUi.innerHTML = `
        <p class="send-hint">ファイルを送るにはログインが必要です</p>
        <a href="/login" class="btn btn-primary btn-block">ログインして送信</a>
      `;
    }
  }

  // --- View management ---
  function showView(name) {
    viewHome.classList.toggle('hidden', name !== 'home');
    viewWait.classList.toggle('hidden', name !== 'wait');
    viewTransfer.classList.toggle('hidden', name !== 'transfer');
  }

  // --- Connection ---
  function createRoom() {
    const room = randomRoomId();
    myRole = 'sender';
    connectWS(() => wsSend({ type: 'join', room, role: 'sender' }));
  }

  function startConnect(room, role) {
    myRole = role;

    if (role === 'receiver') {
      waitLabel.textContent = '送信者に接続しています...';
      showView('wait');
    }

    connectWS(() => wsSend({ type: 'join', room, role }));
  }

  // --- WebSocket ---
  function connectWS(onOpen) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.addEventListener('open', onOpen, { once: true });
    ws.addEventListener('message', onWsMessage);
    ws.addEventListener('close', () => {
      if (pc) {
        showToast('接続が切れました', 'error');
        reset();
      }
    });
  }

  function wsSend(msg) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  async function onWsMessage(e) {
    const msg = JSON.parse(e.data);

    switch (msg.type) {
      case 'joined': {
        currentRoom = msg.room;

        if (myRole === 'sender') {
          const link = `${location.origin}/?join=${msg.room}`;
          waitLabel.textContent = '受信者を待っています';
          shareLinkText.textContent = link;
          roomIdDisplay.textContent = msg.room;
          showView('wait');

          if (msg.peers === 2 && !pc) {
            await setupPC(true);
            await createOffer();
          }
        } else {
          // Receiver joined — wait for sender's offer
          if (!pc) await setupPC(false);
        }
        break;
      }

      case 'peer_joined': {
        if (myRole === 'sender' && !pc) {
          await setupPC(true);
          await createOffer();
        }
        break;
      }

      case 'offer': {
        if (!pc) await setupPC(false);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsSend({ type: 'answer', sdp: pc.localDescription });
        break;
      }

      case 'answer': {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        break;
      }

      case 'ice': {
        if (msg.candidate && pc) {
          try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
        }
        break;
      }

      case 'peer_left': {
        showToast('相手が切断しました', 'error');
        reset();
        break;
      }

      case 'error': {
        const messages = {
          auth_required: '送信にはログインが必要です',
          room_full: 'ルームが満員です（2人まで）',
        };
        showToast(messages[msg.code] || msg.message, 'error');
        reset();
        break;
      }
    }
  }

  // --- WebRTC ---
  async function setupPC(initiator) {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => wsSend({ type: 'ice', candidate: e.candidate });

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        showView('transfer');
        if (myRole === 'sender') sendArea.classList.remove('hidden');
      } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        if (viewTransfer && !viewTransfer.classList.contains('hidden')) {
          showToast('接続が切れました', 'error');
          reset();
        }
      }
    };

    if (initiator) {
      dataChannel = pc.createDataChannel('file', { ordered: true });
      setupDataChannel(dataChannel);
    } else {
      pc.ondatachannel = (e) => {
        dataChannel = e.channel;
        setupDataChannel(dataChannel);
      };
    }
  }

  async function createOffer() {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsSend({ type: 'offer', sdp: pc.localDescription });
  }

  // --- DataChannel ---
  function setupDataChannel(ch) {
    ch.binaryType = 'arraybuffer';
    ch.onmessage = (e) => {
      if (typeof e.data === 'string') {
        recvMeta = JSON.parse(e.data);
        recvChunks = [];
        recvBytes = 0;
        recvItemEl = createReceivingItem(recvMeta);
      } else {
        recvChunks.push(e.data);
        recvBytes += e.data.byteLength;
        const pct = Math.round((recvBytes / recvMeta.size) * 100);
        updateReceivingItem(recvItemEl, pct);
        if (recvBytes >= recvMeta.size) {
          finalizeReceive(recvItemEl, recvMeta, new Blob(recvChunks, { type: recvMeta.type }));
          recvMeta = null;
          recvChunks = [];
        }
      }
    };
  }

  // --- Send file ---
  function sendFile(file) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      showToast('接続されていません', 'error');
      return;
    }

    dataChannel.send(JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    }));

    sendFilename.textContent = file.name;
    sendPercent.textContent = '0%';
    sendBar.style.width = '0%';
    sendSpeed.textContent = '';
    sendProgressWrap.classList.remove('hidden');

    let offset = 0;
    sendStartTime = Date.now();
    let lastTime = Date.now();
    let lastBytes = 0;
    const reader = new FileReader();

    function readChunk() {
      reader.readAsArrayBuffer(file.slice(offset, offset + CHUNK_SIZE));
    }

    reader.onload = (e) => {
      function trySend() {
        if (dataChannel.bufferedAmount > CHUNK_SIZE * 8) {
          setTimeout(trySend, 10);
          return;
        }
        dataChannel.send(e.target.result);
        offset += e.target.result.byteLength;

        const pct = Math.min(100, Math.round((offset / file.size) * 100));
        sendBar.style.width = pct + '%';
        sendPercent.textContent = pct + '%';

        const now = Date.now();
        if (now - lastTime >= 500) {
          sendSpeed.textContent = formatBytes((offset - lastBytes) / ((now - lastTime) / 1000)) + '/s';
          lastTime = now;
          lastBytes = offset;
        }

        if (offset < file.size) {
          readChunk();
        } else {
          sendSpeed.textContent = '完了 (' + formatBytes(file.size / ((Date.now() - sendStartTime) / 1000)) + '/s 平均)';
        }
      }
      trySend();
    };

    readChunk();
  }

  // --- Receive UI ---
  function createReceivingItem(meta) {
    receivedList.querySelector('.empty-msg')?.remove();
    const el = document.createElement('div');
    el.className = 'received-item receiving';
    el.innerHTML = `
      <span class="file-icon">${fileIcon(meta.type)}</span>
      <div class="file-details">
        <div class="file-name">${escHtml(meta.name)}</div>
        <div class="file-size">受信中... / ${formatBytes(meta.size)}</div>
        <div class="recv-bar-wrap">
          <div class="progress-bar"><div class="progress-fill recv-fill"></div></div>
        </div>
      </div>
    `;
    receivedList.prepend(el);
    return el;
  }

  function updateReceivingItem(el, pct) {
    if (!el) return;
    el.querySelector('.recv-fill').style.width = pct + '%';
    el.querySelector('.file-size').textContent =
      `${formatBytes((pct / 100) * (recvMeta?.size || 0))} / ${formatBytes(recvMeta?.size || 0)}`;
  }

  function finalizeReceive(el, meta, blob) {
    if (!el) return;
    el.classList.remove('receiving');
    const url = URL.createObjectURL(blob);
    el.innerHTML = `
      <span class="file-icon">${fileIcon(meta.type)}</span>
      <div class="file-details">
        <div class="file-name">${escHtml(meta.name)}</div>
        <div class="file-size">${formatBytes(meta.size)}</div>
      </div>
      <a href="${url}" download="${escHtml(meta.name)}" class="btn-download">保存</a>
    `;
  }

  // --- Reset ---
  function reset() {
    if (pc) { pc.close(); pc = null; }
    if (ws) { ws.close(); ws = null; }
    dataChannel = null;
    currentRoom = null;
    myRole = null;
    recvMeta = null;
    recvChunks = [];
    recvBytes = 0;
    recvItemEl = null;

    receivedList.innerHTML = '<p class="empty-msg">ファイルの受信を待っています...</p>';
    sendProgressWrap?.classList.add('hidden');
    sendArea?.classList.add('hidden');
    showView('home');
  }

  // --- Toast ---
  function showToast(msg, type = 'info') {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);
  }

  // --- Helpers ---
  function randomRoomId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function formatBytes(b) {
    b = Number(b);
    if (b < 1024) return b.toFixed(0) + ' B';
    if (b < 1024 ** 2) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(1) + ' MB';
    return (b / 1024 ** 3).toFixed(2) + ' GB';
  }

  function fileIcon(type) {
    if (!type) return '📁';
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📄';
    if (/zip|tar|gz|7z|rar/.test(type)) return '🗜️';
    return '📁';
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- Event listeners ---
  btnJoin.addEventListener('click', () => {
    const room = roomInput.value.trim().toUpperCase();
    if (!room) { showToast('ルームIDを入力してください', 'error'); return; }
    startConnect(room, 'receiver');
  });

  roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnJoin.click(); });

  btnCopyLink.addEventListener('click', () => {
    navigator.clipboard.writeText(shareLinkText.textContent)
      .then(() => showToast('リンクをコピーしました'))
      .catch(() => showToast('コピーに失敗しました', 'error'));
  });

  btnCancelWait.addEventListener('click', reset);
  btnDisconnect.addEventListener('click', reset);

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) sendFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) { sendFile(fileInput.files[0]); fileInput.value = ''; }
  });

  // Start
  init();
})();
