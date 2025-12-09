import os from 'os';

/**
 * Get local IP address (first non-loopback IPv4 address)
 * @returns {string} Local IP address
 */
export function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Get network subnet from IP address
 * @param {string} ip - IP address (e.g., "192.168.1.100")
 * @returns {string} Network subnet (e.g., "192.168.1.0")
 */
export function getNetworkSubnet(ip) {
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

/**
 * Get hostname
 * @returns {string} System hostname
 */
export function getHostname() {
  return os.hostname();
}

/**
 * Generate IP range for network scanning
 * @param {string} baseIP - Base IP (e.g., "192.168.1")
 * @param {string} excludeIP - IP to exclude from range
 * @returns {string[]} Array of IP addresses to scan
 */
export function generateIPRange(baseIP, excludeIP) {
  const ipRange = [];
  for (let i = 1; i <= 254; i++) {
    const targetIP = `${baseIP}.${i}`;
    if (targetIP !== excludeIP) {
      ipRange.push(targetIP);
    }
  }
  return ipRange;
}

