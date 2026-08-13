# webssh MCP 接入（让 AI agent 管理你的服务器）

webssh 内置了一个 **MCP（Model Context Protocol）stdio 服务**，零依赖、纯 Node 实现。
Claude Desktop / Claude Code / Cursor 等支持 MCP 的 agent 接入后，可以：

- 列出 webssh 中已注册的服务器
- 探测服务器是否可登录
- 在单台 / 全部 / 探测成功的服务器上执行命令
- 注册、删除服务器

MCP 服务是 webssh **Model API**（`/api/model/*`）的桥接层，复用其全部安全限制：
命令 ≤ 4KB、超时 ≤ 120s、输出 ≤ 256KB、并发 ≤ 5、单次 exec ≤ 50 台，
且所有调用都会写入审计日志。

## 前置条件

1. webssh 服务端正在运行（Node 版：`npm run dev:server` 或桌面端）。
2. 服务端设置了**后端访问密码**（环境变量 `AUTH_TOKEN`）——就是你自己定的一个
   密码，例如 `AUTH_TOKEN=MyServer@2026 npm run dev:server`。
   注意：MCP 必须用固定密码；服务器自动生成的临时密码只在浏览器里自动生效，
   这里拿不到，不适用。
3. 在 webssh 设置面板里打开过「本地模型 API」同步，或通过 agent 的
   `webssh_add_server` 工具注册过服务器（注册表为空时 exec 会提示先注册）。

## 启动方式

```bash
WEBSSH_TOKEN=<你部署时定的后端访问密码> npm run mcp
# 可选：WEBSSH_URL=http://127.0.0.1:9627（默认即此值）
```

MCP 走 **stdio**：由 agent 客户端拉起进程，通过 stdin/stdout 交换 JSON-RPC，无需手动常驻。

## Claude Desktop / Cursor 配置

编辑 MCP 配置文件（Claude Desktop：`claude_desktop_config.json`；Cursor：MCP 设置页），加入：

```json
{
  "mcpServers": {
    "webssh": {
      "command": "node",
      "args": ["/绝对路径/webssh/core/mcp/server.mjs"],
      "env": {
        "WEBSSH_URL": "http://127.0.0.1:9627",
        "WEBSSH_TOKEN": "<你部署时定的后端访问密码>"
      }
    }
  }
}
```

## Claude Code 配置

```bash
claude mcp add webssh \
  -e WEBSSH_URL=http://127.0.0.1:9627 \
  -e WEBSSH_TOKEN=<你部署时定的后端访问密码> \
  -- node /绝对路径/webssh/core/mcp/server.mjs
```

## 提供的工具

| 工具 | 说明 |
| --- | --- |
| `webssh_list_servers` | 列出已注册服务器（不含凭据） |
| `webssh_probe_servers` | 测试 SSH 登录，可指定单台或全部 |
| `webssh_exec_command` | 执行命令；`server` 传服务器 id、`ok`（探测成功的）或 `all` |
| `webssh_add_server` | 注册/更新服务器（host/username/auth_value 必填） |
| `webssh_remove_server` | 删除已注册服务器 |

## 安全说明

- `WEBSSH_TOKEN` 就是你部署时定的后端访问密码（`AUTH_TOKEN`），**不要提交到代码仓库**；
  建议放在 agent 客户端的配置文件里（本机文件权限 600）。
- MCP 服务只监听 stdio，不开任何网络端口；对外通信全部经由 webssh 服务端，
  因此服务端的来源校验、限流、审计对它同样生效。
- `webssh_list_servers` 永不返回凭据；凭据只存在于服务端加密注册表中。
- Cloudflare 部署同样支持 MCP：把 `WEBSSH_URL` 指向你的 Workers/Pages 地址即可。
  前提是服务端配置了 `MODEL_REGISTRY` KV 绑定（见 README Cloudflare 小节），
  否则 `/api/model/*` 会返回 503 提示。MCP 桥本身仍是本地 Node 进程，
  只通过 HTTPS 与远端 webssh 通信。
