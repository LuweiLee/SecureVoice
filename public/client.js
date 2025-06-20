// public/client.js

// --- DOM 元素 ---
const loginModal = document.getElementById('login-modal');
const appContainer = document.getElementById('app');
const joinButton = document.getElementById('joinButton');
const usernameInput = document.getElementById('usernameInput'); // 新增
const roomNameInput = document.getElementById('roomNameInput');
const statusText = document.getElementById('statusText');

const localAudio = document.getElementById('localAudio');
const remoteAudioContainer = document.getElementById('remote-audio-container');
const roomNameDisplay = document.getElementById('room-name-display');
const myPeerIdDisplay = document.getElementById('my-peer-id-display');
const micToggleButton = document.getElementById('mic-toggle-footer-btn');
const myAvatar = document.querySelector('.my-avatar');
const connectionLatencyDisplay = document.getElementById('connection-latency');
const connectionQualityDisplay = document.getElementById('connection-quality');
const connectionStateDisplay = document.getElementById('connection-state');

const toggleChatButton = document.getElementById('toggle-chat-btn');
const disconnectButton = document.getElementById('disconnect-btn');
const chatArea = document.querySelector('.chat-area');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const userListSidebar = document.getElementById('user-list-sidebar');

// 服务器选择相关元素
const serverSelect = document.getElementById('serverSelect');
const serverInfoBtn = document.getElementById('serverInfoBtn');
const serverInfoModal = document.getElementById('server-info-modal');
const closeServerInfoBtn = document.getElementById('closeServerInfoBtn');
const serverInfoContent = document.getElementById('serverInfoContent');

// --- WebRTC & WebSocket 全局变量 ---
let localStream;
let myPeerId;
let socket;
const peerConnections = new Map();
const visualizers = new Map(); // 存储 visualizer 实例
const pendingIceCandidates = new Map(); // 存储待处理的ICE候选
// 服务器配置
const serverConfigs = {
    'china-optimized': {
        name: '中国优化',
        description: '针对中国大陆网络环境优化的STUN服务器',
        iceServers: [
            { urls: 'stun:stun.voipbuster.com:3478' },
            { urls: 'stun:stun.miwifi.com:3478' },
            { urls: 'stun:stun.cloudflare.com:3478' }
        ]
    },
    'global-standard': {
        name: '全球标准',
        description: '使用Google等全球标准STUN服务器',
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ]
    },
    'turn-enabled': {
        name: 'TURN增强',
        description: '包含TURN服务器，适用于严格NAT环境',
        iceServers: [
            { urls: 'stun:stun.voipbuster.com:3478' },
            { urls: 'stun:stun.wirlab.net:3478' },
            {
                urls: 'turn:relay1.expressturn.com:3480',
                username: '000000002065629175',
                credential: 'i5d1YIapn3pSTo27j0FlbFm6C0w='
            },
            { urls: 'stun:stun.l.google.com:19302' }
        ],
        iceTransportPolicy: 'all' // 允许所有传输方式
    },
    'turn-only': {
        name: 'TURN专用',
        description: '强制使用TURN中继，适用于无法P2P连接的环境',
        iceServers: [
            {
                urls: 'turn:relay1.expressturn.com:3480',
                username: '000000002065629175',
                credential: 'i5d1YIapn3pSTo27j0FlbFm6C0w='
            }
        ],
        iceTransportPolicy: 'relay' // 强制使用中继
    },
    'custom': {
        name: '自定义配置',
        description: '可自定义的服务器配置',
        iceServers: [
            { urls: 'stun:stun.voipbuster.com:3478' }
        ]
    }
};

// 当前选择的服务器配置
let currentServerConfig = serverConfigs['china-optimized'];

// --- 主流程 ---

joinButton.onclick = async () => {
    const username = usernameInput.value.trim(); // 获取用户名
    const roomName = roomNameInput.value.trim();
    if (!username) { // 验证用户名
        alert('请输入您的用户名');
        return;
    }
    if (!roomName) {
        alert('请输入房间名');
        return;
    }

    usernameInput.disabled = true; // 禁用用户名输入框

    joinButton.disabled = true;
    roomNameInput.disabled = true;
    statusText.textContent = '正在获取麦克风...';
    statusText.classList.remove('hidden');

    try {
        const audioConstraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        };
        localStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
        localAudio.srcObject = localStream;
        
        // 设置本地音频可视化
        setupLocalAudioVisualizer();

        statusText.textContent = '正在连接服务器...';

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
        setupWebSocketListeners(roomName, username); // 传递用户名

    } catch (error) {
        console.error('获取媒体设备失败:', error);
        statusText.textContent = '无法访问麦克风。请检查权限。';
        joinButton.disabled = false;
        roomNameInput.disabled = false;
        usernameInput.disabled = false; // 重新启用用户名输入框
    }
};

micToggleButton.onclick = () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        micToggleButton.classList.toggle('muted', !audioTrack.enabled);
        const icon = micToggleButton.querySelector('i');
        if (icon) {
            icon.className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
        }
    }
};

toggleChatButton.onclick = () => {
    chatArea.classList.toggle('hidden');
};

disconnectButton.onclick = () => {
    // 断开连接
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }
    cleanup();
};

