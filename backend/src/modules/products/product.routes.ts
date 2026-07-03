import { Router } from "express";
import { getActor } from "../auth/actor.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from "./product.service.js";
import { productCreateSchema, productIdParamSchema, productListQuerySchema, productUpdateSchema } from "./product.schemas.js";

export const productRouter = Router();

productRouter.use(requireAuth);

productRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const query = productListQuerySchema.parse(request.query);
    response.json(await listProducts(query));
  })
);

productRouter.post(
  "/",
  asyncHandler(async (request, response) => {
    const input = productCreateSchema.parse(request.body);
    response.status(201).json(await createProduct(input, getActor(request)));
  })
);

productRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const { id } = productIdParamSchema.parse(request.params);
    response.json(await getProduct(id));
  })
);

productRouter.patch(
  "/:id",
  asyncHandler(async (request, response) => {
    const { id } = productIdParamSchema.parse(request.params);
    const input = productUpdateSchema.parse(request.body);
    response.json(await updateProduct(id, input, getActor(request)));
  })
);

productRouter.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    const { id } = productIdParamSchema.parse(request.params);
    response.json(await deleteProduct(id, getActor(request)));
  })
);
