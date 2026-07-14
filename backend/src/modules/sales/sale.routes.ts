import { Router } from "express";
import { getActor } from "../auth/actor.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { createSale, listSales } from "./sale.service.js";
import { saleCreateSchema, saleListQuerySchema } from "./sale.schemas.js";
import { refundSale, voidSale } from "./refund.service.js";
import { saleRefundSchema, saleVoidSchema } from "./refund.schemas.js";

export const saleRouter = Router();

function routeId(value: string | string[] | undefined) {
  const id = Array.isArray(value) ? value[0] : value;
  if (!id) throw new Error("Route id is required.");
  return id;
}

saleRouter.use(requireAuth);
saleRouter.use(requirePermission("sales.manage"));

saleRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    response.json(await listSales(saleListQuerySchema.parse(request.query)));
  })
);

saleRouter.post(
  "/",
  asyncHandler(async (request, response) => {
    response.status(201).json(await createSale(saleCreateSchema.parse(request.body), getActor(request)));
  })
);

saleRouter.post(
  "/:id/refunds",
  requirePermission("sales.refund"),
  asyncHandler(async (request, response) => {
    response.status(201).json(await refundSale(routeId(request.params.id), saleRefundSchema.parse(request.body), getActor(request)));
  })
);

saleRouter.post(
  "/:id/void",
  requirePermission("sales.void"),
  asyncHandler(async (request, response) => {
    response.status(201).json(await voidSale(routeId(request.params.id), saleVoidSchema.parse(request.body), getActor(request)));
  })
);
