export type DbgpProperty = Record<string, unknown> & {
  name?: string;
  fullname?: string;
  type?: string;
  value?: unknown;
  children?: DbgpProperty[];
};

export function readDbgpPacket(buffer: Buffer, chunk: Buffer): { body: string; rest: Buffer } | undefined {
  const data = Buffer.concat([buffer, chunk]);
  const nul = data.indexOf(0);
  if (nul < 1) return undefined;

  const size = Number(data.subarray(0, nul).toString("ascii"));
  if (!Number.isFinite(size)) throw new Error("invalid DBGp packet length");

  const start = nul + 1;
  const end = start + size;
  if (data.length < end + 1) return undefined;

  return {
    body: data.subarray(start, end).toString("utf8"),
    rest: data.subarray(end + 1)
  };
}

export function dbgpCommand(name: string, transactionId: number, args: Record<string, string | number | undefined> = {}, data?: string): string {
  const parts = [name, "-i", String(transactionId)];

  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue;
    parts.push(`-${key}`, String(value));
  }

  if (data !== undefined) parts.push("--", Buffer.from(data).toString("base64"));

  return `${parts.join(" ")}\0`;
}

export function rawDbgpCommand(command: string, transactionId: number): string {
  const raw = command.replace(/\0$/, "");
  return raw.includes(" -i ") ? `${raw}\0` : `${raw} -i ${transactionId}\0`;
}

export function parseXmlAttributes(xml: string): Record<string, string> {
  const tag = xml.match(/^<\?xml[^>]*>\s*<([^\s>/]+)([^>]*)>/s) ?? xml.match(/<([^\s>/]+)([^>]*)>/s);
  if (!tag) return {};
  return parseAttributes(tag[2]);
}

export function parseInit(xml: string): Record<string, string> {
  const match = xml.match(/<init\b([^>]*)>/s);
  return match ? parseAttributes(match[1]) : {};
}

export function parseStack(xml: string): Array<Record<string, string>> {
  return [...xml.matchAll(/<stack\b([^>]*)\/?>/g)].map((match) => parseAttributes(match[1]));
}

export function parseBreakpoints(xml: string): Array<Record<string, string>> {
  return [...xml.matchAll(/<breakpoint\b([^>]*)\/?>/g)].map((match) => parseAttributes(match[1]));
}

export function parseProperties(xml: string): DbgpProperty[] {
  const responseStart = xml.indexOf(">");
  const responseEnd = xml.lastIndexOf("</response>");
  const body = responseStart >= 0 && responseEnd > responseStart ? xml.slice(responseStart + 1, responseEnd) : xml;
  return parsePropertyChildren(body);
}

function parsePropertyChildren(xml: string): DbgpProperty[] {
  const properties: DbgpProperty[] = [];
  let index = 0;

  while (index < xml.length) {
    const start = xml.indexOf("<property", index);
    if (start < 0) break;

    const openEnd = xml.indexOf(">", start);
    if (openEnd < 0) break;

    const open = xml.slice(start, openEnd + 1);
    const attrs = parseAttributes(open);

    if (open.endsWith("/>")) {
      properties.push(decodeProperty(attrs, ""));
      index = openEnd + 1;
      continue;
    }

    const closeStart = findPropertyClose(xml, openEnd + 1);
    if (closeStart < 0) break;

    const inner = xml.slice(openEnd + 1, closeStart);
    const children = parsePropertyChildren(inner);
    const cdata = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)?.[1] ?? "";
    const property = decodeProperty(attrs, cdata);
    if (children.length > 0) property.children = children;
    properties.push(property);
    index = closeStart + "</property>".length;
  }

  return properties;
}

function findPropertyClose(xml: string, index: number): number {
  let depth = 1;

  while (index < xml.length) {
    const nextOpen = xml.indexOf("<property", index);
    const nextClose = xml.indexOf("</property>", index);
    if (nextClose < 0) return -1;

    if (nextOpen >= 0 && nextOpen < nextClose) {
      const openEnd = xml.indexOf(">", nextOpen);
      if (openEnd < 0) return -1;
      if (!xml.slice(nextOpen, openEnd + 1).endsWith("/>")) depth++;
      index = openEnd + 1;
      continue;
    }

    depth--;
    if (depth === 0) return nextClose;
    index = nextClose + "</property>".length;
  }

  return -1;
}

function decodeProperty(attrs: Record<string, string>, rawValue: string): DbgpProperty {
  const property: DbgpProperty = { ...attrs };
  const type = attrs.type;

  if (rawValue !== "" && type !== "array" && type !== "object") {
    property.value =
      type === "int" ? Number.parseInt(rawValue, 10) :
      type === "float" ? Number.parseFloat(rawValue) :
      type === "bool" ? rawValue === "1" || rawValue === "true" :
      type === "null" ? null :
      rawValue;
  }

  return property;
}

function parseAttributes(text: string): Record<string, string> {
  return Object.fromEntries([...text.matchAll(/([:\w-]+)="([^"]*)"/g)].map((match) => [match[1], decodeXml(match[2])]));
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
