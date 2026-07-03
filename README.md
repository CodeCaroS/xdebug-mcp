# xdebug-mcp

An MCP server that lets agents drive PHP debugging through Xdebug's DBGp protocol.

## Table Of Contents

1. [About The Project](#about-the-project)
2. [Built With](#built-with)
3. [Getting Started](#getting-started)
4. [Usage](#usage)
5. [Tools](#tools)
6. [Roadmap](#roadmap)
7. [Contributing](#contributing)
8. [License](#license)
9. [Acknowledgments](#acknowledgments)

## About The Project

`xdebug-mcp` exposes Xdebug sessions as Model Context Protocol tools. It starts a DBGp listener, accepts Xdebug connections, sends debug commands, parses common responses into JSON, and keeps raw DBGp access available when needed.

It is intentionally not a full IDE. The goal is a small, scriptable debug bridge that an MCP client or coding agent can use to:

- start a listener for PHP/Xdebug
- run PHP files with `XDEBUG_SESSION=MCP`
- inspect active sessions and current source location
- step through execution
- set, remove, and list breakpoints
- inspect stack frames, context variables, and eval results
- tune Xdebug features such as `max_depth`, `max_children`, and `max_data`

## Built With

- Node.js
- TypeScript
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Xdebug / DBGp

## Getting Started

### Prerequisites

- Node.js 22 or newer
- npm
- PHP with Xdebug installed and enabled

### Installation

1. Clone the repo.

   ```bash
   git clone https://github.com/CodeCaroS/xdebug-mcp.git
   cd xdebug-mcp
   ```

2. Install dependencies and build.

   ```bash
   npm install
   npm run build
   ```

3. Configure PHP/Xdebug to connect to the MCP listener.

   ```ini
   xdebug.mode=debug
   xdebug.client_host=127.0.0.1
   xdebug.client_port=9003
   ```

4. Add the server to your MCP client config.

   ```json
   {
     "mcpServers": {
       "xdebug": {
         "command": "node",
         "args": ["/absolute/path/to/xdebug-mcp/dist/index.js"]
       }
     }
   }
   ```

### Codex Plugin

This repository can also be used as a Codex plugin. The plugin manifest is in `.codex-plugin/plugin.json`, and the MCP server definition is in `.mcp.json`.

Build before using the plugin:

```bash
npm install
npm run build
```

The plugin starts the MCP server with:

```bash
npm run start --silent
```

## Usage

Start the listener through your MCP client:

```text
xdebug_listen
```

Run a PHP file with an Xdebug session:

```text
xdebug_run_php({ "file": "examples/demo.php" })
```

Inspect the active session:

```text
xdebug_sessions
xdebug_current_location
xdebug_stack
xdebug_context
```

Set a breakpoint and continue:

```text
xdebug_set_breakpoint_and_run({ "file": "examples/demo.php", "line": 4 })
```

Raw DBGp is still available:

```text
xdebug_command({ "command": "status" })
```

## Tools

- `xdebug_listen` starts the DBGp listener.
- `xdebug_stop` stops the listener and active sessions.
- `xdebug_sessions` lists active sessions with parsed Xdebug init metadata.
- `xdebug_run_php` starts a PHP file with `XDEBUG_SESSION=MCP`; optional `cwd` and `env`.
- `xdebug_command` sends raw DBGp commands.
- `xdebug_status` returns parsed status metadata.
- `xdebug_step_into`, `xdebug_step_over`, `xdebug_step_out`, `xdebug_continue` control execution.
- `xdebug_stack` returns parsed stack frames.
- `xdebug_current_location` returns the top stack frame as file, line, and function.
- `xdebug_context` returns parsed context variables.
- `xdebug_eval` evaluates an expression and returns parsed properties.
- `xdebug_breakpoint_set`, `xdebug_breakpoint_remove`, `xdebug_breakpoint_list` manage breakpoints.
- `xdebug_feature_get`, `xdebug_feature_set` inspect and tune Xdebug features.
- `xdebug_set_breakpoint_and_run` sets a line breakpoint and continues execution.

## Roadmap

- Decode more DBGp property edge cases.
- Add integration checks against a real PHP/Xdebug process.
- Add small recipes for common debugging workflows.

## Contributing

Issues and pull requests are welcome. Keep changes small and focused; this project should stay a debug bridge, not grow into an IDE.

## License

No license has been selected yet.

## Acknowledgments

- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) for the README structure.
- [Xdebug](https://xdebug.org/) for PHP debugging.
- [Model Context Protocol](https://modelcontextprotocol.io/) for the tool protocol.
