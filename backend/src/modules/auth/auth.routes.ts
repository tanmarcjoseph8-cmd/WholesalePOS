import { Router } from "express";
import { loginRateLimit } from "../../middleware/rate-limit.js";
import { validateBody } from "../../shared/validate.js";
import { getRequestAuth, requireAuth } from "./auth.middleware.js";
import { loginSchema, logoutSchema, refreshTokenSchema, setupOwnerSchema } from "./auth.schemas.js";
import { getCurrentUser, getSetupStatus, login, logout, refreshSession, setupOwner } from "./auth.service.js";

export const authRouter = Router();

authRouter.get("/setup", async (_request, response, next) => {
  try {
    response.json(await getSetupStatus());
  } catch (error) {
    next(error);
  }
});

authRouter.post("/setup", loginRateLimit, validateBody(setupOwnerSchema), async (request, response, next) => {
  try {
    response.status(201).json(
      await setupOwner(request.body, {
        ipAddress: request.ip,
        userAgent: request.get("user-agent")
      })
    );
  } catch (error) {
    next(error);
  }
});

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

authRouter.post("/refresh", validateBody(refreshTokenSchema), async (request, response, next) => {
  try {
    const result = await refreshSession(request.body, {
      ipAddress: request.ip,
      userAgent: request.get("user-agent")
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", validateBody(logoutSchema), async (request, response, next) => {
  try {
    const result = await logout(request.body, {
      ipAddress: request.ip,
      userAgent: request.get("user-agent")
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, async (request, response, next) => {
  try {
    const auth = getRequestAuth(request);
    if (!auth) {
      response.status(401).json({ error: "AUTHENTICATION_REQUIRED", message: "Authentication is required." });
      return;
    }

    response.json(await getCurrentUser(auth.userId));
  } catch (error) {
    next(error);
  }
});
