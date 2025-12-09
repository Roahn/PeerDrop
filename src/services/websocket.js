/**
 * WebSocket service for peer-to-peer communication
 */

const WS_URL = 'ws://localhost:3001';

class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.clientIP = null;
  }

  /**
   * Set client IP for registration
   */
  setClientIP(ip) {
    this.clientIP = ip;
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;
        // Send our IP to the server for identification
        if (this.clientIP) {
          this.ws.send(JSON.stringify({
            type: 'register',
            clientIP: this.clientIP
          }));
        }
        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(data.type, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.emit('disconnected');
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
    }
  }

  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        this.connect();
      }, 2000 * this.reconnectAttempts);
    }
  }

  /**
   * Send message to peer
   */
  sendMessage(targetIP, message, fromName) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'message',
        targetIP,
        fromName,
        message
      }));
    } else {
      console.error('WebSocket not connected');
    }
  }

  /**
   * Send file offer to peer
   */
  sendFileOffer(targetIP, file, fromName) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.ws.send(JSON.stringify({
        type: 'file_offer',
        targetIP,
        fromName,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileId
      }));
      return fileId;
    } else {
      console.error('WebSocket not connected');
      return null;
    }
  }

  /**
   * Accept file offer
   */
  acceptFile(targetIP, fileId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'file_accept',
        targetIP,
        fileId
      }));
    }
  }

  /**
   * Reject file offer
   */
  rejectFile(targetIP, fileId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'file_reject',
        targetIP,
        fileId
      }));
    }
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
export const wsService = new WebSocketService();

