import { Router } from "express";
import { getActor } from "../auth/actor.js";
import { requireAnyPermission, requireAuth, requirePermission } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import {
  adjustInventoryCount,
  createInventoryMovement,
  listMovements,
  listStock,
  listWarehouses,
  transferInventory
} from "./inventory.service.js";
import {
  inventoryCountAdjustmentSchema,
  inventoryListQuerySchema,
  inventoryMovementCreateSchema,
  inventoryTransferSchema,
  movementListQuerySchema
} from "./inventory.schemas.js";

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);

inventoryRouter.get(
  "/warehouses",
  requireAnyPermission(["inventory.manage", "sales.manage"]),
  asyncHandler(async (_request, response) => {
    response.json(await listWarehouses());
  })
);

inventoryRouter.get(
  "/stock",
  requireAnyPermission(["inventory.manage", "sales.manage"]),
  asyncHandler(async (request, response) => {
    response.json(await listStock(inventoryListQuerySchema.parse(request.query)));
  })
);

inventoryRouter.get(
  "/movements",
  requirePermission("inventory.manage"),
  asyncHandler(async (request, response) => {
    response.json(await listMovements(movementListQuerySchema.parse(request.query)));
  })
);

inventoryRouter.post(
  "/movements",
  requirePermission("inventory.manage"),
  asyncHandler(async (request, response) => {
    const input = inventoryMovementCreateSchema.parse(request.body);
    response.status(201).json(await createInventoryMovement(input, getActor(request)));
  })
);

inventoryRouter.post(
  "/counts",
  requirePermission("inventory.manage"),
  asyncHandler(async (request, response) => {
    const input = inventoryCountAdjustmentSchema.parse(request.body);
    response.status(201).json(await adjustInventoryCount(input, getActor(request)));
  })
);

inventoryRouter.post(
  "/transfers",
  requirePermission("inventory.manage"),
  asyncHandler(async (request, response) => {
    const input = inventoryTransferSchema.parse(request.body);
    response.status(201).json(await transferInventory(input, getActor(request)));
  })
);