// 服务器选择事件
serverSelect.onchange = () => {
    const selectedConfig = serverSelect.value;
    currentServerConfig = serverConfigs[selectedConfig];
    console.log(`切换到服务器配置: ${currentServerConfig.name}`);
};

// 服务器信息按钮
serverInfoBtn.onclick = () => {
    showServerInfo();
};

// 关闭服务器信息模态框
closeServerInfoBtn.onclick = () => {
    serverInfoModal.classList.add('hidden');
};

// 点击模态框外部关闭
serverInfoModal.onclick = (e) => {
    if (e.target === serverInfoModal) {
        serverInfoModal.classList.add('hidden');
    }
};


// --- WebSocket 事件处理 ---

function setupWebSocketListeners(roomName, username) { // 接收用户名
    socket.onopen = () => {
        statusText.textContent = '正在加入房间...';
        // 在连接打开时发送 join-room 消息，包含用户名
        socket.send(JSON.stringify({ type: 'join-room', data: { roomName, username } }));
    };

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const { type, data } = message;

        switch (type) {
            case 'your-id':
                myPeerId = data.peerId;
                // myPeerIdDisplay.textContent = `ID: ${myPeerId.substring(0, 8)}`; // 不再显示ID
                myPeerIdDisplay.textContent = username; // 显示用户名
                updateStatus(`成功加入房间: ${roomName}`);
                roomNameDisplay.textContent = roomName;
                loginModal.classList.add('hidden');
                appContainer.classList.remove('hidden');
                connectionStateDisplay.textContent = 'Voice Connected';
                connectionStateDisplay.classList.add('connected');

                // 在主内容区添加自己的卡片
                addMyAudioCard(username);

                // 定期更新连接延迟和质量
                setInterval(updateConnectionStats, 5000);
                // 定期检查连接状态
                setInterval(checkAllConnectionStates, 3000);

                // 运行网络诊断
                setTimeout(() => {
                    diagnoseNetworkConnectivity();
                }, 2000);

                // 将自己添加到侧边栏
                addSidebarUser(myPeerId, username);

                // 为每个已存在的 peer 创建连接并发送 offer
                if (Array.isArray(data.peers)) { // data.peers 现在包含 { peerId, username }
                    data.peers.forEach(peer => {
                        createAndSendOffer(peer.peerId);
                        // 在侧边栏添加已存在的用户
                        addSidebarUser(peer.peerId, peer.username);
                    });
                }
                chatInput.disabled = false;
                sendButton.disabled = false;
                setupChat();
                break;
            case 'new-peer':
                console.log(`新成员加入: ${data.peerId} (${data.username})`);
                addChatMessage('系统', `成员 ${data.username} 加入了频道。`);
                // 主动向新成员发起连接
                createAndSendOffer(data.peerId);
                // 在侧边栏添加新用户
                addSidebarUser(data.peerId, data.username);
                break;
            case 'offer':
                handleOffer(data.sdp, data.senderId, data.senderUsername); // 传递用户名
                break;
            case 'answer':
                handleAnswer(data.sdp, data.senderId);
                break;
            case 'ice-candidate':
                handleIceCandidate(data.candidate, data.senderId);
                break;
            case 'chat-message':
                addChatMessage(data.senderUsername, data.message, false); // 使用用户名
                break;
            case 'peer-disconnected':
                handlePeerDisconnect(data.peerId);
                addChatMessage('系统', `成员 ${data.username} 离开了频道。`); // 使用用户名
                break;
            case 'username-taken': // 新增：处理用户名重复
                alert(`用户名 "${data.username}" 已被占用，请选择其他用户名。`);
                cleanup(); // 清理并重新启用输入
                break;
        }
    };

    socket.onclose = () => {
        alert('与服务器的连接已断开，请刷新页面重试。');
        cleanup();
    };
    
    socket.onerror = (error) => {
        console.error("WebSocket Error:", error);
         alert('连接发生错误，请刷新页面重试。');
        cleanup();
    };
}


// --- WebRTC 核心函数 ---

