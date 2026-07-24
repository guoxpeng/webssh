import { getApiBaseUrl } from '@/utils/constants';

export interface NodeConfig {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  auth_type?: 'password' | 'key';
  auth_value?: string;
  protocol?: string;
  id?: string;
  rememberForSession?: boolean;
  [key: string]: any;
}

export interface SshTestResponse {
  success: boolean;
  time_elapsed?: number;
  output?: string[];
  error?: string[];
  node?: NodeConfig;
  cmds?: string;
}

export async function testSshConnection(
  nodeConfig: NodeConfig,
  cmds: string[] = ["echo 'Connection test OK' && date"]
): Promise<SshTestResponse> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/ssh/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node: nodeConfig, cmds }),
    });
    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(responseData?.message || responseData?.error || `HTTP error ${response.status}`);
    }
    return responseData;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(String((error as any).message || error || 'Unknown API error'));
  }
}
