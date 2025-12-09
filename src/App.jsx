import { useState, useEffect } from 'react'
import { wsService } from './services/websocket'
import PeerCard from './components/PeerCard'

const SERVER_URL = 'http://localhost:3001'

function App() {
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveredPeers, setDiscoveredPeers] = useState([])
  const [serverConnected, setServerConnected] = useState(false)
  const [localIP, setLocalIP] = useState('')
  const [wsConnected, setWsConnected] = useState(false)
  const [connectionRequests, setConnectionRequests] = useState([]) // Array of pending connection requests

  useEffect(() => {
    // Check if server is running and get IP
    const checkServer = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/api/health`)
        if (response.ok) {
          const data = await response.json()
          setServerConnected(true)
          if (data.localIP) {
            setLocalIP(data.localIP)
          }
          
          // Connect WebSocket when server is ready
          if (!wsService.isConnected()) {
            wsService.setClientIP(data.localIP)
            wsService.connect()
          }
        } else {
          setServerConnected(false)
          setLocalIP('')
        }
      } catch (error) {
        setServerConnected(false)
        setLocalIP('')
      }
    }

    checkServer()
    
    // Setup WebSocket listeners
    wsService.on('connected', () => {
      setWsConnected(true)
    })

    wsService.on('disconnected', () => {
      setWsConnected(false)
    })

    // Listen for connection requests globally
    const connectionRequestHandler = (data) => {
      if (data.type === 'connection_request') {
        // Only show connection requests from other peers, not from ourselves
        if (data.fromIP && data.fromIP !== localIP) {
          // Add to connection requests if not already there
          setConnectionRequests(prev => {
            const exists = prev.find(req => req.fromIP === data.fromIP)
            if (!exists) {
              return [...prev, {
                fromIP: data.fromIP,
                fromName: data.fromName || `Peer ${data.fromIP}`,
                timestamp: data.timestamp
              }]
            }
            return prev
          })
        }
      }
    }

    // Listen for connection accept/reject to remove from notifications
    const connectionResponseHandler = (data) => {
      if (data.type === 'connection_accept' || data.type === 'connection_reject') {
        setConnectionRequests(prev => prev.filter(req => req.fromIP !== data.fromIP))
      }
    }

    wsService.on('connection_request', connectionRequestHandler)
    wsService.on('connection_accept', connectionResponseHandler)
    wsService.on('connection_reject', connectionResponseHandler)

    // Poll server connection status every 5 seconds
    const interval = setInterval(() => {
      if (!serverConnected) {
        checkServer()
      }
    }, 5000)

    return () => {
      clearInterval(interval)
      wsService.off('connected')
      wsService.off('disconnected')
      wsService.off('connection_request', connectionRequestHandler)
      wsService.off('connection_accept', connectionResponseHandler)
      wsService.off('connection_reject', connectionResponseHandler)
    }
  }, [serverConnected, discoveredPeers])

  const handleDiscover = async () => {
    if (!serverConnected) {
      alert('Please start the PeerDrop server first!')
      return
    }

    setIsDiscovering(true)
    try {
      const response = await fetch(`${SERVER_URL}/api/discover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setDiscoveredPeers(data.peers || [])
        }
      } else {
        throw new Error('Discovery failed')
      }
    } catch (error) {
      console.error('Error discovering peers:', error)
      alert('Failed to discover peers. Make sure the server is running.')
    } finally {
      setIsDiscovering(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-8">
      <h2 className="text-4xl font-bold text-gray-800 mb-4">PeerDrop</h2>
      
      {/* Server Connection Status */}
      {!serverConnected && (
        <div className="mb-8 px-4 py-2 bg-yellow-100 border border-yellow-400 rounded-lg shadow-sm">
          <p className="text-sm text-yellow-800">
            ⚠️ Server not connected. Please start the PeerDrop server.
          </p>
        </div>
      )}

      {/* Current IP Display */}
      {serverConnected && localIP && (
        <div className="mb-6 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full shadow-md">
          <div className="flex items-center gap-2">
            <svg 
              className="w-5 h-5 text-indigo-600" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
              />
            </svg>
            <span className="text-sm font-semibold text-gray-700">Your IP:</span>
            <span className="text-sm font-medium text-indigo-600">{localIP}</span>
          </div>
        </div>
      )}

      {/* Connection Request Notifications */}
      {connectionRequests.length > 0 && (
        <div className="mb-6 w-full max-w-2xl space-y-2">
          {connectionRequests.map((request, idx) => {
            const peer = discoveredPeers.find(p => p.ip === request.fromIP)
            return (
              <div 
                key={idx}
                className="px-6 py-4 bg-gradient-to-r from-yellow-50 to-yellow-100 border-2 border-yellow-400 rounded-lg shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center animate-bounce">
                      <span className="text-2xl">🔔</span>
                    </div>
                    <div>
                      <p className="font-bold text-yellow-900 text-lg">
                        New Connection Request!
                      </p>
                      <p className="text-sm text-yellow-800 font-medium">
                        {request.fromName} ({request.fromIP}) wants to connect with you
                      </p>
                      <p className="text-xs text-yellow-600 mt-1">
                        👇 Look for the peer card below with yellow border to accept or reject
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setConnectionRequests(prev => prev.filter(r => r.fromIP !== request.fromIP))
                    }}
                    className="text-yellow-600 hover:text-yellow-800 hover:bg-yellow-200 rounded-full p-1 transition-colors"
                    title="Dismiss notification"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      
      <div className="flex flex-col items-center gap-6">
        <button
          onClick={handleDiscover}
          disabled={isDiscovering}
          className={`
            w-24 h-24 rounded-full 
            bg-gradient-to-br from-blue-500 to-indigo-600 
            hover:from-blue-600 hover:to-indigo-700 
            active:scale-95
            transition-all duration-300
            shadow-lg hover:shadow-xl
            flex items-center justify-center
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isDiscovering ? 'animate-pulse' : ''}
          `}
          aria-label="Discover others on the same network"
        >
          {isDiscovering ? (
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <svg 
              className="w-10 h-10 text-white" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10V7M13 10h3M13 10v3" 
              />
            </svg>
          )}
        </button>
        
        <p className="text-gray-600 text-sm font-medium">
          {isDiscovering ? 'Discovering...' : 'Tap to discover others'}
        </p>

        {discoveredPeers.length > 0 && (
          <div className="mt-4 w-full max-w-4xl">
            <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
              Discovered Peers ({discoveredPeers.length})
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {discoveredPeers.map((peer) => (
                <PeerCard 
                  key={peer.id} 
                  peer={peer} 
                  localIP={localIP}
                  onConnectionRequest={(peer) => {
                    // This will be handled by the global notification
                    setConnectionRequests(prev => {
                      const exists = prev.find(req => req.fromIP === peer.ip)
                      if (!exists) {
                        return [...prev, {
                          fromIP: peer.ip,
                          fromName: peer.name || `Peer ${peer.ip}`,
                          timestamp: new Date().toISOString()
                        }]
                      }
                      return prev
                    })
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
