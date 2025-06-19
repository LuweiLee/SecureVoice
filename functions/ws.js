// functions/ws.js

export async function onRequest(context) {
  // 从 URL 中获取房间名, e.g., /ws/my-cool-room -> "my-cool-room"
  // 我们做一个简化，让所有人都先连接到一个 "lobby"，然后在 join-room 时再处理房间逻辑
  // 或者，更简单，我们让所有人都进入同一个 Durable Object，它内部再管理房间。
  // 为了最直接地映射 `main.ts` 的逻辑，我们就用一个固定的 Durable Object。
  const roomName = "default-secure-voice-room";

  // 从环境变量中获取 Durable Object 的命名空间
  const { env } = context;
  const id = env.VOICE_ROOM.idFromName(roomName);
  const room = env.VOICE_ROOM.get(id);

  // 将请求转发给获取到的 Durable Object 实例
  return room.fetch(context.request);
}
