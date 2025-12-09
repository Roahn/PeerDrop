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
    console.log(`🔧 [WebRTC] Creating peer connection for ${peerIP}`);
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, // Google's public STUN server
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    console.log(`   ICE Servers:`, configuration.iceServers.map(s => s.urls).join(', '));
    const pc = new RTCPeerConnection(configuration);
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 [WebRTC] ICE candidate generated for ${peerIP}:`, {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid
        });
        this.emit('ice_candidate', {
          peerIP,
          candidate: event.candidate
        });
      } else {
        console.log(`✅ [WebRTC] All ICE candidates gathered for ${peerIP}`);
      }
    };

    // Handle ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 [WebRTC] ICE connection state for ${peerIP}:`, pc.iceConnectionState);
    };

    // Handle ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log(`🧊 [WebRTC] ICE gathering state for ${peerIP}:`, pc.iceGatheringState);
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`🔗 [WebRTC] Connection state for ${peerIP}:`, pc.connectionState);
      this.emit('connection_state_change', {
        peerIP,
        state: pc.connectionState
      });
    };

    // Handle signaling state changes
    pc.onsignalingstatechange = () => {
      console.log(`📡 [WebRTC] Signaling state for ${peerIP}:`, pc.signalingState);
    };

    // Handle data channel (when receiving from remote peer)
    pc.ondatachannel = (event) => {
      console.log(`📥 [WebRTC] Received data channel from ${peerIP}:`, event.channel.label);
      const channel = event.channel;
      this.setupDataChannel(peerIP, channel);
    };

    this.peerConnections.set(peerIP, pc);
    console.log(`✅ [WebRTC] Peer connection created for ${peerIP}`);
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
      console.error(`❌ [WebRTC] No peer connection for ${peerIP}`);
      return null;
    }

    console.log(`📤 [WebRTC] Creating data channel for ${peerIP}`);
    const channel = pc.createDataChannel('messages', {
      ordered: true
    });

    this.setupDataChannel(peerIP, channel);
    console.log(`✅ [WebRTC] Data channel created for ${peerIP}`);
    return channel;
  }

  /**
   * Setup data channel event handlers
   * @param {string} peerIP - IP address of the peer
   * @param {RTCDataChannel} channel - Data channel
   */
  setupDataChannel(peerIP, channel) {
    console.log(`🔧 [WebRTC] Setting up data channel for ${peerIP}`);
    
    channel.onopen = () => {
      console.log(`✅ [WebRTC] DataChannel opened for ${peerIP}`);
      console.log(`   Channel state: ${channel.readyState}`);
      console.log(`   Channel label: ${channel.label}`);
      this.dataChannels.set(peerIP, channel);
      this.emit('data_channel_open', { peerIP });
    };

    channel.onclose = () => {
      console.log(`❌ [WebRTC] DataChannel closed for ${peerIP}`);
      this.dataChannels.delete(peerIP);
      this.emit('data_channel_close', { peerIP });
    };

    channel.onerror = (error) => {
      console.error(`❌ [WebRTC] DataChannel error for ${peerIP}:`, error);
      this.emit('data_channel_error', { peerIP, error });
    };

    channel.onbufferedamountlow = () => {
      console.log(`📊 [WebRTC] DataChannel buffer low for ${peerIP}`);
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`📥 [WebRTC DataChannel] Received message from ${peerIP}:`, data);
        this.emit('message', {
          peerIP,
          ...data
        });
      } catch (error) {
        console.error(`❌ Error parsing DataChannel message from ${peerIP}:`, error);
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
    console.log(`🎯 [WebRTC] Starting offer creation for ${peerIP}`);
    
    // Check if peer connection already exists and is in a valid state
    const existingPC = this.peerConnections.get(peerIP);
    if (existingPC) {
      const state = existingPC.connectionState;
      if (state === 'connected' || state === 'connecting') {
        console.log(`⚠️ [WebRTC] Peer connection already exists for ${peerIP} in state: ${state}, skipping duplicate offer`);
        return; // Don't create duplicate offer
      } else if (state === 'closed' || state === 'failed' || state === 'disconnected') {
        // Clean up old connection before creating new one
        console.log(`🧹 [WebRTC] Cleaning up old connection for ${peerIP} (state: ${state})`);
        this.disconnect(peerIP);
      }
    }
    
    const pc = this.createPeerConnection(peerIP);
    const channel = this.createDataChannel(peerIP);

    try {
      console.log(`📝 [WebRTC] Creating SDP offer for ${peerIP}...`);
      const offer = await pc.createOffer();
      console.log(`   Offer type: ${offer.type}`);
      console.log(`   Offer SDP length: ${offer.sdp?.length || 0} bytes`);
      
      console.log(`💾 [WebRTC] Setting local description (offer) for ${peerIP}...`);
      await pc.setLocalDescription(offer);
      console.log(`   Local description set. Signaling state: ${pc.signalingState}`);

      // Send offer via signaling
      console.log(`📤 [WebRTC] Sending offer to ${peerIP} via signaling...`);
      sendSignaling({
        type: 'webrtc_offer',
        targetIP: peerIP,
        offer: offer
      });

      console.log(`✅ [WebRTC] Offer created and sent for ${peerIP}`);
    } catch (error) {
      console.error(`❌ [WebRTC] Error creating offer for ${peerIP}:`, error);
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
    console.log(`📥 [WebRTC] Received offer from ${peerIP}`);
    console.log(`   Offer type: ${offer.type}`);
    console.log(`   Offer SDP length: ${offer.sdp?.length || 0} bytes`);
    
    // Check if peer connection already exists and is in a valid state
    const existingPC = this.peerConnections.get(peerIP);
    if (existingPC) {
      const state = existingPC.connectionState;
      const signalingState = existingPC.signalingState;
      if (state === 'connected' || state === 'connecting') {
        console.log(`⚠️ [WebRTC] Peer connection already exists for ${peerIP} in state: ${state}, ignoring duplicate offer`);
        return; // Don't handle duplicate offer
      } else if (signalingState === 'have-remote-offer' || signalingState === 'have-local-offer') {
        console.log(`⚠️ [WebRTC] Already processing offer/answer for ${peerIP} (signaling: ${signalingState}), ignoring duplicate offer`);
        return; // Don't handle duplicate offer
      } else if (state === 'closed' || state === 'failed' || state === 'disconnected') {
        // Clean up old connection before creating new one
        console.log(`🧹 [WebRTC] Cleaning up old connection for ${peerIP} (state: ${state})`);
        this.disconnect(peerIP);
      }
    }
    
    const pc = this.createPeerConnection(peerIP);

    try {
      console.log(`💾 [WebRTC] Setting remote description (offer) for ${peerIP}...`);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log(`   Remote description set. Signaling state: ${pc.signalingState}`);
      
      console.log(`📝 [WebRTC] Creating SDP answer for ${peerIP}...`);
      const answer = await pc.createAnswer();
      console.log(`   Answer type: ${answer.type}`);
      console.log(`   Answer SDP length: ${answer.sdp?.length || 0} bytes`);
      
      console.log(`💾 [WebRTC] Setting local description (answer) for ${peerIP}...`);
      await pc.setLocalDescription(answer);
      console.log(`   Local description set. Signaling state: ${pc.signalingState}`);

      // Send answer via signaling
      console.log(`📤 [WebRTC] Sending answer to ${peerIP} via signaling...`);
      sendSignaling({
        type: 'webrtc_answer',
        targetIP: peerIP,
        answer: answer
      });

      console.log(`✅ [WebRTC] Answer created and sent for ${peerIP}`);
    } catch (error) {
      console.error(`❌ [WebRTC] Error handling offer for ${peerIP}:`, error);
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
    console.log(`📥 [WebRTC] Received answer from ${peerIP}`);
    console.log(`   Answer type: ${answer.type}`);
    console.log(`   Answer SDP length: ${answer.sdp?.length || 0} bytes`);
    
    const pc = this.peerConnections.get(peerIP);
    if (!pc) {
      console.error(`❌ [WebRTC] No peer connection for ${peerIP}`);
      return;
    }

    try {
      console.log(`💾 [WebRTC] Setting remote description (answer) for ${peerIP}...`);
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`   Remote description set. Signaling state: ${pc.signalingState}`);
      console.log(`✅ [WebRTC] Answer processed for ${peerIP}`);
    } catch (error) {
      console.error(`❌ [WebRTC] Error handling answer for ${peerIP}:`, error);
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
    console.log(`🧊 [WebRTC] Received ICE candidate from ${peerIP}`);
    console.log(`   Candidate: ${candidate.candidate}`);
    console.log(`   SDP MLINE Index: ${candidate.sdpMLineIndex}`);
    console.log(`   SDP Mid: ${candidate.sdpMid}`);
    
    const pc = this.peerConnections.get(peerIP);
    if (!pc) {
      console.error(`❌ [WebRTC] No peer connection for ${peerIP}`);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`✅ [WebRTC] ICE candidate added for ${peerIP}`);
      console.log(`   ICE connection state: ${pc.iceConnectionState}`);
    } catch (error) {
      console.error(`❌ [WebRTC] Error adding ICE candidate for ${peerIP}:`, error);
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
      console.error(`❌ DataChannel not open for ${peerIP}`);
      return false;
    }

    try {
      console.log(`📤 [WebRTC DataChannel] Sending message to ${peerIP}:`, message.type || 'message');
      channel.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`❌ Error sending message to ${peerIP}:`, error);
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