function createPeerConnection(peerId) {
    if (peerConnections.has(peerId)) {
        return peerConnections.get(peerId);
    }

    console.log(`创建与 ${peerId} 的 PeerConnection，使用配置: ${currentServerConfig.name}`);

    // 验证TURN服务器配置
    const turnServers = currentServerConfig.iceServers.filter(server =>
        server.urls.startsWith('turn:') || server.urls.startsWith('turns:')
    );

    if (turnServers.length > 0) {
        console.log('🔍 TURN服务器配置验证:');
        turnServers.forEach((server, index) => {
            console.log(`  TURN ${index + 1}:`, {
                urls: server.urls,
                hasUsername: !!server.username,
                hasCredential: !!server.credential,
                username: server.username ? `${server.username.substring(0, 6)}...` : 'missing',
                credential: server.credential ? `${server.credential.substring(0, 6)}...` : 'missing'
            });

            if (!server.username || !server.credential) {
                console.error(`❌ TURN服务器配置错误: ${server.urls} 缺少username或credential`);
            }
        });
    }

    const pc = new RTCPeerConnection(currentServerConfig);
    peerConnections.set(peerId, pc);

    // 初始化待处理的ICE候选队列
    if (!pendingIceCandidates.has(peerId)) {
        pendingIceCandidates.set(peerId, []);
    }

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    // 处理ICE候选收集
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`🧊 发送ICE候选给 ${peerId}:`, {
                type: event.candidate.type,
                protocol: event.candidate.protocol,
                address: event.candidate.address,
                port: event.candidate.port,
                foundation: event.candidate.foundation
            });
            socket.send(JSON.stringify({
                type: 'ice-candidate',
                data: { target: peerId, candidate: event.candidate }
            }));
        } else {
            console.log(`✅ ICE候选收集完成: ${peerId}`);
        }
    };

    pc.ontrack = (event) => {
        console.log(`🎵 收到来自 ${peerId} 的音频流`);
        addRemoteAudioStream(peerId, event.streams[0]);

        // 收到音频流是连接成功的强烈信号，立即更新状态
        console.log(`🎯 音频流已建立，标记 ${peerId} 为已连接`);
        updatePeerConnectionStatus(peerId, 'connected');

        // 设置标记，表示此连接已通过音频流确认成功
        // 这样状态检查逻辑就不会重置状态
        pc._audioStreamEstablished = true;
    };

    pc.onconnectionstatechange = () => {
        console.log(`与 ${peerId} 的连接状态: ${pc.connectionState}`);
        updatePeerConnectionStatus(peerId, pc.connectionState);

        if(pc.connectionState === 'connected') {
            console.log(`✅ 与 ${peerId} 连接成功`);
        } else if(pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            console.log(`❌ 与 ${peerId} 连接失败或断开: ${pc.connectionState}`);
            handlePeerDisconnect(peerId);
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log(`与 ${peerId} 的ICE连接状态: ${pc.iceConnectionState}`);

        // ICE连接状态也很重要，用它来更新UI状态
        switch (pc.iceConnectionState) {
            case 'connected':
            case 'completed':
                console.log(`🔗 与 ${peerId} 的ICE连接成功`);
                updatePeerConnectionStatus(peerId, 'connected');
                break;
            case 'disconnected':
                console.log(`🔌 与 ${peerId} 的ICE连接断开`);
                updatePeerConnectionStatus(peerId, 'disconnected');
                break;
            case 'failed':
                console.log(`❌ 与 ${peerId} 的ICE连接失败`);
                updatePeerConnectionStatus(peerId, 'failed');
                // ICE连接失败时尝试重新启动ICE
                setTimeout(() => {
                    console.log(`🔄 尝试重新启动ICE连接: ${peerId}`);
                    pc.restartIce();
                }, 2000);
                break;
            case 'checking':
                console.log(`🔍 正在检查ICE连接: ${peerId}`);
                updatePeerConnectionStatus(peerId, 'connecting');
                break;
            case 'new':
                updatePeerConnectionStatus(peerId, 'connecting');
                break;
        }
    };

    pc.onicegatheringstatechange = () => {
        console.log(`与 ${peerId} 的ICE收集状态: ${pc.iceGatheringState}`);
        if (pc.iceGatheringState === 'complete') {
            console.log(`✅ ICE候选收集完成: ${peerId}`);
            // 收集完成后检查连接状态
            setTimeout(() => {
                console.log(`📊 连接状态检查 ${peerId}: connection=${pc.connectionState}, ice=${pc.iceConnectionState}, signaling=${pc.signalingState}`);
            }, 1000);
        }
    };

    // 添加数据通道状态监听（可选，用于调试）
    pc.ondatachannel = (event) => {
        console.log(`📡 收到数据通道: ${peerId}`, event.channel.label);
    };

    return pc;
}

async function createAndSendOffer(peerId) {
    console.log(`创建并发送offer给 ${peerId}`);

    // 防止重复发送offer
    if (makingOffer.get(peerId)) {
        console.log(`正在为 ${peerId} 创建offer，跳过重复请求`);
        return;
    }

    try {
        makingOffer.set(peerId, true);
        const pc = createPeerConnection(peerId);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log(`发送offer给 ${peerId}`);

        socket.send(JSON.stringify({
            type: 'offer',
            data: { target: peerId, sdp: pc.localDescription }
        }));
    } catch (error) {
        console.error(`创建或发送offer失败: ${peerId}`, error);
    } finally {
        makingOffer.set(peerId, false);
    }
}
 
// 存储 peerId 到 username 的映射
const peerIdToUsernameMap = new Map();
// 存储 peerId 到连接状态的映射
const peerConnectionStates = new Map();
// 存储正在进行的offer操作，避免重复发送
const makingOffer = new Map();
// 存储忽略的offer，用于处理竞争条件
const ignoreOffer = new Map();

