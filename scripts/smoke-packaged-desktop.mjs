import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findReleaseDirectory() {
  if (process.env.WHOLESALEPOS_RELEASE_DIR) {
    return path.resolve(process.env.WHOLESALEPOS_RELEASE_DIR);
  }

  const desktopDirectory = path.join(root, "desktop");
  const releases = fs
    .readdirSync(desktopDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("release"))
    .map((entry) => path.join(desktopDirectory, entry.name, "win-unpacked"))
    .filter((candidate) => fs.existsSync(path.join(candidate, "resources", "app")))
    .map((candidate) => ({ path: candidate, updatedAt: fs.statSync(candidate).mtimeMs }))
    .sort((left, right) => right.updatedAt - left.updatedAt);

  const [latest] = releases;
  if (!latest) {
    throw new Error("No packaged desktop release was found. Run `pnpm desktop:package:win` first.");
  }

  return latest.path;
}

function requestJson(port, pathname, options = {}) {
  const body = options.body ? JSON.stringify(options.body) : undefined;

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: options.method ?? "GET",
        timeout: 2_500,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
        }
      },
      (response) => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          const parsed = data ? JSON.parse(data) : null;
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            resolve(parsed);
            return;
          }
          reject(new Error(parsed?.message ?? `Request failed with status ${response.statusCode ?? "unknown"}.`));
        });
      }
    );

    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy(new Error("Request timed out."));
    });

    if (body) request.write(body);
    request.end();
  });
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) {
          resolve(address.port);
          return;
        }
        reject(new Error("Could not reserve a smoke-test port."));
      });
    });
  });
}

function runCommand(command, args, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(command)} exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function waitForBackend(port, backendProcess) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    if (backendProcess.exitCode !== null) {
      throw new Error(`Backend exited before becoming ready with code ${backendProcess.exitCode}.`);
    }

    try {
      const health = await requestJson(port, "/api/health");
      if (health?.status === "ok") return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  throw new Error("Packaged backend did not become ready in time.");
}

function stopBackend(backendProcess) {
  if (!backendProcess || backendProcess.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    backendProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    backendProcess.kill();
  });
}

const releaseDirectory = findReleaseDirectory();
const appRoot = path.join(releaseDirectory, "resources", "app");
const nodeRuntime = path.join(appRoot, "app-assets", "runtime", process.platform === "win32" ? "node.exe" : "node");
const prismaCli = path.join(appRoot, "node_modules", "prisma", "build", "index.js");
const schemaPath = path.join(appRoot, "app-assets", "backend", "prisma", "schema.prisma");
const backendEntry = path.join(appRoot, "app-assets", "backend", "dist", "server.js");
const frontendDist = path.join(appRoot, "app-assets", "frontend", "dist");
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "wholesalepos-packaged-smoke-"));
const databasePath = path.join(tempDirectory, "wholesalepos.sqlite");
fs.closeSync(fs.openSync(databasePath, "a"));

const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
const port = await findAvailablePort();
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(port),
  DATABASE_URL: databaseUrl,
  FRONTEND_DIST_DIR: frontendDist,
  CORS_ORIGIN: `http://127.0.0.1:${port}`,
  JWT_ACCESS_SECRET: "packaged-smoke-access-secret-000000000000000000000000000000",
  JWT_REFRESH_SECRET: "packaged-smoke-refresh-secret-0000000000000000000000000000"
};

