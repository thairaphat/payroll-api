import { Elysia, t } from "elysia";
import { loginController } from "./auth.controller";
import {
  handleRateLimitedLogin,
  loginRateLimiter,
  resolveLoginClientIp,
} from "./login-rate-limit";

export const authRoute = new Elysia({ prefix: "/auth" }).post(
  "/login",
  async ({ body, jwt, set, request, server }: any) => {
    const socketAddress = server?.requestIP(request)?.address;
    const ip = resolveLoginClientIp(request, socketAddress);
    const result = await handleRateLimitedLogin({
      ip,
      limiter: loginRateLimiter,
      login: () => loginController({ body, jwt, set: {} }),
    });
    set.status = result.status;
    for (const [name, value] of Object.entries(result.headers)) {
      set.headers[name] = value;
    }
    return result.body;
  },
  {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    }),
  }
);
