/**
 * WebRTC service for direct peer-to-peer communication
 */

class WebRTCService {
  constructor() {
    this.peerConnections = new Map(); // Map of peerIP -> RTCPeerConnection
    this.dataChannels = new Map(); // Map of peerIP -> RTCDataChannel
    this.listeners = new Map(); // Event listeners
    this.localIP = null;
  }

  /**
   * Set local IP
   */
  setLocalIP(ip) {
    this.localIP = ip;
  }

  /**
   * Create RTCPeerConnection for a peer
   * @param {string} peerIP - IP address of the peer
   * @returns {RTCPeerConnection} Peer connection
   */
  createPeerConnection(peerIP) {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, // Google's public STUN server
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(configuration);
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit('ice_candidate', {
          peerIP,
          candidate: event.candidate
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`WebRTC connection state for ${peerIP}:`, pc.connectionState);
      this.emit('connection_state_change', {
        peerIP,
        state: pc.connectionState
      });
    };

    // Handle data channel (when receiving from remote peer)
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      this.setupDataChannel(peerIP, channel);
    };

    this.peerConnections.set(peerIP, pc);
    return pc;
  }

  /**
   * Create data channel for a peer
   * @param {string} peerIP - IP address of the peer
   * @returns {RTCDataChannel} Data channel
   */
  createDataChannel(peerIP) {
    const pc = this.peerConnections.get(peerIP);
    if (!pc) {
      console.error(`No peer connection for ${peerIP}`);
      return null;
    }

    const channel = pc.createDataChannel('messages', {
      ordered: true
    });

    this.setupDataChannel(peerIP, channel);
    return channel;
  }

  /**
   * Setup data channel event handlers
   * @param {string} peerIP - IP address of the peer
   * @param {RTCDataChannel} channel - Data channel
   */
  setupDataChannel(peerIP, channel) {
    channel.onopen = () => {
      console.log(`✅ DataChannel opened for ${peerIP}`);
      this.dataChannels.set(peerIP, channel);
      this.emit('data_channel_open', { peerIP });
    };

    channel.onclose = () => {
      console.log(`❌ DataChannel closed for ${peerIP}`);
      this.dataChannels.delete(peerIP);
      this.emit('data_channel_close', { peerIP });
    };

    channel.onerror = (error) => {
      console.error(`DataChannel error for ${peerIP}:`, error);
      this.emit('data_channel_error', { peerIP, error });
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('message', {
          peerIP,
          ...data
        });
      } catch (error) {
        console.error('Error parsing DataChannel message:', error);
      }
    };
  }

  /**
   * Create offer and send to peer via signaling
   * @param {string} peerIP - IP address of the peer
   * @param {Function} sendSignaling - Function to send signaling message
   * @returns {Promise<void>}
   */
  async createOffer(peerIP, sendSignaling) {
    const pc = this.createPeerConnection(peerIP);
    const channel = this.createDataChannel(peerIP);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer via signaling
      sendSignaling({
        type: 'webrtc_offer',
        targetIP: peerIP,
        offer: offer
      });

      console.log(`📤 Created WebRTC offer for ${peerIP}`);
    } catch (error) {
      console.error(`Error creating offer for ${peerIP}:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming offer and create answer
   * @param {string} peerIP - IP address of the peer
   * @param {RTCSessionDescriptionInit} offer - WebRTC offer
   * @param {Function} sendSignaling - Function to send signaling message
   * @returns {Promise<void>}
   */
  async handleOffer(peerIP, offer, sendSignaling) {
    const pc = this.createPeerConnection(peerIP);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer via signaling
      sendSignaling({
        type: 'webrtc_answer',
        targetIP: peerIP,
        answer: answer
      });

      console.log(`📤 Created WebRTC answer for ${peerIP}`);
    } catch (error) {
      console.error(`Error handling offer for ${peerIP}:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming answer
   * @param {string} peerIP - IP address of the peer
   * @param {RTCSessionDescriptionInit} answer - WebRTC answer
   * @returns {Promise<void>}
   */
  async handleAnswer(peerIP, answer) {
    const pc = this.peerConnections.get(peerIP);
    if (!pc) {
      console.error(`No peer connection for ${peerIP}`);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`✅ Set remote description (answer) for ${peerIP}`);
    } catch (error) {
      console.error(`Error handling answer for ${peerIP}:`, error);
      throw error;
    }
  }

  /**
   * Handle ICE candidate
   * @param {string} peerIP - IP address of the peer
   * @param {RTCIceCandidate} candidate - ICE candidate
   * @returns {Promise<void>}
   */
  async handleIceCandidate(peerIP, candidate) {
    const pc = this.peerConnections.get(peerIP);
    if (!pc) {
      console.error(`No peer connection for ${peerIP}`);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`✅ Added ICE candidate for ${peerIP}`);
    } catch (error) {
      console.error(`Error adding ICE candidate for ${peerIP}:`, error);
    }
  }

  /**
   * Send message via DataChannel
   * @param {string} peerIP - IP address of the peer
   * @param {Object} message - Message to send
   */
  sendMessage(peerIP, message) {
    const channel = this.dataChannels.get(peerIP);
    if (!channel || channel.readyState !== 'open') {
      console.error(`DataChannel not open for ${peerIP}`);
      return false;
    }

    try {
      channel.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Error sending message to ${peerIP}:`, error);
      return false;
    }
  }

  /**
   * Close connection to peer
   * @param {string} peerIP - IP address of the peer
   */
  closeConnection(peerIP) {
    const pc = this.peerConnections.get(peerIP);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerIP);
    }

    const channel = this.dataChannels.get(peerIP);
    if (channel) {
      channel.close();
      this.dataChannels.delete(peerIP);
    }
  }

  /**
   * Check if DataChannel is open for peer
   * @param {string} peerIP - IP address of the peer
   * @returns {boolean}
   */
  isConnected(peerIP) {
    const channel = this.dataChannels.get(peerIP);
    return channel && channel.readyState === 'open';
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
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
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }
}

// Export singleton instance
export const webrtcService = new WebRTCService();

