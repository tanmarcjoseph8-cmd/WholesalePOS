import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { getActor } from "../auth/actor.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import { getSaleReceipt, requestReceiptPrint } from "./receipt.service.js";
import { receiptPrintSchema, receiptQuerySchema, saleReceiptParamSchema } from "./receipt.schemas.js";

export const receiptRouter = Router();

receiptRouter.use(requireAuth);
receiptRouter.use(requirePermission("sales.manage"));

receiptRouter.get(
  "/sales/:saleId",
  asyncHandler(async (request, response) => {
    const params = saleReceiptParamSchema.parse(request.params);
    const query = receiptQuerySchema.parse(request.query);
    response.json(await getSaleReceipt(params.saleId, getActor(request), query.paperWidth));
  })
);

receiptRouter.post(
  "/sales/:saleId/print",
  asyncHandler(async (request, response) => {
    const params = saleReceiptParamSchema.parse(request.params);
    response.status(201).json(await requestReceiptPrint(params.saleId, getActor(request), receiptPrintSchema.parse(request.body)));
  })
);
