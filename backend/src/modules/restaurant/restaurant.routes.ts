import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { getActor } from "../auth/actor.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import {
  restaurantOrderCancelSchema,
  restaurantOrderCheckoutSchema,
  restaurantOrderCreateSchema,
  restaurantOrderListQuerySchema,
  restaurantOrderLockSchema,
  restaurantOrderMergeSchema,
  restaurantOrderReopenSchema,
  restaurantOrderSplitSchema,
  restaurantOrderTableAssignmentSchema,
  restaurantOrderUndoSchema,
  restaurantOrderUpdateSchema,
  restaurantTableCreateSchema,
  restaurantTableListQuerySchema,
  restaurantTableUpdateSchema
} from "./restaurant.schemas.js";
import {
  acquireRestaurantOrderLock,
  assignRestaurantOrderTables,
  cancelRestaurantOrder,
  checkoutRestaurantOrder,
  createRestaurantOrder,
  createRestaurantTable,
  disableRestaurantTable,
  getRestaurantOrder,
  listRestaurantOrders,
  listRestaurantTables,
  mergeRestaurantOrders,
  releaseRestaurantOrderLock,
  reopenRestaurantOrder,
  restoreRestaurantTable,
  splitRestaurantOrder,
  undoRestaurantOrderItemChange,
  updateRestaurantOrder,
  updateRestaurantTable
} from "./restaurant.service.js";

export const restaurantRouter = Router();

function routeId(value: string | string[] | undefined) {
  const id = Array.isArray(value) ? value[0] : value;
  if (!id) throw new Error("Route id is required.");
  return id;
}

restaurantRouter.use(requireAuth);

restaurantRouter.get(
  "/tables",
  requirePermission("orders.manage"),
  asyncHandler(async (request, response) => {
    response.json(await listRestaurantTables(restaurantTableListQuerySchema.parse(request.query), getActor(request)));
  })
);

restaurantRouter.post(
  "/tables",
  requirePermission("tables.manage"),
  asyncHandler(async (request, response) => {
    response.status(201).json(await createRestaurantTable(restaurantTableCreateSchema.parse(request.body), getActor(request)));
  })
);

restaurantRouter.patch(
  "/tables/:id",
  requirePermission("tables.manage"),
  asyncHandler(async (request, response) => {
    response.json(await updateRestaurantTable(routeId(request.params.id), restaurantTableUpdateSchema.parse(request.body), getActor(request)));
  })
);

restaurantRouter.delete(
  "/tables/:id",
  requirePermission("tables.manage"),
  asyncHandler(async (request, response) => {
    response.json(await disableRestaurantTable(routeId(request.params.id), getActor(request)));
  })
);

restaurantRouter.post(
  "/tables/:id/restore",
  requirePermission("tables.manage"),
  asyncHandler(async (request, response) => {
    response.json(await restoreRestaurantTable(routeId(request.params.id), getActor(request)));
  })
);

restaurantRouter.get(
  "/orders",
  requirePermission("orders.manage"),
  asyncHandler(async (request, response) => {
    response.json(await listRestaurantOrders(restaurantOrderListQuerySchema.parse(request.query), getActor(request)));
  })
);

restaurantRouter.post(
  "/orders",
  requirePermission("orders.manage"),
  asyncHandler(async (request, response) => {
    response.status(201).json(await createRestaurantOrder(restaurantOrderCreateSchema.parse(request.body), getActor(request)));
  })
);

restaurantRouter.get(
  "/orders/:id",
  requirePermission("orders.manage"),
  asyncHandler(async (request, response) => {
    response.json(await getRestaurantOrder(routeId(request.params.id), getActor(request)));
  })
);

restaurantRouter.patch(
  "/orders/:id",
  requirePermission("orders.manage"),
  asyncHandler(async (request, response) => {
    response.json(await updateRestaurantOrder(routeId(request.params.id), restaurantOrderUpdateSchema.parse(request.body), getActor(request)));
  })
);

restaurantRouter.post(
  "/orders/:id/lock",
  requirePermission("orders.manage"),
  asyncHandler(async (request, response) => {
    const input = restaurantOrderLockSchema.parse(request.body);
    response.json(await acquireRestaurantOrderLock(routeId(request.params.id), input.expectedVersion, getActor(request)));
  })
);

restaurantRouter.delete(
  "/orders/:id/lock",
  requirePermission("orders.manage"),
  asyncHandler(async (request, response) => {
    response.json(await releaseRestaurantOrderLock(routeId(request.params.id), getActor(request)));
  })
);

restaurantRouter.put(
  "/orders/:id/tables",
  requirePermission("orders.manage"),
  asyncHandler(async (request, response) => {
    response.json(await assignRestaurantOrderTables(routeId(request.params.id), restaurantOrderTableAssignmentSchema.parse(request.body), getActor(request)));
  })
);

restaurantRouter.post(
  "/orders/:id/cancel",
  requirePermission("orders.cancel"),
  asyncHandler(async (request, response) => {
    response.json(await cancelRestaurantOrder(routeId(request.params.id), restaurantOrderCancelSchema.parse(request.body), getActor(request)));
  })
);

restaurantRouter.post(
  "/orders/:id/reopen",
  requirePermission("orders.reopen"),
  asyncHandler(async (request, response) => {
    const input = restaurantOrderReopenSchema.parse(request.body);
    response.json(await reopenRestaurantOrder(routeId(request.params.id), input.expectedVersion, getActor(request)));
  })
);

restaurantRouter.post(
  "/orders/:id/undo",
  requirePermission("orders.manage"),
  asyncHandler(async (request, response) => {
    response.json(await undoRestaurantOrderItemChange(routeId(request.params.id), restaurantOrderUndoSchema.parse(request.body), getActor(request)));
  })
);

restaurantRouter.post(
  "/orders/:id/merge",
  requirePermission("orders.split-bill"),
  asyncHandler(async (request, response) => {
    response.json(await mergeRestaurantOrders(routeId(request.params.id), restaurantOrderMergeSchema.parse(request.body), getActor(request)));
  })
);

restaurantRouter.post(
  "/orders/:id/split",
  requirePermission("orders.split-bill"),
  asyncHandler(async (request, response) => {
    response.status(201).json(await splitRestaurantOrder(routeId(request.params.id), restaurantOrderSplitSchema.parse(request.body), getActor(request)));
  })
);

restaurantRouter.post(
  "/orders/:id/checkout",
  requirePermission("sales.manage"),
  asyncHandler(async (request, response) => {
    response.status(201).json(await checkoutRestaurantOrder(routeId(request.params.id), restaurantOrderCheckoutSchema.parse(request.body), getActor(request)));
  })
);
