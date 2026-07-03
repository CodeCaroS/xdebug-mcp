#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, Server, Socket } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
  dbgpCommand,
  parseBreakpoints,
  parseInit,
  parseProperties,
  parseStack,
  parseXmlAttributes,
  rawDbgpCommand,
  readDbgpPacket
} from "./dbgp.js";

type Session = {
  id: string;
  socket: Socket;
  createdAt: string;
  initPacket: string;
  init: Record<string, string>;
  transaction: number;
  buffer: Buffer;
};

export class XdebugBridge {
  private server?: Server;
  private sessions = new Map<string, Session>();
  private nextSessionId = 1;

  constructor(private readonly readTimeoutMs = 10_000) {}

  listen(host = "127.0.0.1", port = 9003): Promise<string> {
    if (this.server?.listening) return Promise.resolve(`listening on ${host}:${port}`);

    this.server = createServer((socket) => void this.accept(socket));

    return new Promise((resolveListen, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, host, () => {
        this.server!.off("error", reject);
        resolveListen(`listening on ${host}:${port}`);
      });
    });
  }

  close(): string {
    for (const session of this.sessions.values()) session.socket.destroy();
    this.sessions.clear();
    this.server?.close();
    this.server = undefined;
    return "stopped";
  }

  list(): Array<Omit<Session, "socket" | "buffer">> {
    return [...this.sessions.values()].map(({ socket: _socket, buffer: _buffer, ...session }) => session);
  }

  async command(command: string, sessionId?: string): Promise<string> {
    const session = this.getSession(sessionId);
    session.socket.write(rawDbgpCommand(command, ++session.transaction));
    return this.readPacket(session);
  }

  async dbgp(name: string, args: Record<string, string | number | undefined> = {}, data?: string, sessionId?: string): Promise<string> {
    const session = this.getSession(sessionId);
    session.socket.write(dbgpCommand(name, ++session.transaction, args, data));
    return this.readPacket(session);
  }

  runPhp(file: string, args: string[] = [], cwd?: string, env: Record<string, string> = {}): Promise<string> {
    return new Promise((resolveRun, reject) => {
      const child = spawn("php", [file, ...args], {
        cwd,
        env: { ...process.env, XDEBUG_SESSION: "MCP", ...env },
        stdio: ["ignore", "pipe", "pipe"]
      });

      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      child.once("error", reject);
      child.once("close", (code) => resolveRun(`exit ${code}\n${output}`.trim()));
    });
  }

  toFileUri(file: string, cwd = process.cwd()): string {
    if (file.startsWith("file://")) return file;

    const absolute = resolve(cwd, file);
    if (!existsSync(absolute)) throw new Error(`file does not exist: ${absolute}`);
    return pathToFileURL(absolute).href;
  }

  private async accept(socket: Socket): Promise<void> {
    const initPacket = await this.readPacketFromSocket(socket);
    const id = String(this.nextSessionId++);
    const session: Session = {
      id,
      socket,
      createdAt: new Date().toISOString(),
      initPacket,
      init: parseInit(initPacket),
      transaction: 0,
      buffer: Buffer.alloc(0)
    };

    this.sessions.set(id, session);
    socket.once("close", () => this.sessions.delete(id));
  }

  private getSession(sessionId?: string): Session {
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error(`unknown session: ${sessionId}`);
      return session;
    }

    const sessions = [...this.sessions.values()];
    if (sessions.length === 1) return sessions[0];
    if (sessions.length === 0) throw new Error("no active Xdebug session");
    throw new Error(`multiple active Xdebug sessions: ${sessions.map((session) => session.id).join(", ")}`);
  }

  private readPacket(session: Session): Promise<string> {
    return this.readPacketFromSocket(session.socket, session);
  }

  private readPacketFromSocket(socket: Socket, session?: Session): Promise<string> {
    return new Promise((resolvePacket, reject) => {
      let buffer = session?.buffer ?? Buffer.alloc(0);
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`socket read timed out after ${this.readTimeoutMs}ms`));
      }, this.readTimeoutMs);
      const cleanup = () => {
        clearTimeout(timeout);
        socket.off("data", onData);
        socket.off("error", onError);
        socket.off("close", onClose);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onClose = () => {
        cleanup();
        reject(new Error("socket closed"));
      };
      const onData = (chunk: Buffer) => {
        const packet = readDbgpPacket(buffer, chunk);
        if (!packet) {
          buffer = Buffer.concat([buffer, chunk]);
          if (session) session.buffer = buffer;
          return;
        }
        if (session) session.buffer = packet.rest;
        cleanup();
        resolvePacket(packet.body);
      };

      socket.on("data", onData);
      socket.once("error", onError);
      socket.once("close", onClose);
    });
  }
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

