import { Elysia, t } from "elysia";
import { loginController } from "./auth.controller";

export const authRoute = new Elysia({ prefix: "/auth" }).post(
  "/login",
  async ({ body, jwt, set }: any) => {
    return loginController({ body, jwt, set });
  },
  {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    }),
  }
);
