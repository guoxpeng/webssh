// Simple API token auth middleware
// Set AUTH_TOKEN env var to enable; if unset, all requests pass through
const AUTH_TOKEN = process.env.AUTH_TOKEN || null;

export function authMiddleware(req, res) {
  if (!AUTH_TOKEN) return true; // Auth disabled

  // Skip auth for static assets, health, and WebSocket upgrade
  if (req.method === 'GET' || req.url === '/health' || req.headers['upgrade']?.toLowerCase() === 'websocket') return true;

  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (token === AUTH_TOKEN) return true;

  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized. Set Authorization: Bearer <token>' }));
  return false;
}

// Security headers
export function setSecurityHeaders(res) {
  res.setHeader('Clear-Site-Data', '"cache"');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
