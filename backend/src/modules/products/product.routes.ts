import { Router } from "express";
import { getActor } from "../auth/actor.js";
import { requireAnyPermission, requireAuth, requirePermission } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { createProduct, deleteProduct, getProduct, importProducts, listProducts, updateProduct } from "./product.service.js";
import { productCreateSchema, productIdParamSchema, productImportSchema, productListQuerySchema, productUpdateSchema } from "./product.schemas.js";

export const productRouter = Router();

productRouter.use(requireAuth);

productRouter.get(
  "/",
  requireAnyPermission(["products.manage", "sales.manage"]),
  asyncHandler(async (request, response) => {
    const query = productListQuerySchema.parse(request.query);
    response.json(await listProducts(query));
  })
);

productRouter.post(
  "/",
  requirePermission("products.manage"),
  asyncHandler(async (request, response) => {
    const input = productCreateSchema.parse(request.body);
    response.status(201).json(await createProduct(input, getActor(request)));
  })
);

productRouter.post(
  "/import",
  requirePermission("products.manage"),
  asyncHandler(async (request, response) => {
    const input = productImportSchema.parse(request.body);
    response.status(201).json(await importProducts(input, getActor(request)));
  })
);

productRouter.get(
  "/:id",
  requireAnyPermission(["products.manage", "sales.manage"]),
  asyncHandler(async (request, response) => {
    const { id } = productIdParamSchema.parse(request.params);
    response.json(await getProduct(id));
  })
);

productRouter.patch(
  "/:id",
  requirePermission("products.manage"),
  asyncHandler(async (request, response) => {
    const { id } = productIdParamSchema.parse(request.params);
    const input = productUpdateSchema.parse(request.body);
    response.json(await updateProduct(id, input, getActor(request)));
  })
);

productRouter.delete(
  "/:id",
  requirePermission("products.manage"),
  asyncHandler(async (request, response) => {
    const { id } = productIdParamSchema.parse(request.params);
    response.json(await deleteProduct(id, getActor(request)));
  })
);