async function handleOffer(sdp, senderId, senderUsername) { // 接收用户名
    console.log(`收到来自 ${senderId} (${senderUsername}) 的offer`);
    peerIdToUsernameMap.set(senderId, senderUsername); // 存储映射

    const pc = createPeerConnection(senderId);

    // 实现polite/impolite peer模式来处理offer冲突
    const isPolite = myPeerId < senderId; // 使用字符串比较来决定谁是polite peer
    const offerCollision = pc.signalingState !== 'stable' || makingOffer.get(senderId);

    ignoreOffer.set(senderId, !isPolite && offerCollision);
    if (ignoreOffer.get(senderId)) {
        console.log(`忽略来自 ${senderId} 的offer（offer冲突，我是impolite peer）`);
        return;
    }

    try {
        // 如果当前正在发送offer且我们是polite peer，需要回滚
        if (offerCollision && isPolite) {
            console.log(`检测到offer冲突，作为polite peer回滚本地描述`);
            await pc.setLocalDescription({type: 'rollback'});
            makingOffer.set(senderId, false);
        }

        // 设置远程描述
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log(`已设置来自 ${senderId} 的远程描述`);

        // 处理待处理的ICE候选
        const pendingCandidates = pendingIceCandidates.get(senderId) || [];
        for (const candidate of pendingCandidates) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log(`添加待处理的ICE候选成功: ${senderId}`);
            } catch (e) {
                console.error(`添加待处理的ICE候选失败: ${senderId}`, e);
            }
        }
        pendingIceCandidates.set(senderId, []); // 清空待处理队列

        // 创建并发送answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log(`发送answer给 ${senderId}`);

        socket.send(JSON.stringify({
            type: 'answer',
            data: { target: senderId, sdp: pc.localDescription }
        }));
    } catch (error) {
        console.error(`处理offer失败: ${senderId}`, error);
    }
}

async function handleAnswer(sdp, senderId) {
    console.log(`收到来自 ${senderId} 的answer，当前信令状态:`, peerConnections.get(senderId)?.signalingState);
    const pc = peerConnections.get(senderId);

    if (!pc) {
        console.error(`未找到与 ${senderId} 的PeerConnection`);
        return;
    }

    try {
        // 检查信令状态，确保可以设置远程描述
        if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            console.log(`已设置来自 ${senderId} 的answer`);

            // 处理待处理的ICE候选
            const pendingCandidates = pendingIceCandidates.get(senderId) || [];
            for (const candidate of pendingCandidates) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log(`添加待处理的ICE候选成功: ${senderId}`);
                } catch (e) {
                    console.error(`添加待处理的ICE候选失败: ${senderId}`, e);
                }
            }
            pendingIceCandidates.set(senderId, []); // 清空待处理队列
        } else {
            console.warn(`无法设置远程描述，当前信令状态: ${pc.signalingState}`);
        }
    } catch (e) {
        console.error(`设置远程描述失败: ${senderId}`, e);
    } finally {
        // 重置状态标志
        makingOffer.set(senderId, false);
    }
}

async function handleIceCandidate(candidate, senderId) {
    console.log(`🧊 收到来自 ${senderId} 的ICE候选:`, {
        type: candidate.type || 'unknown',
        protocol: candidate.protocol,
        address: candidate.address,
        port: candidate.port,
        foundation: candidate.foundation,
        priority: candidate.priority
    });

    const pc = peerConnections.get(senderId);

    if (!pc) {
        console.warn(`⚠️ 未找到与 ${senderId} 的PeerConnection，暂存ICE候选`);
        if (!pendingIceCandidates.has(senderId)) {
            pendingIceCandidates.set(senderId, []);
        }
        pendingIceCandidates.get(senderId).push(candidate);
        return;
    }

    try {
        // 检查是否应该忽略ICE候选（在忽略offer的情况下）
        if (ignoreOffer.get(senderId)) {
            console.log(`🚫 忽略来自 ${senderId} 的ICE候选（正在忽略offer）`);
            return;
        }

        // 检查是否可以添加ICE候选
        if (pc.remoteDescription && pc.remoteDescription.type) {
            // 确保候选有效
            if (candidate && (candidate.candidate || candidate.type)) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log(`✅ 成功添加ICE候选: ${senderId} (${candidate.type || 'unknown'})`);

                // 添加候选后检查连接状态
                setTimeout(() => {
                    console.log(`📊 ICE候选添加后状态检查 ${senderId}: ice=${pc.iceConnectionState}, connection=${pc.connectionState}`);
                }, 1000);
            } else {
                console.warn(`⚠️ 无效的ICE候选: ${senderId}`, candidate);
            }
        } else {
            console.log(`⏳ 远程描述未设置，暂存ICE候选: ${senderId}`);
            if (!pendingIceCandidates.has(senderId)) {
                pendingIceCandidates.set(senderId, []);
            }
            pendingIceCandidates.get(senderId).push(candidate);
        }
    } catch(e) {
        console.error(`❌ 添加ICE候选失败: ${senderId}`, e, candidate);
        // 如果添加失败，不要阻止后续候选的处理
    }
}


function handlePeerDisconnect(peerId) {
    console.log(`处理与 ${peerId} 的断开连接`);

    const pc = peerConnections.get(peerId);
    if (pc) {
        pc.close();
        peerConnections.delete(peerId);
    }

    // 清理所有相关状态
    pendingIceCandidates.delete(peerId);
    makingOffer.delete(peerId);
    ignoreOffer.delete(peerId);

    const visualizer = visualizers.get(peerId);
    if(visualizer) {
        visualizer.stop();
        visualizers.delete(peerId);
    }

    const audioCard = document.getElementById(`audio-card-${peerId}`);
    if (audioCard) {
        audioCard.remove();
    }

    const sidebarUser = document.getElementById(`sidebar-user-${peerId}`);
    if (sidebarUser) {
        sidebarUser.remove();
    }

    // 清理用户名映射和连接状态
    peerIdToUsernameMap.delete(peerId);
    peerConnectionStates.delete(peerId);

    console.log(`与成员 ${peerId} 的连接已关闭`);
}


// --- 聊天功能 ---

