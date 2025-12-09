import { useEffect, useState } from 'react'
import { wsService } from '../services/websocket'

// Simplified PeerCard:
// - Only connection request/accept/reject via WebSocket signaling
// - No WebRTC, no discovery, no polling
// - Shows ack/status on both sides

export default function PeerCard({ peer, localIP }) {
  const [status, setStatus] = useState('disconnected') // disconnected | pending | requested | connected
  const [ack, setAck] = useState('')

  useEffect(() => {
    const onRequest = (data) => {
      if (data.fromIP === peer.ip) {
        setStatus('requested')
        setAck(`Incoming request from ${data.fromIP}`)
      }
    }
    const onAccept = (data) => {
      if (data.fromIP === peer.ip) {
        setStatus('connected')
        setAck(`Accepted by ${data.fromIP}`)
      }
    }
    const onReject = (data) => {
      if (data.fromIP === peer.ip) {
        setStatus('disconnected')
        setAck(`Rejected by ${data.fromIP}`)
      }
    }

    wsService.on('connection_request', onRequest)
    wsService.on('connection_accept', onAccept)
    wsService.on('connection_reject', onReject)

    return () => {
      wsService.off('connection_request', onRequest)
      wsService.off('connection_accept', onAccept)
      wsService.off('connection_reject', onReject)
    }
  }, [peer.ip])

  const connect = () => {
    if (!wsService.isConnected()) wsService.connect()
    if (status === 'pending' || status === 'connected' || status === 'requested') return
    setStatus('pending')
    setAck(`Sent request to ${peer.ip}`)
    wsService.sendConnectionRequest(peer.ip, `Peer ${localIP}`)
  }

  const accept = () => {
    wsService.acceptConnection(peer.ip, `Peer ${localIP}`)
    setStatus('connected')
    setAck(`You accepted ${peer.ip}`)
  }

  const reject = () => {
    wsService.rejectConnection(peer.ip, `Peer ${localIP}`)
    setStatus('disconnected')
    setAck(`You rejected ${peer.ip}`)
  }

  return (
    <div className="p-4 rounded-lg border shadow-sm space-y-2" data-peer-ip={peer.ip}>
      <div className="flex justify-between items-center">
        <div>
          <div className="font-semibold">{peer.name || peer.ip}</div>
          <div className="text-xs text-gray-600">{peer.ip}</div>
          <div className="text-xs mt-1">
            Status:{' '}
            <span
              className={
                status === 'connected'
                  ? 'text-green-600 font-semibold'
                  : status === 'pending'
                  ? 'text-blue-600 font-semibold'
                  : status === 'requested'
                  ? 'text-yellow-600 font-semibold'
                  : 'text-gray-700'
              }
            >
              {status}
            </span>
          </div>
          {ack && <div className="text-xs text-gray-700 mt-1">Ack: {ack}</div>}
        </div>
        <div className="flex gap-2">
          {status === 'requested' ? (
            <>
              <button onClick={accept} className="px-3 py-1.5 bg-green-500 text-white rounded text-sm">
                Accept
              </button>
              <button onClick={reject} className="px-3 py-1.5 bg-red-500 text-white rounded text-sm">
                Reject
              </button>
            </>
          ) : status === 'disconnected' ? (
            <button onClick={connect} className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm">
              Connect
            </button>
          ) : status === 'pending' ? (
            <span className="text-sm text-blue-600 font-semibold">Pending…</span>
          ) : (
            <span className="text-sm text-green-600 font-semibold">Connected</span>
          )}
        </div>
      </div>
    </div>
  )
}

