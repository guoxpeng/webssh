// Single source of truth for the webssh version string.
//
// Both the Node MCP client (core/server/lib/mcp-client.mjs) and the Cloudflare
// Worker bundle (core/worker/index.mjs) import this, so a release bump touches
// exactly one file here — and scripts/check-version.mjs asserts this value
// matches package.json "version" (wired into `npm run lint` and CI).
export const WEBSSH_VERSION = '3.6.3';
