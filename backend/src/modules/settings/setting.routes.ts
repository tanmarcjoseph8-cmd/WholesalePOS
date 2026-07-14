import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { getActor } from "../auth/actor.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import { createManualBackup, getRuntimeSettings, getSettings, listBackups, restoreBackup, updateSettings } from "./setting.service.js";
import { restoreBackupSchema, settingsUpdateSchema } from "./setting.schemas.js";

export const settingRouter = Router();

settingRouter.use(requireAuth);

settingRouter.get(
  "/runtime",
  asyncHandler(async (request, response) => {
    response.json(await getRuntimeSettings(getActor(request)));
  })
);

settingRouter.get(
  "/",
  requirePermission("settings.manage"),
  asyncHandler(async (request, response) => {
    response.json(await getSettings(getActor(request)));
  })
);

settingRouter.put(
  "/",
  requirePermission("settings.manage"),
  asyncHandler(async (request, response) => {
    response.json(await updateSettings(getActor(request), settingsUpdateSchema.parse(request.body)));
  })
);

settingRouter.get(
  "/backups",
  requirePermission("settings.manage"),
  asyncHandler(async (_request, response) => {
    response.json(await listBackups());
  })
);

settingRouter.post(
  "/backups",
  requirePermission("settings.manage"),
  asyncHandler(async (request, response) => {
    response.status(201).json(await createManualBackup(getActor(request)));
  })
);

settingRouter.post(
  "/restore",
  requirePermission("settings.manage"),
  asyncHandler(async (request, response) => {
    const input = restoreBackupSchema.parse(request.body);
    response.json(await restoreBackup(getActor(request), input.backupRunId));
  })
);