function setupChat() {
    sendButton.onclick = sendMessage;
    chatInput.onkeydown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    };
}

function sendMessage() {
    const message = chatInput.value.trim();
    if (message && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'chat-message',
            data: { message, senderUsername: myPeerIdDisplay.textContent } // 发送用户名
        }));
        addChatMessage('我', message, true);
        chatInput.value = '';
    }
}

function addChatMessage(sender, message, isMe) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    if(isMe) messageElement.style.color = '#fff';

    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit'});

    const senderSpan = document.createElement('span');
    senderSpan.className = 'peer-id';
    senderSpan.textContent = sender;
    
    const messageText = document.createElement('span');
    messageText.textContent = message;

    messageElement.appendChild(timestamp);
    messageElement.appendChild(senderSpan);
    messageElement.appendChild(messageText);
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}


// --- 状态更新 ---
function updateStatus(message) {
    if (statusText) {
        statusText.textContent = message;
        statusText.classList.remove('hidden');
    } else {
        console.warn("statusText element not found. Cannot update status:", message);
    }
}

// --- UI & 可视化 ---

function setupLocalAudioVisualizer() {
    if(!localStream || !myAvatar) return;
    
    // 我们不需要为本地音频绘制 canvas, 只需要音量回调
    const localVisualizer = createVisualizer(localStream, null, (volume) => {
        // 设置一个阈值来判断是否在说话
        if (volume > 5) { // 这个值可能需要微调
            myAvatar.classList.add('speaking');
        } else {
            myAvatar.classList.remove('speaking');
        }
    });

    visualizers.set('local', localVisualizer);
}

// 添加自己的音频卡片到主内容区
function addMyAudioCard(username) {
    if (!document.getElementById('audio-card-my')) {
        const card = document.createElement('div');
        card.id = 'audio-card-my';
        card.className = 'audio-card my-card';

        const avatar = document.createElement('div');
        avatar.className = 'avatar my-avatar';
        avatar.textContent = username.charAt(0).toUpperCase();

        const peerInfo = document.createElement('div');
        peerInfo.className = 'peer-info my-name';
        peerInfo.textContent = `${username} (你)`;

        // 创建用户信息容器
        const userInfoContainer = document.createElement('div');
        userInfoContainer.className = 'user-info-container';
        userInfoContainer.appendChild(peerInfo);

        // 添加本地音频标识
        const localLabel = document.createElement('span');
        localLabel.className = 'local-audio-label';
        localLabel.innerHTML = '<i class="fas fa-microphone"></i>';
        localLabel.title = '本地音频';
        userInfoContainer.appendChild(localLabel);

        card.appendChild(avatar);
        card.appendChild(userInfoContainer);

        // 插入到容器的第一个位置
        remoteAudioContainer.insertBefore(card, remoteAudioContainer.firstChild);
    }
}

function addRemoteAudioStream(peerId, stream) {
    // --- 1. 在主内容区创建音频卡片 (保持不变) ---
    if (!document.getElementById(`audio-card-${peerId}`)) {
        const card = document.createElement('div');
        card.id = `audio-card-${peerId}`;
        card.className = 'audio-card';

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        const username = peerIdToUsernameMap.get(peerId) || `User`;
        avatar.textContent = username.charAt(0).toUpperCase();

        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.playsInline = true;

        const peerInfo = document.createElement('div');
        peerInfo.className = 'peer-info';
        peerInfo.textContent = username;

        // 添加音量控制按钮
        const volumeButton = document.createElement('button');
        volumeButton.className = 'volume-button';
        volumeButton.innerHTML = '<i class="fas fa-volume-up"></i>';
        volumeButton.title = '调节音量';

        // 添加音量控制面板（默认隐藏）
        const volumePanel = document.createElement('div');
        volumePanel.className = 'volume-panel hidden';
        volumePanel.innerHTML = `
            <div class="volume-slider-container">
                <i class="fas fa-volume-up volume-icon"></i>
                <input type="range" class="volume-slider" min="0" max="100" value="100">
                <span class="volume-value">100%</span>
            </div>
        `;

        // 音量按钮点击事件
        volumeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            volumePanel.classList.toggle('hidden');
        });

        // 点击其他地方关闭音量面板
        document.addEventListener('click', (e) => {
            if (!volumePanel.contains(e.target) && !volumeButton.contains(e.target)) {
                volumePanel.classList.add('hidden');
            }
        });

        // 音量控制事件
        const volumeSlider = volumePanel.querySelector('.volume-slider');
        const volumeValue = volumePanel.querySelector('.volume-value');
        const volumeIcon = volumePanel.querySelector('.volume-icon');
        const buttonIcon = volumeButton.querySelector('i');

        volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            audio.volume = volume;
            volumeValue.textContent = `${e.target.value}%`;

            // 更新图标
            let iconClass;
            if (volume === 0) {
                iconClass = 'fas fa-volume-mute';
            } else if (volume < 0.5) {
                iconClass = 'fas fa-volume-down';
            } else {
                iconClass = 'fas fa-volume-up';
            }
            volumeIcon.className = iconClass;
            buttonIcon.className = iconClass;
        });

        // 创建用户信息容器
        const userInfoContainer = document.createElement('div');
        userInfoContainer.className = 'user-info-container';
        userInfoContainer.appendChild(peerInfo);
        userInfoContainer.appendChild(volumeButton);

        card.appendChild(avatar);
        card.appendChild(userInfoContainer);
        card.appendChild(volumePanel);
        card.appendChild(audio);
        remoteAudioContainer.appendChild(card);

        // 为远程音频设置可视化
        const visualizer = createVisualizer(stream, null, (volume) => {
            if (volume > 5) {
                avatar.classList.add('speaking');
                // 同步侧边栏头像
                document.querySelector(`#sidebar-user-${peerId} .avatar`)?.classList.add('speaking');
            } else {
                avatar.classList.remove('speaking');
                document.querySelector(`#sidebar-user-${peerId} .avatar`)?.classList.remove('speaking');
            }
        });
        visualizers.set(peerId, visualizer);
    }
    // 侧边栏用户列表项的添加现在由 `addSidebarUser` 函数处理
}

