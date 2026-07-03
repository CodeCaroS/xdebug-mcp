# xdebug-mcp

Minimal MCP server for Xdebug/DBGp.

## Setup

```bash
npm install
npm run build
```

MCP config:

```json
{
  "mcpServers": {
    "xdebug": {
      "command": "node",
      "args": ["C:/Users/carol/OneDrive/Dokumente/xdebug mcp/dist/index.js"]
    }
  }
}
```

## Xdebug

PHP/Xdebug must connect to the MCP listener:

```ini
xdebug.mode=debug
xdebug.client_host=127.0.0.1
xdebug.client_port=9003
```

## Tools

- `xdebug_listen` starts the DBGp listener.
- `xdebug_run_php` starts a PHP file with `XDEBUG_SESSION=MCP`; optional `cwd` and `env`.
- `xdebug_sessions` lists active sessions with parsed Xdebug init metadata.
- `xdebug_command` sends raw DBGp commands, for example `status`, `step_into`, or `context_get`.
- `xdebug_status`, `xdebug_step_into`, `xdebug_step_over`, `xdebug_step_out`, `xdebug_continue`.
- `xdebug_stack`, `xdebug_current_location`, `xdebug_context`, `xdebug_eval`.
- `xdebug_breakpoint_set`, `xdebug_breakpoint_remove`, `xdebug_breakpoint_list`.
- `xdebug_feature_get`, `xdebug_feature_set`.
- `xdebug_set_breakpoint_and_run` sets a line breakpoint and continues execution.
- `xdebug_stop` stops the listener and sessions.

The server returns parsed JSON for common responses and keeps raw DBGp access available through `xdebug_command`.

Skipped: IDE UI and webserver/browser orchestration. Add them when CLI-driven debugging is not enough.
