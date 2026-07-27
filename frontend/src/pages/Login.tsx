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
  cyd_admin: "/admin/companies",
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
      toast.success("เข้าสู่ระบบสำเร็จ");
      const role = normalizeRole(user?.role);
      nav(role ? DEFAULT_ROUTE_BY_ROLE[role] : "/dashboard");
    } else {
      toast.error("ชื่อผู้ใช้ อีเมล หรือรหัสผ่านไม่ถูกต้อง");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#F0FDFA_0%,#EFF6FF_55%,#F8FAFC_100%)] p-4 dark:bg-background sm:p-6">
      <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(135deg,#0D9488,#0891B2,#2563EB)]" aria-hidden="true" />
      <div className="relative flex min-h-[calc(100vh-2rem)] items-center justify-center sm:min-h-[calc(100vh-3rem)]">
      <Card className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-2xl sm:p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-[#D9E7EA] bg-white p-2 shadow-lg">
            <img
              src="/388286.jpg"
              alt="A&T World"
              className="h-full w-full object-contain"
            />
          </div>

          <h1 className="text-3xl font-bold text-foreground">
            ระบบเงินเดือน A&T
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            ระบบบริหารบุคลากรและเงินเดือน
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-foreground">
              ชื่อผู้ใช้หรืออีเมล
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="กรอกชื่อผู้ใช้หรืออีเมล"
              required
              className="h-12 rounded-2xl bg-muted"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">
              รหัสผ่าน
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 rounded-2xl bg-muted"
            />
          </div>

          <Button
            type="submit"
            className="h-12 w-full rounded-2xl text-white shadow-lg"
            disabled={loading}
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
        </form>

        <div className="mt-6 rounded-2xl border border-teal-100 bg-teal-50 p-4 text-xs text-slate-600 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-100">
          <p className="mb-1 font-semibold text-slate-950 dark:text-white">การเข้าสู่ระบบ</p>
          <p>ใช้ชื่อผู้ใช้หรืออีเมลที่ได้รับจากผู้ดูแลระบบ</p>
        </div>
      </Card>
      </div>
    </div>
  );
}