// 更新用户连接状态显示
function updatePeerConnectionStatus(peerId, connectionState) {
    console.log(`🔄 更新 ${peerId} 的连接状态: ${connectionState}`);
    peerConnectionStates.set(peerId, connectionState);
    const userElement = document.getElementById(`sidebar-user-${peerId}`);
    if (!userElement) {
        console.warn(`未找到用户元素: sidebar-user-${peerId}`);
        return;
    }

    const statusIndicator = userElement.querySelector('.status-indicator');
    const connectionStatus = userElement.querySelector('.connection-status');

    if (statusIndicator && connectionStatus) {
        // 清除所有状态类
        statusIndicator.className = 'status-indicator';
        connectionStatus.className = 'connection-status';

        // 根据连接状态设置样式和文本
        switch (connectionState) {
            case 'connected':
                statusIndicator.classList.add('connected');
                connectionStatus.classList.add('connected');
                connectionStatus.textContent = '已连接';
                console.log(`✅ UI已更新: ${peerId} 显示为已连接`);
                break;
            case 'connecting':
            case 'new':
            case 'checking':
                statusIndicator.classList.add('connecting');
                connectionStatus.classList.add('connecting');
                connectionStatus.textContent = '连接中';
                break;
            case 'disconnected':
                statusIndicator.classList.add('disconnected');
                connectionStatus.classList.add('disconnected');
                connectionStatus.textContent = '已断开';
                break;
            case 'failed':
                statusIndicator.classList.add('failed');
                connectionStatus.classList.add('failed');
                connectionStatus.textContent = '连接失败';
                break;
            default:
                statusIndicator.classList.add('connecting');
                connectionStatus.classList.add('connecting');
                connectionStatus.textContent = '连接中';
        }
    } else {
        console.warn(`未找到状态指示器元素: ${peerId}`);
    }
}

// 新增函数：在侧边栏添加用户
function addSidebarUser(peerId, username) {
    if (!document.getElementById(`sidebar-user-${peerId}`)) {
        const userElement = document.createElement('div');
        userElement.id = `sidebar-user-${peerId}`;
        userElement.className = 'sidebar-user';

        if (peerId === myPeerId) {
            userElement.classList.add('me');
        }

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.setAttribute('data-initial', username.charAt(0).toUpperCase());

        // 添加状态指示器
        const statusIndicator = document.createElement('div');
        statusIndicator.className = 'status-indicator connecting';
        avatar.appendChild(statusIndicator);

        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';

        const usernameSpan = document.createElement('span');
        usernameSpan.className = 'username';
        usernameSpan.textContent = username;

        const connectionStatus = document.createElement('div');
        connectionStatus.className = 'connection-status connecting';
        connectionStatus.textContent = peerId === myPeerId ? '本地用户' : '连接中';

        userInfo.appendChild(usernameSpan);
        userInfo.appendChild(connectionStatus);

        userElement.appendChild(avatar);
        userElement.appendChild(userInfo);
        userListSidebar.appendChild(userElement);

        // 如果不是自己，初始化连接状态
        if (peerId !== myPeerId) {
            peerConnectionStates.set(peerId, 'connecting');
        } else {
            // 自己的状态设为已连接
            updatePeerConnectionStatus(peerId, 'connected');
        }
    }
}

function cleanup() {
    console.log('清理所有连接和资源');

    // 停止所有可视化
    visualizers.forEach(v => v.stop());
    visualizers.clear();

    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();

    // 清理所有相关状态
    pendingIceCandidates.clear();
    makingOffer.clear();
    ignoreOffer.clear();

    remoteAudioContainer.innerHTML = '';
    if(userListSidebar) userListSidebar.innerHTML = '';

    // 清理自己的音频卡片
    const myCard = document.getElementById('audio-card-my');
    if (myCard) {
        myCard.remove();
    }

    localStream?.getTracks().forEach(track => track.stop());
    localAudio.srcObject = null;

    appContainer.classList.add('hidden');
    loginModal.classList.remove('hidden');

    joinButton.disabled = false;
    roomNameInput.disabled = false;
    usernameInput.disabled = false; // 重新启用用户名输入框
    roomNameInput.value = '';
    usernameInput.value = ''; // 清空用户名输入框
    statusText.textContent = '';
    statusText.classList.add('hidden');

    myPeerIdDisplay.textContent = '未连接';
    chatMessages.innerHTML = '';
    chatInput.value = '';
    chatInput.disabled = true;
    sendButton.disabled = true;
    micToggleButton.classList.add('muted');
    // 重置麦克风图标
    const micIcon = micToggleButton.querySelector('i');
    if (micIcon) {
        micIcon.className = 'fas fa-microphone-slash';
    }
    peerIdToUsernameMap.clear(); // 清除映射
    peerConnectionStates.clear(); // 清除连接状态映射
    connectionLatencyDisplay.textContent = 'Ping: --ms';
    connectionQualityDisplay.textContent = 'Quality: --';
    connectionStateDisplay.textContent = 'Connecting';
    connectionStateDisplay.classList.remove('connected');
    chatArea.classList.remove('hidden'); // 确保聊天区域在清理后可见
}

