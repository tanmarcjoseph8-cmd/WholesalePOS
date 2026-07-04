import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { getActor } from "../auth/actor.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import { createManualBackup, getSettings, listBackups, restoreBackup, updateSettings } from "./setting.service.js";
import { restoreBackupSchema, settingsUpdateSchema } from "./setting.schemas.js";

export const settingRouter = Router();

settingRouter.use(requireAuth);
settingRouter.use(requirePermission("settings.manage"));

settingRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    response.json(await getSettings(getActor(request)));
  })
);

settingRouter.put(
  "/",
  asyncHandler(async (request, response) => {
    response.json(await updateSettings(getActor(request), settingsUpdateSchema.parse(request.body)));
  })
);

settingRouter.get(
  "/backups",
  asyncHandler(async (_request, response) => {
    response.json(await listBackups());
  })
);

settingRouter.post(
  "/backups",
  asyncHandler(async (request, response) => {
    response.status(201).json(await createManualBackup(getActor(request)));
  })
);

settingRouter.post(
  "/restore",
  asyncHandler(async (request, response) => {
    const input = restoreBackupSchema.parse(request.body);
    response.json(await restoreBackup(getActor(request), input.backupRunId));
  })
);
