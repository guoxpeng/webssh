// Stub for ssh2/lib/agent.js — CF Workers don't support dynamic require('node:net')
const stub = {};
stub.AgentProtocol = function() {};
stub.BaseAgent = function() {};
stub.createAgent = function() {};
stub.CygwinAgent = function() {};
stub.OpenSSHAgent = function() {};
stub.PageantAgent = function() {};
module.exports = stub;
