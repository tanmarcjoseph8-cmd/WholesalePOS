import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputPath = process.argv[2];
const endpoint = process.argv[3] ?? "http://127.0.0.1:9222/json";
const viewportWidth = Number(process.argv[4] ?? 0);
const viewportHeight = Number(process.argv[5] ?? 0);

if (!outputPath) throw new Error("Usage: node scripts/capture-webview.mjs <output.png> [cdp-json-url]");

const html2CanvasFile = (await readdir(path.resolve("dist/assets"))).find((file) => file.startsWith("html2canvas.esm-") && file.endsWith(".js"));
if (!html2CanvasFile) throw new Error("Build the app before capturing screenshots so the html2canvas asset is available.");

const pages = await (await fetch(endpoint)).json();
const page = pages.find((entry) => entry.type === "page");
if (!page?.webSocketDebuggerUrl) throw new Error("No debuggable Android WebView is available.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let nextId = 1;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
};

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

if (viewportWidth > 0 && viewportHeight > 0) {
  await call("Emulation.clearDeviceMetricsOverride");
  await call("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: viewportHeight,
    mobile: true,
    screenHeight: viewportHeight,
    screenWidth: viewportWidth,
    width: viewportWidth
  });
}

const expression = `(async () => {
  const module = await import('/assets/${html2CanvasFile}');
  const canvas = await module.default(document.documentElement, {
    backgroundColor: getComputedStyle(document.documentElement).backgroundColor || '#ffffff',
    height: window.innerHeight,
    scale: 1,
    useCORS: true,
    width: window.innerWidth,
    windowHeight: window.innerHeight,
    windowWidth: window.innerWidth
  });
  return canvas.toDataURL('image/png');
})()`;

const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "WebView screenshot failed.");
const dataUrl = result.result?.value;
if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) throw new Error("WebView did not return a PNG screenshot.");

await writeFile(outputPath, Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
socket.close();