let backendProcess;
try {
  await runCommand(nodeRuntime, [prismaCli, "migrate", "deploy", "--schema", schemaPath], env, appRoot);
  backendProcess = spawn(nodeRuntime, [backendEntry], { env, stdio: "inherit", windowsHide: true });
  await waitForBackend(port, backendProcess);

  const setupStatus = await requestJson(port, "/api/auth/setup");
  if (!setupStatus?.requiresSetup) {
    throw new Error("A fresh smoke-test database should require setup.");
  }

  const session = await requestJson(port, "/api/auth/setup", {
    method: "POST",
    body: {
      name: "Smoke Owner",
      email: "owner@example.com",
      password: "strongpassword123",
      storeName: "Smoke Store"
    }
  });

  const passwordCheck = await requestJson(port, "/api/auth/verify-password", {
    method: "POST",
    token: session.accessToken,
    body: { password: "strongpassword123" }
  });
  if (passwordCheck?.verified !== true) {
    throw new Error("Password verification smoke test failed.");
  }

  const product = await requestJson(port, "/api/products", {
    method: "POST",
    token: session.accessToken,
    body: {
      name: "Smoke Test Product",
      description: null,
      imageUrl: null,
      brand: "Smoke",
      categoryId: null,
      supplierId: null,
      inventoryUnit: "KILOGRAM",
      sellingUnit: "KILOGRAM",
      unitRatioToBase: 1,
      costPrice: 240,
      retailPrice: 300,
      wholesalePrice: 280,
      vipPrice: 280,
      packageSize: 5,
      taxRate: 0,
      wholesaleThreshold: 0,
      minimumStock: 1,
      maximumStock: null,
      status: "ACTIVE",
      expiresAt: null,
      batchNumber: null,
      location: null,
      notes: null,
      barcodes: [{ value: "123456789012", isPrimary: true }]
    }
  });

  const list = await requestJson(port, "/api/products?pageSize=10", { token: session.accessToken });
  if (product?.name !== "Smoke Test Product" || product?.sku !== "123456789012" || !Array.isArray(list?.items) || list.items.length !== 1) {
    throw new Error("Packaged product persistence smoke test failed.");
  }

  const noBarcodeProduct = await requestJson(port, "/api/products", {
    method: "POST",
    token: session.accessToken,
    body: {
      name: "No Barcode Product",
      description: null,
      imageUrl: null,
      brand: "Smoke",
      categoryId: null,
      supplierId: null,
      inventoryUnit: "PIECE",
      sellingUnit: "PIECE",
      unitRatioToBase: 1,
      costPrice: 8,
      retailPrice: 12,
      wholesalePrice: 10,
      vipPrice: 10,
      packageSize: 1,
      taxRate: 0,
      wholesaleThreshold: 0,
      minimumStock: 1,
      maximumStock: null,
      status: "ACTIVE",
      expiresAt: null,
      batchNumber: null,
      location: null,
      notes: null,
      barcodes: []
    }
  });
  if (noBarcodeProduct?.name !== "No Barcode Product" || !String(noBarcodeProduct?.sku).startsWith("AUTO-") || noBarcodeProduct?.barcodes?.length !== 0) {
    throw new Error("No-barcode product smoke test failed.");
  }

  const warehouses = await requestJson(port, "/api/inventory/warehouses", { token: session.accessToken });
  const warehouseId = warehouses?.[0]?.id;
  if (!warehouseId) {
    throw new Error("Packaged warehouse smoke test failed.");
  }

  await requestJson(port, "/api/inventory/movements", {
    method: "POST",
    token: session.accessToken,
    body: {
      productId: product.id,
      warehouseId,
      type: "STOCK_IN",
      quantity: 5,
      unitCost: 240,
      reason: "Packaged smoke stock"
    }
  });

  const sale = await requestJson(port, "/api/sales", {
    method: "POST",
    token: session.accessToken,
    body: {
      customerId: null,
      items: [{ productId: product.id, warehouseId, quantity: 2500, soldUnit: "GRAM", discount: 0 }],
      payments: [{ method: "CASH", amount: 150, reference: null }]
    }
  });

  const stock = await requestJson(port, `/api/inventory/stock?productId=${product.id}`, { token: session.accessToken });
  const remaining = stock?.items?.[0]?.quantity;
  if (Math.abs(Number(remaining) - 2.5) > 0.0001) {
    throw new Error(`Variable quantity stock deduction failed. Expected 2.5kg left, got ${remaining}.`);
  }

  const receipt = await requestJson(port, `/api/receipts/sales/${sale.id}?paperWidth=80mm`, { token: session.accessToken });
  if (!receipt?.html?.includes(sale.receiptNumber) || !receipt?.barcodeSvg?.includes(sale.receiptNumber) || !receipt?.escPosBase64) {
    throw new Error("Receipt generation smoke test failed.");
  }

  const printRequest = await requestJson(port, `/api/receipts/sales/${sale.id}/print`, {
    method: "POST",
    token: session.accessToken,
    body: {
      paperWidth: "80mm",
      printerType: "WINDOWS",
      printerName: "Smoke default printer"
    }
  });
  if (!printRequest?.printLogId) {
    throw new Error("Receipt print logging smoke test failed.");
  }

  const report = await requestJson(port, "/api/reports/overview?period=daily", { token: session.accessToken });
  if (report?.summary?.salesCount !== 1 || Math.abs(Number(report?.summary?.revenue) - 150) > 0.0001) {
    throw new Error("Sales reporting smoke test failed.");
  }

  const excelExport = await requestJson(port, "/api/reports/export?period=daily&format=excel", { token: session.accessToken });
  if (!excelExport?.content?.includes("Best Sellers") || !excelExport?.fileName?.endsWith(".csv")) {
    throw new Error("Excel-compatible report export smoke test failed.");
  }

  const settings = await requestJson(port, "/api/settings", { token: session.accessToken });
  const updatedSettings = await requestJson(port, "/api/settings", {
    method: "PUT",
    token: session.accessToken,
    body: {
      ...settings,
      business: { ...settings.business, name: "Smoke Store Updated" },
      receipt: { ...settings.receipt, paperWidth: "80mm" }
    }
  });
  if (updatedSettings?.business?.name !== "Smoke Store Updated") {
    throw new Error("Settings update smoke test failed.");
  }

  const backup = await requestJson(port, "/api/settings/backups", { method: "POST", token: session.accessToken });
  const backups = await requestJson(port, "/api/settings/backups", { token: session.accessToken });
  if (backup?.status !== "COMPLETED" || !Array.isArray(backups) || !backups.some((item) => item.id === backup.id)) {
    throw new Error("Backup smoke test failed.");
  }

  console.info("Packaged desktop smoke test passed.");
} finally {
  await stopBackend(backendProcess);
  fs.rmSync(tempDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
