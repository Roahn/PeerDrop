import os from 'os';

/**
 * Check if interface name indicates a virtual network adapter
 * @param {string} name - Interface name
 * @returns {boolean} True if virtual adapter
 */
function isVirtualAdapter(name) {
  const lowerName = name.toLowerCase();
  const virtualKeywords = [
    'virtualbox',
    'vmware',
    'vbox',
    'vmnet',
    'hyper-v',
    'docker',
    'wsl',
    'bluetooth',
    'loopback',
    'pseudo'
  ];
  return virtualKeywords.some(keyword => lowerName.includes(keyword));
}

/**
 * Get local IP address, prioritizing real network interfaces over virtual ones
 * @returns {string} Local IP address
 */
export function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  
  // First pass: collect all non-loopback IPv4 addresses
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const isVirtual = isVirtualAdapter(name);
        candidates.push({
          address: iface.address,
          name: name,
          isVirtual: isVirtual,
          priority: isVirtual ? 1 : 0 // Real interfaces have higher priority
        });
      }
    }
  }
  
  if (candidates.length === 0) {
    return '127.0.0.1';
  }
  
  // Sort: real interfaces first, then virtual
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Higher priority first
    }
    // If same priority, prefer common private network ranges (192.168.x.x, 10.x.x.x)
    const aIsPrivate = a.address.startsWith('192.168.') || a.address.startsWith('10.');
    const bIsPrivate = b.address.startsWith('192.168.') || b.address.startsWith('10.');
    if (aIsPrivate !== bIsPrivate) {
      return aIsPrivate ? -1 : 1; // Private IPs first
    }
    return 0;
  });
  
  const selected = candidates[0];
  console.log(`🌐 Selected network interface: ${selected.name} (${selected.address})`);
  if (candidates.length > 1) {
    console.log(`   Other interfaces found: ${candidates.slice(1).map(c => `${c.name} (${c.address})`).join(', ')}`);
  }
  
  return selected.address;
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