export async function main(): Promise<void> {
  const bridge = new XdebugBridge();
  const server = new McpServer({ name: "xdebug-mcp", version: "0.2.0" });

  server.tool("xdebug_listen", { host: z.string().default("127.0.0.1"), port: z.number().int().default(9003) }, async ({ host, port }) =>
    text(await bridge.listen(host, port))
  );

  server.tool("xdebug_stop", {}, async () => text(bridge.close()));

  server.tool("xdebug_sessions", {}, async () => text(bridge.list()));

  server.tool("xdebug_command", { command: z.string(), sessionId: z.string().optional() }, async ({ command, sessionId }) =>
    text(await bridge.command(command, sessionId))
  );

  server.tool("xdebug_run_php", { file: z.string(), args: z.array(z.string()).default([]), cwd: z.string().optional(), env: z.record(z.string()).default({}) }, async ({ file, args, cwd, env }) =>
    text(await bridge.runPhp(file, args, cwd, env))
  );

  server.tool("xdebug_status", { sessionId: z.string().optional() }, async ({ sessionId }) =>
    text(parseXmlAttributes(await bridge.dbgp("status", {}, undefined, sessionId)))
  );

  server.tool("xdebug_step_into", { sessionId: z.string().optional() }, async ({ sessionId }) => text(await bridge.dbgp("step_into", {}, undefined, sessionId)));
  server.tool("xdebug_step_over", { sessionId: z.string().optional() }, async ({ sessionId }) => text(await bridge.dbgp("step_over", {}, undefined, sessionId)));
  server.tool("xdebug_step_out", { sessionId: z.string().optional() }, async ({ sessionId }) => text(await bridge.dbgp("step_out", {}, undefined, sessionId)));
  server.tool("xdebug_continue", { sessionId: z.string().optional() }, async ({ sessionId }) => text(await bridge.dbgp("run", {}, undefined, sessionId)));

  server.tool("xdebug_stack", { sessionId: z.string().optional() }, async ({ sessionId }) =>
    text(parseStack(await bridge.dbgp("stack_get", {}, undefined, sessionId)))
  );

  server.tool("xdebug_current_location", { sessionId: z.string().optional() }, async ({ sessionId }) => {
    const frame = parseStack(await bridge.dbgp("stack_get", {}, undefined, sessionId))[0];
    return text(frame ? { file: frame.filename, line: Number(frame.lineno), function: frame.where } : null);
  });

  server.tool("xdebug_context", { sessionId: z.string().optional(), depth: z.number().int().optional(), contextId: z.number().int().optional() }, async ({ sessionId, depth, contextId }) =>
    text(parseProperties(await bridge.dbgp("context_get", { d: depth, c: contextId }, undefined, sessionId)))
  );

  server.tool("xdebug_eval", { expression: z.string(), sessionId: z.string().optional() }, async ({ expression, sessionId }) =>
    text(parseProperties(await bridge.dbgp("eval", {}, expression, sessionId)))
  );

  server.tool("xdebug_breakpoint_set", { file: z.string(), line: z.number().int(), cwd: z.string().optional(), sessionId: z.string().optional() }, async ({ file, line, cwd, sessionId }) =>
    text(parseXmlAttributes(await bridge.dbgp("breakpoint_set", { t: "line", f: bridge.toFileUri(file, cwd), n: line }, undefined, sessionId)))
  );

  server.tool("xdebug_breakpoint_remove", { breakpointId: z.string(), sessionId: z.string().optional() }, async ({ breakpointId, sessionId }) =>
    text(parseXmlAttributes(await bridge.dbgp("breakpoint_remove", { d: breakpointId }, undefined, sessionId)))
  );

  server.tool("xdebug_breakpoint_list", { sessionId: z.string().optional() }, async ({ sessionId }) =>
    text(parseBreakpoints(await bridge.dbgp("breakpoint_list", {}, undefined, sessionId)))
  );

  server.tool("xdebug_feature_get", { name: z.string(), sessionId: z.string().optional() }, async ({ name, sessionId }) =>
    text(parseXmlAttributes(await bridge.dbgp("feature_get", { n: name }, undefined, sessionId)))
  );

  server.tool("xdebug_feature_set", { name: z.string(), value: z.string(), sessionId: z.string().optional() }, async ({ name, value, sessionId }) =>
    text(parseXmlAttributes(await bridge.dbgp("feature_set", { n: name, v: value }, undefined, sessionId)))
  );

  server.tool("xdebug_set_breakpoint_and_run", { file: z.string(), line: z.number().int(), cwd: z.string().optional(), sessionId: z.string().optional() }, async ({ file, line, cwd, sessionId }) => {
    const breakpoint = parseXmlAttributes(await bridge.dbgp("breakpoint_set", { t: "line", f: bridge.toFileUri(file, cwd), n: line }, undefined, sessionId));
    const run = parseXmlAttributes(await bridge.dbgp("run", {}, undefined, sessionId));
    return text({ breakpoint, run });
  });

  await server.connect(new StdioServerTransport());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