// 检查所有连接状态并更新UI
function checkAllConnectionStates() {
    peerConnections.forEach((pc, peerId) => {
        const currentState = peerConnectionStates.get(peerId);
        const actualState = pc.connectionState;
        const iceState = pc.iceConnectionState;
        const signalingState = pc.signalingState;

        console.log(`📊 状态检查 ${peerId}: connection=${actualState}, ice=${iceState}, signaling=${signalingState}, UI=${currentState}`);

        // 如果信令已稳定且有音频流，但ICE状态还是new，可能需要强制更新
        if (signalingState === 'stable' && iceState === 'new' && currentState === 'connecting') {
            // 检查是否有音频流
            const audioCard = document.getElementById(`audio-card-${peerId}`);
            if (audioCard) {
                console.log(`🎵 检测到音频流但ICE状态为new，强制设为已连接: ${peerId}`);
                updatePeerConnectionStatus(peerId, 'connected');
                return;
            }
        }

        // 特殊处理：如果音频流已建立，不要重置状态
        if (pc._audioStreamEstablished && currentState === 'connected') {
            // 音频流已建立且UI显示已连接，保持状态不变
            return;
        }

        // 特殊处理：如果已经有音频流且信令稳定，认为连接成功
        const audioCard = document.getElementById(`audio-card-${peerId}`);
        const hasAudioStream = audioCard !== null;

        if (hasAudioStream && signalingState === 'stable' && currentState !== 'connected') {
            console.log(`🎵 检测到音频流且信令稳定，强制设为已连接: ${peerId}`);
            updatePeerConnectionStatus(peerId, 'connected');
            pc._audioStreamEstablished = true;
            return;
        }

        // 如果实际状态与记录状态不同，或者ICE状态表明连接成功但UI未更新
        // 但要避免在有音频流时重置状态
        if (!pc._audioStreamEstablished && (actualState !== currentState ||
            (iceState === 'connected' || iceState === 'completed') && currentState !== 'connected')) {
            console.log(`🔄 状态不同步，更新 ${peerId}: 实际=${actualState}, ICE=${iceState}, 记录=${currentState}`);

            // 优先使用ICE状态判断连接是否成功
            if (iceState === 'connected' || iceState === 'completed') {
                updatePeerConnectionStatus(peerId, 'connected');
            } else if (iceState === 'failed') {
                updatePeerConnectionStatus(peerId, 'failed');
            } else {
                updatePeerConnectionStatus(peerId, actualState);
            }
        }
    });
}

async function updateConnectionStats() {
    if (peerConnections.size === 0) {
        connectionLatencyDisplay.textContent = `Ping: --ms`;
        connectionQualityDisplay.textContent = `Quality: --`;
        return;
    }

    let totalRoundTripTime = 0;
    let connectedPeers = 0;

    for (const pc of peerConnections.values()) {
        // 检查ICE连接状态和连接状态
        const isConnected = pc.connectionState === 'connected' ||
                           pc.iceConnectionState === 'connected' ||
                           pc.iceConnectionState === 'completed';

        if (!isConnected) continue;

        try {
            const stats = await pc.getStats();
            stats.forEach(report => {
                // 寻找已成功的 ICE candidate pair
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    // currentRoundTripTime 是秒，需要乘以 1000 得到毫秒
                    if (report.currentRoundTripTime) {
                        totalRoundTripTime += report.currentRoundTripTime * 1000;
                        connectedPeers++;
                    }
                }
            });
        } catch (error) {
            console.error("获取 WebRTC 统计信息失败:", error);
        }
    }

    if (connectedPeers > 0) {
        const averageLatency = Math.round(totalRoundTripTime / connectedPeers);
        let quality = '良好';
        if (averageLatency > 150) {
            quality = '一般';
        }
        if (averageLatency > 250) {
            quality = '差';
        }
        connectionLatencyDisplay.textContent = `Ping: ${averageLatency}ms`;
        connectionQualityDisplay.textContent = `Quality: ${quality}`;
    } else {
        connectionLatencyDisplay.textContent = `Ping: --ms`;
        connectionQualityDisplay.textContent = `Quality: --`;
    }
}

