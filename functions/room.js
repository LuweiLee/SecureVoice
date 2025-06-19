// functions/room.js

export class VoiceRoom {
  constructor(state, env) {
    this.state = state;
    // this.sessions 用来存储当前房间内所有活跃的 WebSocket 连接和用户信息
    this.sessions = new Map(); 
  }

  // Durable Object 的入口，处理所有发往这个对象的请求
  async fetch(request) {
    // 我们只处理 WebSocket 升级请求
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }

    const peerId = crypto.randomUUID();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // 调用 handleSession 来处理这个新的 WebSocket 连接
    this.handleSession(server, peerId);

    // 返回一个带有 WebSocket 的响应，完成升级
    return new Response(null, { status: 101, webSocket: client });
  }

  // 处理单个 WebSocket 会话的生命周期
  handleSession(socket, peerId) {
    socket.accept();
    console.log(`[+] Peer connected: ${peerId}`);

    socket.addEventListener("message", async (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, data } = message;

        switch (type) {
          case 'join-room': {
            const { username } = data;
            // 检查用户名是否重复
            if ([...this.sessions.values()].some(s => s.username === username)) {
              console.log(`Username ${username} is taken. Rejecting peer ${peerId}.`);
              socket.send(JSON.stringify({ type: 'username-taken', data: { username } }));
              socket.close(1008, 'Username taken');
              return;
            }

            // 告知新用户已存在的成员
            const existingPeers = [...this.sessions.values()].map(s => ({ peerId: s.peerId, username: s.username }));
            socket.send(JSON.stringify({ type: 'your-id', data: { peerId, peers: existingPeers } }));
            
            // 存储新用户信息
            this.sessions.set(socket, { peerId, username });

            // 告知其他人有新人加入
            this.broadcast({ type: 'new-peer', data: { peerId, username } }, socket);
            console.log(`Peer ${username} (${peerId}) joined. Total: ${this.sessions.size}`);
            break;
          }
          
          // 转发 WebRTC 信令
          case 'offer':
          case 'answer':
          case 'ice-candidate': {
            const senderInfo = this.sessions.get(socket);
            if (!senderInfo) return;

            this.broadcastTo(data.target, {
              type,
              data: { ...data, senderId: peerId, senderUsername: senderInfo.username }
            });
            break;
          }

          // 广播聊天消息
          case 'chat-message': {
            const senderInfo = this.sessions.get(socket);
            if (!senderInfo) return;
            
            this.broadcast({
              type: 'chat-message',
              data: { senderId: peerId, senderUsername: senderInfo.username, message: data.message }
            }, socket);
            break;
          }
        }
      } catch (err) {
        console.error("Failed to process message:", event.data, err);
      }
    });

    socket.addEventListener("close", () => {
      const session = this.sessions.get(socket);
      if (session) {
        this.sessions.delete(socket);
        this.broadcast({ type: 'peer-disconnected', data: { peerId: session.peerId, username: session.username } });
        console.log(`[-] Peer disconnected: ${session.username} (${session.peerId}). Total: ${this.sessions.size}`);
      }
    });
  }

  // 广播给除发送者外的所有人
  broadcast(message, senderSocket = null) {
    const serializedMessage = JSON.stringify(message);
    this.sessions.forEach((session, socket) => {
      if (socket !== senderSocket) {
        try {
          socket.send(serializedMessage);
        } catch (err) {
          console.error(`Failed to send to peer ${session.peerId}`, err);
          this.sessions.delete(socket);
        }
      }
    });
  }
  
  // 发送给指定目标
  broadcastTo(targetPeerId, message) {
     const serializedMessage = JSON.stringify(message);
     for (const [socket, session] of this.sessions.entries()) {
        if (session.peerId === targetPeerId) {
            try {
                socket.send(serializedMessage);
                return; // 找到后即可退出
            } catch (err) {
                console.error(`Failed to send to target peer ${targetPeerId}`, err);
                this.sessions.delete(socket);
            }
        }
     }
  }
}
