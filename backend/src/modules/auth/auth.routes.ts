import { Router } from "express";
import { loginRateLimit } from "../../middleware/rate-limit.js";
import { validateBody } from "../../shared/validate.js";
import { loginSchema } from "./auth.schemas.js";
import { login } from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/login", loginRateLimit, validateBody(loginSchema), async (request, response, next) => {
  try {
    const result = await login(request.body, {
      ipAddress: request.ip,
      userAgent: request.get("user-agent")
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});
