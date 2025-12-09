import { useState, useEffect } from 'react'
import { wsService } from '../services/websocket'
import { webrtcService } from '../services/webrtc'

export default function PeerCard({ peer, localIP, onConnectionRequest, onConnectionResolved }) {
  const [connectionStatus, setConnectionStatus] = useState('disconnected') // disconnected, pending, connected, requested
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [showFileDialog, setShowFileDialog] = useState(false)

  useEffect(() => {
    // Set local IP for WebRTC service
    if (localIP) {
      webrtcService.setLocalIP(localIP);
    }

    // Listen for connection requests from this peer (via signaling)
    const connectionRequestHandler = (data) => {
      if (data.fromIP === peer.ip) {
        setConnectionStatus('requested')
        if (onConnectionRequest) {
          onConnectionRequest(peer)
        }
      }
    }

    // Listen for connection responses (via signaling)
    const connectionResponseHandler = (data) => {
      if (data.fromIP === peer.ip) {
        if (data.type === 'connection_accept') {
          // Connection accepted, initiate WebRTC offer
          webrtcService.createOffer(peer.ip, (signalingMsg) => {
            wsService.sendSignaling(signalingMsg);
          }).catch(err => {
            console.error('Error creating WebRTC offer:', err);
            setConnectionStatus('disconnected');
          });
        } else if (data.type === 'connection_reject') {
          setConnectionStatus('disconnected')
          alert('Connection request was rejected')
        }
      }
    }

    // Listen for WebRTC signaling messages (from WebSocket)
    const offerHandler = async (data) => {
      if (data.fromIP === peer.ip && data.offer) {
        try {
          await webrtcService.handleOffer(peer.ip, data.offer, (signalingMsg) => {
            wsService.sendSignaling(signalingMsg);
          });
        } catch (err) {
          console.error('Error handling WebRTC offer:', err);
        }
      }
    }

    const answerHandler = async (data) => {
      if (data.fromIP === peer.ip && data.answer) {
        try {
          await webrtcService.handleAnswer(peer.ip, data.answer);
        } catch (err) {
          console.error('Error handling WebRTC answer:', err);
        }
      }
    }

    const iceCandidateSignalingHandler = async (data) => {
      if (data.fromIP === peer.ip && data.candidate) {
        try {
          await webrtcService.handleIceCandidate(peer.ip, data.candidate);
        } catch (err) {
          console.error('Error handling ICE candidate:', err);
        }
      }
    }

    // Listen for ICE candidates from WebRTC service (to send via signaling)
    const iceCandidateHandler = (data) => {
      if (data.peerIP === peer.ip && data.candidate) {
        wsService.sendSignaling({
          type: 'webrtc_ice_candidate',
          targetIP: peer.ip,
          candidate: data.candidate
        });
      }
    }

    // Listen for WebRTC connection state changes
    const connectionStateHandler = (data) => {
      if (data.peerIP === peer.ip) {
        if (data.state === 'connected') {
          setConnectionStatus('connected');
        } else if (data.state === 'disconnected' || data.state === 'failed') {
          setConnectionStatus('disconnected');
        }
      }
    }

    // Listen for messages via WebRTC DataChannel
    const webrtcMessageHandler = (data) => {
      if (data.peerIP === peer.ip && data.type === 'message') {
        setMessages(prev => [...prev, {
          from: data.fromName || peer.name,
          message: data.message,
          timestamp: data.timestamp || new Date().toISOString(),
          isOwn: false
        }])
      }
    }

    // Listen for WebRTC DataChannel open
    const dataChannelOpenHandler = (data) => {
      if (data.peerIP === peer.ip) {
        setConnectionStatus('connected');
      }
    }

    // Register WebSocket signaling listeners
    wsService.on('connection_request', connectionRequestHandler)
    wsService.on('connection_accept', connectionResponseHandler)
    wsService.on('connection_reject', connectionResponseHandler)
    wsService.on('webrtc_offer', offerHandler)
    wsService.on('webrtc_answer', answerHandler)
    wsService.on('webrtc_ice_candidate', iceCandidateSignalingHandler)

    // Register WebRTC listeners
    webrtcService.on('ice_candidate', iceCandidateHandler)
    webrtcService.on('connection_state_change', connectionStateHandler)
    webrtcService.on('message', webrtcMessageHandler)
    webrtcService.on('data_channel_open', dataChannelOpenHandler)

    return () => {
      wsService.off('connection_request', connectionRequestHandler)
      wsService.off('connection_accept', connectionResponseHandler)
      wsService.off('connection_reject', connectionResponseHandler)
      wsService.off('webrtc_offer', offerHandler)
      wsService.off('webrtc_answer', answerHandler)
      wsService.off('webrtc_ice_candidate', iceCandidateHandler)
      webrtcService.off('ice_candidate', iceCandidateHandler)
      webrtcService.off('connection_state_change', connectionStateHandler)
      webrtcService.off('message', webrtcMessageHandler)
      webrtcService.off('data_channel_open', dataChannelOpenHandler)
    }
  }, [peer.ip, peer.name, localIP])

  const handleConnect = () => {
    // Connect WebSocket if not already connected (for signaling)
    if (!wsService.isConnected()) {
      wsService.connect()
    }

    // Send connection request via signaling
    setConnectionStatus('pending')
    wsService.sendConnectionRequest(peer.ip, `Peer ${localIP}`)
  }

  const handleAcceptConnection = async () => {
    // Accept connection and create WebRTC answer
    wsService.acceptConnection(peer.ip, `Peer ${localIP}`)
    
    // Notify parent to remove from connection requests immediately
    if (onConnectionResolved) {
      onConnectionResolved(peer.ip)
    }
    
    // WebRTC connection will be established when offer is received
  }

  const handleRejectConnection = () => {
    wsService.rejectConnection(peer.ip, `Peer ${localIP}`)
    setConnectionStatus('disconnected')
    // Notify parent to remove from connection requests immediately
    if (onConnectionResolved) {
      onConnectionResolved(peer.ip)
    }
  }

  const handleSendMessage = () => {
    if (!messageInput.trim()) return

    // Send via WebRTC DataChannel
    const sent = webrtcService.sendMessage(peer.ip, {
      type: 'message',
      message: messageInput,
      fromName: `Peer ${localIP}`,
      timestamp: new Date().toISOString()
    })

    if (sent) {
      setMessages(prev => [...prev, {
        from: 'You',
        message: messageInput,
        timestamp: new Date().toISOString(),
        isOwn: true
      }])
      setMessageInput('')
    } else {
      alert('WebRTC connection not ready. Please wait for connection to establish.')
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      wsService.sendFileOffer(peer.ip, file, `Peer ${localIP}`)
      setShowFileDialog(false)
    }
  }

  // Show connection request notification
  if (connectionStatus === 'requested') {
    return (
      <div className="p-4 bg-white rounded-lg shadow-md border-2 border-yellow-400">
        <div className="mb-3">
          <h3 className="font-semibold text-gray-800">{peer.name || `Peer ${peer.id}`}</h3>
          <p className="text-xs text-gray-500">{peer.ip}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
          <p className="text-sm text-yellow-800 font-medium mb-2">
            🔔 Connection Request
          </p>
          <p className="text-xs text-yellow-700">
            {peer.name || `Peer ${peer.ip}`} wants to connect with you
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAcceptConnection}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
          >
            Accept
          </button>
          <button
            onClick={handleRejectConnection}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
          >
            Reject
          </button>
        </div>
      </div>
    )
  }

  // Show disconnected or pending state
  if (connectionStatus !== 'connected') {
    return (
      <div className="p-4 bg-white rounded-lg shadow-md border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-800">{peer.name || `Peer ${peer.id}`}</h3>
            <p className="text-xs text-gray-500">{peer.ip}</p>
          </div>
          {connectionStatus === 'pending' ? (
            <div className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-sm">
              Pending...
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
            >
              Connect
            </button>
          )}
        </div>
      </div>
    )
  }

  const handleDisconnect = () => {
    webrtcService.closeConnection(peer.ip)
    setConnectionStatus('disconnected')
    setMessages([])
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-md border-2 border-green-400 w-full max-w-md">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800">{peer.name || `Peer ${peer.id}`}</h3>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Connected</span>
          </div>
          <p className="text-xs text-gray-500">{peer.ip}</p>
        </div>
        <button
          onClick={handleDisconnect}
          className="text-gray-500 hover:text-gray-700"
          title="Disconnect"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="h-64 overflow-y-auto mb-3 border border-gray-200 rounded-lg p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500 text-center">No messages yet. Start chatting!</p>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-2 rounded-lg ${
                msg.isOwn
                  ? 'bg-indigo-100 ml-auto text-right'
                  : 'bg-gray-100'
              }`}
            >
              <p className="text-xs font-semibold text-gray-600">{msg.from}</p>
              <p className="text-sm text-gray-800">{msg.message}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Message Input */}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={handleSendMessage}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
        >
          Send
        </button>
      </div>

      {/* File Sharing */}
      <div className="flex gap-2">
        <input
          type="file"
          id={`file-${peer.id}`}
          onChange={handleFileSelect}
          className="hidden"
        />
        <label
          htmlFor={`file-${peer.id}`}
          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm text-center cursor-pointer"
        >
          📎 Send File
        </label>
      </div>
    </div>
  )
}

