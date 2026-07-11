import assert from "node:assert/strict";
import test from "node:test";
import {
  dbgpCommand,
  parseBreakpoints,
  parseInit,
  parseProperties,
  parseStack,
  parseXmlAttributes,
  rawDbgpCommand,
  readDbgpPacket
} from "../src/dbgp.js";

test("reads fragmented DBGp packets", () => {
  const packet = readDbgpPacket(Buffer.from("5\0he"), Buffer.from("llo\0tail"));
  assert.deepEqual(packet, { body: "hello", rest: Buffer.from("tail") });
});

test("formats DBGp commands with base64 eval payload", () => {
  assert.equal(dbgpCommand("eval", 7, {}, "$a + 1"), "eval -i 7 -- JGEgKyAx\0");
});

test("adds transaction id to raw DBGp commands", () => {
  assert.equal(rawDbgpCommand("context_get -d 0", 3), "context_get -d 0 -i 3\0");
  assert.equal(rawDbgpCommand("status -i 9\0", 3), "status -i 9\0");
});

test("parses init metadata", () => {
  assert.deepEqual(parseInit('<init appid="123" idekey="MCP" fileuri="file:///tmp/demo.php" language="PHP" protocol_version="1.0"></init>'), { appid: "123", idekey: "MCP", fileuri: "file:///tmp/demo.php", language: "PHP", protocol_version: "1.0" });
});

test("parses response attributes", () => {
  assert.deepEqual(parseXmlAttributes('<response command="status" status="break" reason="ok"></response>'), { command: "status", status: "break", reason: "ok" });
});

test("parses stack frames", () => {
  assert.deepEqual(parseStack('<response><stack level="0" filename="file:///tmp/demo.php" lineno="3" where="{main}" /></response>'), [{ level: "0", filename: "file:///tmp/demo.php", lineno: "3", where: "{main}" }]);
});

test("parses breakpoints", () => {
  assert.deepEqual(parseBreakpoints('<response><breakpoint id="7" type="line" filename="file:///tmp/demo.php" lineno="3" state="enabled" /></response>'), [{ id: "7", type: "line", filename: "file:///tmp/demo.php", lineno: "3", state: "enabled" }]);
});

test("parses typed context properties", () => {
  assert.deepEqual(parseProperties('<response><property name="$a" type="int"><![CDATA[42]]></property><property name="$ok" type="bool"><![CDATA[1]]></property></response>'), [{ name: "$a", type: "int", value: 42 }, { name: "$ok", type: "bool", value: true }]);
});

test("parses nested context properties", () => {
  const xml = '<response><property name="$items" type="array"><property name="0" type="string"><![CDATA[first]]></property></property></response>';
  assert.deepEqual(parseProperties(xml), [{ name: "$items", type: "array", children: [{ name: "0", type: "string", value: "first" }] }]);
});
