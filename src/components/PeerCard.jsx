import { useState } from 'react'
import { wsService } from '../services/websocket'

export default function PeerCard({ peer, localIP }) {
  const [showChat, setShowChat] = useState(false)
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [showFileDialog, setShowFileDialog] = useState(false)

  const handleConnect = () => {
    setShowChat(true)
    // Connect WebSocket if not already connected
    if (!wsService.isConnected()) {
      wsService.connect()
    }

    // Listen for messages from this peer
    const messageHandler = (data) => {
      if (data.fromIP === peer.ip) {
        setMessages(prev => [...prev, {
          from: data.fromName || peer.name,
          message: data.message,
          timestamp: data.timestamp,
          isOwn: false
        }])
      }
    }

    wsService.on('message', messageHandler)

    return () => {
      wsService.off('message', messageHandler)
    }
  }

  const handleSendMessage = () => {
    if (!messageInput.trim()) return

    wsService.sendMessage(peer.ip, messageInput, `Peer ${localIP}`)
    
    setMessages(prev => [...prev, {
      from: 'You',
      message: messageInput,
      timestamp: new Date().toISOString(),
      isOwn: true
    }])
    
    setMessageInput('')
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      wsService.sendFileOffer(peer.ip, file, `Peer ${localIP}`)
      setShowFileDialog(false)
    }
  }

  if (!showChat) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-md border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-800">{peer.name || `Peer ${peer.id}`}</h3>
            <p className="text-xs text-gray-500">{peer.ip}</p>
          </div>
          <button
            onClick={handleConnect}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
          >
            Connect
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-md border border-gray-200 w-full max-w-md">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-800">{peer.name || `Peer ${peer.id}`}</h3>
          <p className="text-xs text-gray-500">{peer.ip}</p>
        </div>
        <button
          onClick={() => setShowChat(false)}
          className="text-gray-500 hover:text-gray-700"
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

