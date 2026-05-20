import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage, Server } from 'http'
import { RequestHandler } from 'express'
import logger from './logger'

interface AppWebSocket extends WebSocket {
  user:   { sub: string; name: string } | null
  roomId: string | null
  role:   string | null
}

export function setupWS(server: Server, sessionParser: RequestHandler): void {
  const wss   = new WebSocketServer({ noServer: true })
  const rooms = new Map<string, Set<AppWebSocket>>()

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    sessionParser(req as Parameters<RequestHandler>[0], {} as Parameters<RequestHandler>[1], () => {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    })
  })

  wss.on('connection', (ws: AppWebSocket, req: IncomingMessage) => {
    const session = (req as unknown as { session?: { user?: AppWebSocket['user'] } }).session
    ws.user   = session?.user ?? null
    ws.roomId = null
    ws.role   = null

    ws.on('message', (raw) => {
      let msg: Record<string, string>
      try { msg = JSON.parse(raw.toString()) } catch { return }

      switch (msg['type']) {
        case 'join': {
          const { room, role } = msg
          if (!room || !role) return
          if (role === 'sender' && !ws.user) {
            logger.warn({ room, ip: (ws as unknown as { _socket?: { remoteAddress?: string } })._socket?.remoteAddress }, 'ws: auth required')
            return ws.send(JSON.stringify({ type: 'error', code: 'auth_required', message: '送信にはログインが必要です' }))
          }
          if (!rooms.has(room)) rooms.set(room, new Set())
          const roomSet = rooms.get(room)!
          if (roomSet.size >= 2) {
            logger.warn({ room }, 'ws: room full')
            return ws.send(JSON.stringify({ type: 'error', code: 'room_full', message: 'ルームが満員です' }))
          }
          roomSet.add(ws)
          ws.roomId = room
          ws.role   = role
          ws.send(JSON.stringify({ type: 'joined', room, peers: roomSet.size, role }))
          logger.info({ room, role, user: ws.user?.name ?? '(anonymous)' }, 'ws: joined')
          if (roomSet.size === 2) {
            broadcast(roomSet, ws, { type: 'peer_joined' })
            logger.info({ room }, 'ws: p2p ready')
          }
          break
        }
        case 'offer':
        case 'answer':
        case 'ice': {
          if (!ws.roomId) return
          const roomSet = rooms.get(ws.roomId)
          if (roomSet) broadcast(roomSet, ws, msg)
          break
        }
      }
    })

    ws.on('close', () => {
      if (!ws.roomId) return
      const roomSet = rooms.get(ws.roomId)
      if (roomSet) {
        roomSet.delete(ws)
        broadcast(roomSet, ws, { type: 'peer_left' })
        logger.info({ room: ws.roomId, user: ws.user?.name ?? '(anonymous)' }, 'ws: left')
        if (roomSet.size === 0) rooms.delete(ws.roomId!)
      }
    })
  })
}

function broadcast(roomSet: Set<AppWebSocket>, sender: AppWebSocket, msg: object): void {
  const data = JSON.stringify(msg)
  for (const peer of roomSet) {
    if (peer !== sender && peer.readyState === WebSocket.OPEN) peer.send(data)
  }
}
