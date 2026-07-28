// Stub for ssh2/lib/agent.js — CF Workers don't support dynamic require('node:net')
function isAgent() { return false; }
module.exports = {
  AgentProtocol: undefined,
  BaseAgent: undefined,
  createAgent: undefined,
  CygwinAgent: undefined,
  OpenSSHAgent: undefined,
  PageantAgent: undefined,
  isAgent,
};
