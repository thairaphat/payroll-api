import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import type { Role } from "@/types/domain";
import { normalizeRole } from "@/lib/authz";

const DEFAULT_ROUTE_BY_ROLE: Record<Role, string> = {
  admin: "/dashboard",
  hr: "/employees",
  accounting: "/payroll",
  field_staff: "/field-attendance",
  viewer: "/dashboard",
};

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const ok = await login(username, password).catch(() => false);
    const user = useAuth.getState().user;

    setLoading(false);

    if (ok) {
      toast.success("Login successful");
      const role = normalizeRole(user?.role);
      nav(role ? DEFAULT_ROUTE_BY_ROLE[role] : "/dashboard");
    } else {
      toast.error("Invalid username/email or password");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#e6edff] p-6">
      <Card className="w-full max-w-md p-8 rounded-3xl border border-white/20 bg-white/95 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="h-20 w-20 rounded-2xl bg-white p-2 shadow-lg flex items-center justify-center mb-4 border border-[#dbe4f0]">
            <img
              src="/388286.jpg"
              alt="A&T World"
              className="h-full w-full object-contain"
            />
          </div>

          <h1 className="text-3xl font-bold text-[#0f172a]">
            A&T Payroll
          </h1>

          <p className="text-sm text-[#64748b] mt-1">
            A&T World · Workforce Payroll System
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-[#0f172a]">
              Username or Email
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username or email"
              required
              className="h-12 rounded-2xl border-[#dbe4f0] bg-[#f8fbff]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-[#0f172a]">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 rounded-2xl border-[#dbe4f0] bg-[#f8fbff]"
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 rounded-2xl bg-[#2563eb] hover:bg-[#1e40af] text-white shadow-lg"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 p-4 rounded-2xl bg-[#eef4ff] border border-[#dbe4f0] text-xs text-[#64748b]">
          <p className="font-semibold text-[#0f172a] mb-1">Login</p>
          <p>Use your username or email from the payroll_users account.</p>
        </div>
      </Card>
    </div>
  );
}
