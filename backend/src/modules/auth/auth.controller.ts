import type { LoginInput } from "./auth.service";
import { validateLogin } from "./auth.service";

type JwtSigner = {
  sign: (payload: Record<string, string | number | boolean | null | undefined>) => Promise<string>;
};

export async function loginController({
  body,
  jwt,
  set,
}: {
  body: LoginInput;
  jwt: JwtSigner;
  set: any;
}) {
  try {
    const user = await validateLogin(body);

    if (!user) {
      set.status = 401;
      return {
        ok: false,
        message: "Invalid username/email or password",
      };
    }

    const token = await jwt.sign({
      userId: user.id,
      username: user.username,
      email: user.email ?? null,
      role: user.role,
      roleId: user.roleId,
      companyId: user.companyId ?? null,
    });

    return {
      ok: true,
      token,
      user,
    };
  } catch (err) {
    console.error("[auth.login] Unexpected error during login:", err);
    set.status = 500;
    return {
      ok: false,
      message: "Login service unavailable. Please try again.",
    };
  }
}
