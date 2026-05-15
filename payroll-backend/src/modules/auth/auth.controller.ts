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
    role: user.role,
  });

  return {
    ok: true,
    token,
    user,
  };
}
