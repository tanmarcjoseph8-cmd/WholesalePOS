import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { getActor } from "../auth/actor.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import { exportReport, getReportOverview } from "./report.service.js";
import { reportExportQuerySchema, reportQuerySchema } from "./report.schemas.js";

export const reportRouter = Router();

reportRouter.use(requireAuth);
reportRouter.use(requirePermission("sales.manage"));

reportRouter.get(
  "/overview",
  asyncHandler(async (request, response) => {
    response.json(await getReportOverview(reportQuerySchema.parse(request.query), getActor(request)));
  })
);

reportRouter.get(
  "/export",
  asyncHandler(async (request, response) => {
    response.json(await exportReport(reportExportQuerySchema.parse(request.query), getActor(request)));
  })
);
