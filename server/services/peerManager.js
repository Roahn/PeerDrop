/**
 * Peer Manager Service
 * Manages discovered peers and prevents duplicates
 */

const peerMap = new Map(); // Track peers by IP to avoid duplicates

/**
 * Add or update a peer
 * @param {Object} peer - Peer object with id, name, ip, port, lastSeen
 */
export function addPeer(peer) {
  const existingPeer = peerMap.get(peer.ip);
  if (!existingPeer || existingPeer.lastSeen < peer.lastSeen) {
    peerMap.set(peer.ip, peer);
  }
}

/**
 * Get all discovered peers
 * @returns {Array} Array of peer objects
 */
export function getPeers() {
  return Array.from(peerMap.values());
}

/**
 * Clear all discovered peers
 */
export function clearPeers() {
  peerMap.clear();
}

/**
 * Get peer count
 * @returns {number} Number of discovered peers
 */
export function getPeerCount() {
  return peerMap.size;
}

