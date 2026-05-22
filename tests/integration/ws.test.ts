import { WebSocket } from 'ws'
import type { AddressInfo } from 'net'
import { vi } from 'vitest'
import { setup, teardown, reset } from '../helpers/db'
import { app, SESSION_SECRET } from '../../server/app'
import { setupWS } from '../../server/ws'

let port: number

// --- helpers ---

function connect(): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}`)
}

function recv(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    ws.once('message', (d) => resolve(JSON.parse(d.toString())))
    ws.once('error', reject)
  })
}

function opened(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve()
  return new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
}

function closeWait(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return Promise.resolve()
  return new Promise((resolve) => ws.once('close', resolve))
}

// --- setup ---

beforeAll(async () => {
  await setup()
  setupWS(app, SESSION_SECRET)
  await new Promise<void>((resolve) => app.listen(0, resolve))
  port = (app.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise<void>((resolve) => app.close(() => resolve()))
  await teardown()
})

beforeEach(reset)

// --- tests ---

describe('join', () => {
  it('receiverは認証なしで参加できる', async () => {
    const ws = connect()
    await opened(ws)
    ws.send(JSON.stringify({ type: 'join', room: 'ROOM01', role: 'receiver' }))
    const msg = await recv(ws)
    expect(msg).toMatchObject({ type: 'joined', room: 'ROOM01', role: 'receiver', peers: 1 })
    ws.close()
    await closeWait(ws)
  })

  it('未認証のsenderはauth_requiredエラーを受け取る', async () => {
    const ws = connect()
    await opened(ws)
    ws.send(JSON.stringify({ type: 'join', room: 'ROOM02', role: 'sender' }))
    const msg = await recv(ws)
    expect(msg).toMatchObject({ type: 'error', code: 'auth_required' })
    ws.close()
    await closeWait(ws)
  })

  it('2人目の参加で先に参加したピアにpeer_joinedが通知される', async () => {
    const ws1 = connect()
    const ws2 = connect()
    await Promise.all([opened(ws1), opened(ws2)])

    ws1.send(JSON.stringify({ type: 'join', room: 'ROOM03', role: 'receiver' }))
    await recv(ws1) // joined

    const peerJoinedPromise = recv(ws1)
    ws2.send(JSON.stringify({ type: 'join', room: 'ROOM03', role: 'receiver' }))
    const [joined, peerJoined] = await Promise.all([recv(ws2), peerJoinedPromise])

    expect(joined).toMatchObject({ type: 'joined', peers: 2 })
    expect(peerJoined).toMatchObject({ type: 'peer_joined' })

    ws1.close(); ws2.close()
    await Promise.all([closeWait(ws1), closeWait(ws2)])
  })

  it('3人目の参加でroom_fullエラーを受け取る', async () => {
    const ws1 = connect()
    const ws2 = connect()
    await Promise.all([opened(ws1), opened(ws2)])

    ws1.send(JSON.stringify({ type: 'join', room: 'ROOM04', role: 'receiver' }))
    await recv(ws1) // joined

    const peerJoinedPromise = recv(ws1)
    ws2.send(JSON.stringify({ type: 'join', room: 'ROOM04', role: 'receiver' }))
    await Promise.all([recv(ws2), peerJoinedPromise]) // joined + peer_joined

    const ws3 = connect()
    await opened(ws3)
    ws3.send(JSON.stringify({ type: 'join', room: 'ROOM04', role: 'receiver' }))
    const msg = await recv(ws3)
    expect(msg).toMatchObject({ type: 'error', code: 'room_full' })

    ws1.close(); ws2.close(); ws3.close()
    await Promise.all([closeWait(ws1), closeWait(ws2), closeWait(ws3)])
  })
})

describe('シグナリング', () => {
  async function setupRoom(room: string): Promise<[WebSocket, WebSocket]> {
    const ws1 = connect()
    const ws2 = connect()
    await Promise.all([opened(ws1), opened(ws2)])

    ws1.send(JSON.stringify({ type: 'join', room, role: 'receiver' }))
    await recv(ws1)

    const peerJoinedPromise = recv(ws1)
    ws2.send(JSON.stringify({ type: 'join', room, role: 'receiver' }))
    await Promise.all([recv(ws2), peerJoinedPromise])

    return [ws1, ws2]
  }

  it('offerメッセージが相手ピアに転送される', async () => {
    const [ws1, ws2] = await setupRoom('ROOM05')

    const relayPromise = recv(ws1)
    ws2.send(JSON.stringify({ type: 'offer', sdp: { type: 'offer', sdp: 'v=0\r\n' } }))
    const relayed = await relayPromise

    expect(relayed).toMatchObject({ type: 'offer', sdp: { type: 'offer' } })

    ws1.close(); ws2.close()
    await Promise.all([closeWait(ws1), closeWait(ws2)])
  })

  it('answerメッセージが相手ピアに転送される', async () => {
    const [ws1, ws2] = await setupRoom('ROOM06')

    const relayPromise = recv(ws2)
    ws1.send(JSON.stringify({ type: 'answer', sdp: { type: 'answer', sdp: 'v=0\r\n' } }))
    const relayed = await relayPromise

    expect(relayed).toMatchObject({ type: 'answer', sdp: { type: 'answer' } })

    ws1.close(); ws2.close()
    await Promise.all([closeWait(ws1), closeWait(ws2)])
  })

  it('iceメッセージが相手ピアに転送される', async () => {
    const [ws1, ws2] = await setupRoom('ROOM07')

    const relayPromise = recv(ws1)
    ws2.send(JSON.stringify({ type: 'ice', candidate: { candidate: 'candidate:1 1 UDP 2122252543 192.168.1.1 54321 typ host' } }))
    const relayed = await relayPromise

    expect(relayed).toMatchObject({ type: 'ice', candidate: { candidate: expect.stringContaining('candidate:') } })

    ws1.close(); ws2.close()
    await Promise.all([closeWait(ws1), closeWait(ws2)])
  })
})

describe('切断', () => {
  it('一方が切断すると相手にpeer_leftが通知される', async () => {
    const ws1 = connect()
    const ws2 = connect()
    await Promise.all([opened(ws1), opened(ws2)])

    ws1.send(JSON.stringify({ type: 'join', room: 'ROOM08', role: 'receiver' }))
    await recv(ws1)

    const peerJoinedPromise = recv(ws1)
    ws2.send(JSON.stringify({ type: 'join', room: 'ROOM08', role: 'receiver' }))
    await Promise.all([recv(ws2), peerJoinedPromise])

    const peerLeftPromise = recv(ws1)
    ws2.close()
    const msg = await peerLeftPromise

    expect(msg).toMatchObject({ type: 'peer_left' })

    ws1.close()
    await Promise.all([closeWait(ws1), closeWait(ws2)])
  })
})

describe('heartbeat', () => {
  it('接続後30秒でpingフレームを送信する', async () => {
    vi.useFakeTimers()
    try {
      const ws = connect()
      await opened(ws)

      const pingPromise = new Promise<void>((resolve) => ws.once('ping', resolve))
      vi.advanceTimersByTime(30_000)
      vi.useRealTimers()
      await pingPromise

      ws.close()
      await closeWait(ws)
    } finally {
      vi.useRealTimers()
    }
  })
})
