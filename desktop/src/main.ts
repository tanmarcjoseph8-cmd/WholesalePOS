import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { app, BrowserWindow, dialog } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

type DesktopSecrets = {
  accessSecret: string;
  refreshSecret: string;
};

type BackendRuntime = {
  backendEntry: string;
  databasePath: string;
  databaseUrl: string;
  frontendDist: string;
  port: number;
  secrets: DesktopSecrets;
};

let backendProcess: ChildProcessWithoutNullStreams | undefined;

function toFileUrlPath(filePath: string) {
  return `file:${filePath.replace(/\\/g, "/")}`;
}

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
}

function loadOrCreateSecrets(userDataPath: string): DesktopSecrets {
  const configDirectory = path.join(userDataPath, "config");
  const secretsPath = path.join(configDirectory, "secrets.json");
  ensureDirectory(configDirectory);

  if (fs.existsSync(secretsPath)) {
    return JSON.parse(fs.readFileSync(secretsPath, "utf8")) as DesktopSecrets;
  }

  const secrets = {
    accessSecret: crypto.randomBytes(48).toString("hex"),
    refreshSecret: crypto.randomBytes(48).toString("hex")
  };
  fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { encoding: "utf8", mode: 0o600 });
  return secrets;
}

function resolveRuntimePath(relativePath: string) {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), "app-assets", relativePath);
  }

  return path.resolve(app.getAppPath(), "..", relativePath);
}

function resolveNodeModulePath(relativePath: string) {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), "node_modules", relativePath);
  }

  return path.resolve(app.getAppPath(), "..", "node_modules", relativePath);
}

function findAvailablePort(preferredPort: number, host = "127.0.0.1") {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(preferredPort, host, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) {
          resolve(address.port);
          return;
        }
        reject(new Error("Unable to resolve backend port."));
      });
    });
  });
}

async function reserveBackendPort() {
  try {
    return await findAvailablePort(4000);
  } catch {
    return findAvailablePort(0);
  }
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "pipe",
      windowsHide: true
    });

    child.stderr.on("data", (data: Buffer) => {
      console.error(data.toString());
    });

    child.stdout.on("data", (data: Buffer) => {
      console.info(data.toString());
    });

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

function waitForBackend(port: number) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const attempt = () => {
      const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => {
        response.resume();
        if (response.statusCode === 200) {
          resolve();
          return;
        }
        retry();
      });

      request.on("error", retry);
      request.setTimeout(1_000, () => {
        request.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt > 20_000) {
        reject(new Error("The local backend did not start in time."));
        return;
      }
      setTimeout(attempt, 250);
    };

    attempt();
  });
}

function buildBackendRuntime(port: number): BackendRuntime {
  const userDataPath = app.getPath("userData");
  const databaseDirectory = path.join(userDataPath, "database");
  ensureDirectory(databaseDirectory);

  const secrets = loadOrCreateSecrets(userDataPath);
  const backendEntry = resolveRuntimePath(path.join("backend", "dist", "server.js"));
  const frontendDist = resolveRuntimePath(path.join("frontend", "dist"));
  const databasePath = path.join(databaseDirectory, "wholesalepos.sqlite");
  const databaseUrl = toFileUrlPath(databasePath);

  return { backendEntry, databasePath, databaseUrl, frontendDist, port, secrets };
}

function buildBackendEnv(runtime: BackendRuntime) {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(runtime.port),
    CORS_ORIGIN: `http://127.0.0.1:${runtime.port}`,
    DATABASE_URL: runtime.databaseUrl,
    FRONTEND_DIST_DIR: runtime.frontendDist,
    JWT_ACCESS_SECRET: runtime.secrets.accessSecret,
    JWT_REFRESH_SECRET: runtime.secrets.refreshSecret
  };
}

async function runMigrations(runtime: BackendRuntime) {
  fs.closeSync(fs.openSync(runtime.databasePath, "a"));
  const prismaCli = resolveNodeModulePath(path.join("prisma", "build", "index.js"));
  const schemaPath = resolveRuntimePath(path.join("backend", "prisma", "schema.prisma"));
  const cwd = app.isPackaged ? app.getAppPath() : path.resolve(app.getAppPath(), "..");
  await runCommand(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], buildBackendEnv(runtime), cwd);
}

function runBackend(runtime: BackendRuntime) {
  backendProcess = spawn(process.execPath, [runtime.backendEntry], {
    env: {
      ...buildBackendEnv(runtime),
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: "pipe",
    windowsHide: true
  });

  backendProcess.stderr.on("data", (data: Buffer) => {
    console.error(data.toString());
  });

  backendProcess.stdout.on("data", (data: Buffer) => {
    console.info(data.toString());
  });

  backendProcess.once("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Local backend exited with code ${code}.`);
    }
  });
}

async function createWindow(port: number) {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: "WholesalePOS",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

async function boot() {
  const port = await reserveBackendPort();
  const runtime = buildBackendRuntime(port);
  await runMigrations(runtime);
  runBackend(runtime);
  await waitForBackend(port);
  await createWindow(port);

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
      console.error("Update check failed", error);
    });
  }
}

app.whenReady().then(() => {
  boot().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "WholesalePOS could not start.";
    dialog.showErrorBox("WholesalePOS startup failed", message);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  backendProcess?.kill();
});
