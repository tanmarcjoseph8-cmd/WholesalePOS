import { Router } from "express";
import { getActor } from "../auth/actor.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { createUser, listUsers, updateUser } from "./user.service.js";
import { userCreateSchema, userIdParamSchema, userUpdateSchema } from "./user.schemas.js";

export const userRouter = Router();

userRouter.use(requireAuth);
userRouter.use(requirePermission("users.manage"));

userRouter.get(
  "/",
  asyncHandler(async (_request, response) => {
    response.json(await listUsers());
  })
);

userRouter.post(
  "/",
  asyncHandler(async (request, response) => {
    response.status(201).json(await createUser(userCreateSchema.parse(request.body), getActor(request)));
  })
);

userRouter.patch(
  "/:id",
  asyncHandler(async (request, response) => {
    const { id } = userIdParamSchema.parse(request.params);
    response.json(await updateUser(id, userUpdateSchema.parse(request.body), getActor(request)));
  })
);
