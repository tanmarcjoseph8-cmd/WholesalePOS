const expressionArg = process.argv[2];
const endpoint = process.argv[3] ?? "http://127.0.0.1:9222/json";
const expression = expressionArg?.startsWith("base64:")
  ? Buffer.from(expressionArg.slice("base64:".length), "base64").toString("utf8")
  : expressionArg;

if (!expression) throw new Error("Usage: node scripts/webview-evaluate.mjs <expression> [cdp-json-url]");

const pages = await (await fetch(endpoint)).json();
const page = pages.find((entry) => entry.type === "page");
if (!page?.webSocketDebuggerUrl) throw new Error("No debuggable Android WebView is available.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

const result = await new Promise((resolve, reject) => {
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  };
  socket.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: { expression, awaitPromise: true, returnByValue: true }
  }));
});

socket.close();
if (result.exceptionDetails) {
  const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "WebView evaluation failed.";
  throw new Error(detail);
}
console.log(JSON.stringify(result.result?.value ?? null, null, 2));
