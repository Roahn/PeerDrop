import { useEffect, useState } from 'react'
import { wsService } from './services/websocket'
import PeerCard from './components/PeerCard'

const SERVER_URL = 'http://localhost:3001'

function App() {
  const [peers, setPeers] = useState([])
  const [serverConnected, setServerConnected] = useState(false)
  const [localIP, setLocalIP] = useState('')
  const [wsConnected, setWsConnected] = useState(false)
  const [newPeerIP, setNewPeerIP] = useState('')

  useEffect(() => {
    const checkServer = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/api/health`)
        if (response.ok) {
          const data = await response.json()
          setServerConnected(true)
          if (data.localIP) setLocalIP(data.localIP)
          if (!wsService.isConnected()) {
            wsService.setClientIP(data.localIP)
            wsService.connect()
          }
        } else {
          setServerConnected(false)
          setLocalIP('')
        }
      } catch {
        setServerConnected(false)
        setLocalIP('')
      }
    }

    checkServer()

    wsService.on('connected', () => setWsConnected(true))
    wsService.on('disconnected', () => setWsConnected(false))

    // If we get a connection request from a peer not in the list, add it so the card shows up
    const onRequest = (data) => {
      if (data.fromIP && data.fromIP !== localIP) {
        setPeers((prev) => {
          const exists = prev.find((p) => p.ip === data.fromIP)
          if (exists) return prev
          return [
            ...prev,
            {
              id: data.fromIP,
              name: data.fromName || `Peer ${data.fromIP}`,
              ip: data.fromIP
            }
          ]
        })
      }
    }

    wsService.on('connection_request', onRequest)

    return () => {
      wsService.off('connected')
      wsService.off('disconnected')
      wsService.off('connection_request', onRequest)
    }
  }, [localIP])

  const addPeerManually = () => {
    const ip = newPeerIP.trim()
    if (!ip) return
    setPeers((prev) => {
      const exists = prev.find((p) => p.ip === ip)
      if (exists) return prev
      return [...prev, { id: ip, name: `Peer ${ip}`, ip }]
    })
    setNewPeerIP('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center p-6">
      <h2 className="text-3xl font-bold text-gray-800 mb-4">PeerDrop (Manual)</h2>

      {!serverConnected && (
        <div className="mb-4 px-4 py-2 bg-yellow-100 border border-yellow-400 rounded-lg shadow-sm text-sm text-yellow-800">
          ⚠️ Server not connected. Start the PeerDrop server.
        </div>
      )}

      {serverConnected && localIP && (
        <div className="mb-4 px-4 py-2 bg-white rounded-full shadow-sm text-sm text-gray-700">
          Your IP: <span className="font-semibold text-indigo-600">{localIP}</span> · WS:{' '}
          <span className={wsConnected ? 'text-green-600' : 'text-red-600'}>
            {wsConnected ? 'connected' : 'disconnected'}
          </span>
        </div>
      )}

      <div className="w-full max-w-xl bg-white shadow-sm rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-700">Add peer by IP</div>
        <div className="flex gap-2">
          <input
            value={newPeerIP}
            onChange={(e) => setNewPeerIP(e.target.value)}
            placeholder="e.g. 192.168.0.107"
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button
            onClick={addPeerManually}
            className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Add
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Enter the peer's IP (port 3001). Then use Connect/Accept/Reject on the card.
        </p>
      </div>

      <div className="w-full max-w-4xl mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {peers.length === 0 ? (
          <div className="text-sm text-gray-600 col-span-2 text-center">No peers added yet.</div>
        ) : (
          peers.map((peer) => <PeerCard key={peer.id} peer={peer} localIP={localIP} />)
        )}
      </div>
    </div>
  )
}

export default App