// 网络诊断功能
async function diagnoseNetworkConnectivity() {
    console.log('🔍 开始网络连接诊断...');

    try {
        // 测试当前配置的服务器
        console.log(`🧪 测试当前配置: ${currentServerConfig.name}`);
        const testPC = new RTCPeerConnection(currentServerConfig);

        const candidates = [];

        testPC.onicecandidate = (event) => {
            if (event.candidate) {
                candidates.push({
                    type: event.candidate.type,
                    protocol: event.candidate.protocol,
                    address: event.candidate.address,
                    port: event.candidate.port
                });
                console.log('🧊 诊断ICE候选:', event.candidate.type, event.candidate.address);
            } else {
                console.log('📊 网络诊断结果:', {
                    config: currentServerConfig.name,
                    totalCandidates: candidates.length,
                    hostCandidates: candidates.filter(c => c.type === 'host').length,
                    srflxCandidates: candidates.filter(c => c.type === 'srflx').length,
                    relayCandidates: candidates.filter(c => c.type === 'relay').length
                });

                if (candidates.filter(c => c.type === 'srflx').length === 0) {
                    console.warn('⚠️ 警告：未获取到srflx候选，可能存在NAT穿透问题');
                    console.log('💡 建议：尝试使用TURN增强节点');
                }

                if (currentServerConfig.iceTransportPolicy === 'relay' && candidates.filter(c => c.type === 'relay').length === 0) {
                    console.error('❌ 错误：TURN专用模式但未获取到relay候选，请检查TURN服务器配置');
                }

                testPC.close();
            }
        };

        // 创建数据通道触发ICE收集
        testPC.createDataChannel('test');
        const offer = await testPC.createOffer();
        await testPC.setLocalDescription(offer);

    } catch (error) {
        console.error('❌ 网络诊断失败:', error);
        if (error.message.includes('username') && error.message.includes('credential')) {
            console.error('🔑 TURN服务器认证错误，请检查username和credential配置');
        }
    }
}

// 显示服务器信息
function showServerInfo() {
    const serverInfoHTML = `
        <div class="server-group">
            <h4><i class="fas fa-globe-asia"></i> 中国优化节点</h4>
            <p>针对中国大陆网络环境优化，使用国内可访问的STUN服务器</p>
            <ul class="server-list">
                <li><span class="server-name">stun.voipbuster.com</span><span class="server-location">欧洲</span></li>
                <li><span class="server-name">stun.miwifi.com</span><span class="server-location">中国</span></li>
                <li><span class="server-name">stun.cloudflare.com</span><span class="server-location">全球</span></li>
            </ul>
        </div>

        <div class="server-group">
            <h4><i class="fas fa-globe"></i> 全球标准节点</h4>
            <p>使用Google等全球标准STUN服务器，适合海外用户</p>
            <ul class="server-list">
                <li><span class="server-name">stun.l.google.com</span><span class="server-location">全球</span></li>
                <li><span class="server-name">stun1.l.google.com</span><span class="server-location">全球</span></li>
                <li><span class="server-name">stun2.l.google.com</span><span class="server-location">全球</span></li>
            </ul>
        </div>

        <div class="server-group">
            <h4><i class="fas fa-shield-alt"></i> TURN增强节点</h4>
            <p>包含TURN服务器，适用于严格NAT环境和企业网络</p>
            <ul class="server-list">
                <li><span class="server-name">relay1.expressturn.com</span><span class="server-location">TURN服务</span></li>
                <li><span class="server-name">stun.voipbuster.com</span><span class="server-location">STUN备用</span></li>
            </ul>
            <p style="margin-top: 12px; font-size: 13px; color: var(--text-muted);">
                <i class="fas fa-info-circle"></i>
                TURN服务器可以在STUN无法穿透NAT时提供中继服务，确保连接成功率
            </p>
        </div>

        <div class="server-group">
            <h4><i class="fas fa-rocket"></i> TURN专用节点</h4>
            <p>强制使用TURN中继，确保在任何网络环境下都能连接</p>
            <ul class="server-list">
                <li><span class="server-name">relay1.expressturn.com</span><span class="server-location">专用中继</span></li>
            </ul>
            <p style="margin-top: 12px; font-size: 13px; color: var(--text-muted);">
                <i class="fas fa-exclamation-triangle"></i>
                此模式会消耗更多带宽，但保证连接成功率
            </p>
        </div>

        <div class="server-group">
            <h4><i class="fas fa-cog"></i> 连接建议</h4>
            <ul style="list-style: disc; padding-left: 20px; margin: 8px 0;">
                <li><strong>中国大陆用户</strong>：推荐使用"中国优化"节点</li>
                <li><strong>海外用户</strong>：推荐使用"全球标准"节点</li>
                <li><strong>企业网络</strong>：如果连接失败，尝试"TURN增强"节点</li>
                <li><strong>严格NAT环境</strong>：使用"TURN专用"强制中继连接</li>
                <li><strong>云端部署问题</strong>：不同客户端无法连接时，尝试TURN节点</li>
            </ul>
        </div>

        <div class="server-group">
            <h4><i class="fas fa-bug"></i> 故障排除</h4>
            <ul style="list-style: disc; padding-left: 20px; margin: 8px 0;">
                <li><strong>本地测试正常，云端无法连接</strong>：NAT穿透问题，使用TURN节点</li>
                <li><strong>企业网络连接失败</strong>：防火墙阻止UDP，尝试TURN专用</li>
                <li><strong>移动网络问题</strong>：运营商NAT限制，使用TURN增强</li>
                <li><strong>检查控制台日志</strong>：查看ICE候选类型和连接状态</li>
            </ul>
        </div>
    `;

    serverInfoContent.innerHTML = serverInfoHTML;
    serverInfoModal.classList.remove('hidden');
}
