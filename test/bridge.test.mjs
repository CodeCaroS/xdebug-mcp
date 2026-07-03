import assert from "node:assert/strict";
import { createConnection } from "node:net";
import test from "node:test";
import { XdebugBridge } from "../dist/index.js";

test("accepts an Xdebug init session", async () => {
  const bridge = new XdebugBridge();
  await bridge.listen("127.0.0.1", 39003);

  const socket = createConnection({ host: "127.0.0.1", port: 39003 });
  const init = '<init fileuri="file:///demo.php"/>';
  socket.write(`${Buffer.byteLength(init)}\0${init}\0`);

  for (let i = 0; i < 20 && bridge.list().length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(bridge.list().length, 1);
  assert.match(bridge.list()[0].initPacket, /file:\/\/\/demo\.php/);
  assert.equal(bridge.list()[0].init.fileuri, "file:///demo.php");

  socket.destroy();
  bridge.close();
});

test("converts existing local paths to file URIs", () => {
  const bridge = new XdebugBridge();

  assert.match(bridge.toFileUri("examples/demo.php"), /^file:\/\/\/.*examples\/demo\.php$/);
  assert.throws(() => bridge.toFileUri("examples/missing.php"), /file does not exist/);
});
