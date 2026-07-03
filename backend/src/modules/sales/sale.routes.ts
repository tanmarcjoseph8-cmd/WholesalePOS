import { Router } from "express";
import { getActor } from "../auth/actor.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { createSale, listSales } from "./sale.service.js";
import { saleCreateSchema, saleListQuerySchema } from "./sale.schemas.js";

export const saleRouter = Router();

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
