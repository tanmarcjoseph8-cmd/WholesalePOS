import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { getActor } from "../auth/actor.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import {
  createImportPreset,
  deleteImportPreset,
  executeImport,
  getImportBatch,
  getImportReport,
  listImportBatches,
  listImportPresets,
  previewImport,
  rollbackImport
} from "./inventory-import.service.js";
import {
  inventoryImportExecuteSchema,
  inventoryImportIdSchema,
  inventoryImportListQuerySchema,
  inventoryImportPresetCreateSchema,
  inventoryImportPreviewSchema
} from "./inventory-import.schemas.js";

export const inventoryImportRouter = Router();

inventoryImportRouter.use(requireAuth);

inventoryImportRouter.post(
  "/preview",
  requirePermission("inventory.import"),
  asyncHandler(async (request, response) => {
    response.json(await previewImport(inventoryImportPreviewSchema.parse(request.body), getActor(request)));
  })
);

inventoryImportRouter.post(
  "/execute",
  requirePermission("inventory.import"),
  asyncHandler(async (request, response) => {
    response.status(201).json(await executeImport(inventoryImportExecuteSchema.parse(request.body), getActor(request)));
  })
);

inventoryImportRouter.get(
  "/",
  requirePermission("inventory.import"),
  asyncHandler(async (request, response) => {
    response.json(await listImportBatches(inventoryImportListQuerySchema.parse(request.query), getActor(request)));
  })
);

inventoryImportRouter.get(
  "/presets",
  requirePermission("inventory.import"),
  asyncHandler(async (request, response) => {
    response.json(await listImportPresets(getActor(request)));
  })
);

inventoryImportRouter.post(
  "/presets",
  requirePermission("inventory.import"),
  asyncHandler(async (request, response) => {
    response.status(201).json(await createImportPreset(inventoryImportPresetCreateSchema.parse(request.body), getActor(request)));
  })
);

inventoryImportRouter.delete(
  "/presets/:id",
  requirePermission("inventory.import"),
  asyncHandler(async (request, response) => {
    response.json(await deleteImportPreset(inventoryImportIdSchema.parse(request.params).id, getActor(request)));
  })
);

inventoryImportRouter.get(
  "/:id/report",
  requirePermission("inventory.import"),
  asyncHandler(async (request, response) => {
    const { id } = inventoryImportIdSchema.parse(request.params);
    response.type("text/csv").attachment(`inventory-import-${id}.csv`).send(await getImportReport(id, getActor(request)));
  })
);

inventoryImportRouter.post(
  "/:id/rollback",
  requirePermission("inventory.import.rollback"),
  asyncHandler(async (request, response) => {
    response.json(await rollbackImport(inventoryImportIdSchema.parse(request.params).id, getActor(request)));
  })
);

inventoryImportRouter.get(
  "/:id",
  requirePermission("inventory.import"),
  asyncHandler(async (request, response) => {
    response.json(await getImportBatch(inventoryImportIdSchema.parse(request.params).id, getActor(request)));
  })
);
