import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatePanel } from "@/components/layout/StatePanel";
import { SemanticBadge } from "@/components/ui/semantic-badge";
import { getCompanies } from "@/services/employee.service";
import {
  createManagedUser,
  fetchManagedUsers,
  updateManagedUser,
  type ManagedUser,
} from "@/services/user-management.service";

const COMPANY_ROLES = ["admin", "hr", "accounting", "field_staff", "viewer"] as const;
const ROLE_LABELS: Record<CompanyRole, string> = {
  admin: "ผู้ดูแลบริษัท",
  hr: "ฝ่ายบุคคล",
  accounting: "ฝ่ายบัญชี",
  field_staff: "เจ้าหน้าที่ภาคสนาม",
  viewer: "ผู้ดูข้อมูล",
};
type CompanyRole = (typeof COMPANY_ROLES)[number];
type Company = { id: number; company_name: string };

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<CompanyRole>("hr");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<CompanyRole>("hr");
  const [editActive, setEditActive] = useState(true);

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["companies", "user-management"],
    queryFn: getCompanies,
  });
  const { data: users = [], isLoading, isError } = useQuery({
    queryKey: ["admin-users", companyId],
    queryFn: () => fetchManagedUsers(Number(companyId)),
    enabled: Boolean(companyId),
  });

  const filteredUsers = useMemo(() => users.filter((user) => {
    if (roleFilter !== "all" && user.role !== roleFilter) return false;
    if (activeFilter === "active" && !user.isActive) return false;
    if (activeFilter === "inactive" && user.isActive) return false;
    return true;
  }), [users, roleFilter, activeFilter]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-users", companyId] });
  const createMutation = useMutation({
    mutationFn: () => createManagedUser({ username, email, password, role, companyId: Number(companyId) }),
    onSuccess: async () => {
      await refresh();
      setCreateOpen(false);
      setUsername(""); setEmail(""); setPassword(""); setRole("hr");
      toast.success("สร้างผู้ใช้งานสำเร็จ");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateMutation = useMutation({
    mutationFn: () => updateManagedUser(editing!.id, {
      email: editEmail,
      role: editRole,
      companyId: Number(companyId),
      isActive: editActive,
      ...(editPassword ? { password: editPassword } : {}),
    }),
    onSuccess: async () => {
      await refresh();
      setEditing(null); setEditPassword("");
      toast.success("บันทึกข้อมูลผู้ใช้งานสำเร็จ");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openEdit = (user: ManagedUser) => {
    setEditing(user);
    setEditEmail(user.email ?? "");
    setEditRole(user.role as CompanyRole);
    setEditActive(user.isActive);
    setEditPassword("");
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="จัดการผู้ใช้งาน"
        description="จัดการบัญชีและสิทธิ์ผู้ใช้งานแยกตามบริษัท"
        icon={UserCog}
        actions={<Button disabled={!companyId} onClick={() => setCreateOpen(true)}><Plus />เพิ่มผู้ใช้งาน</Button>}
      />

      <Card className="soft-panel grid gap-4 md:grid-cols-3">
        <div><Label htmlFor="users-company">บริษัท</Label><select id="users-company" value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="field-control mt-2"><option value="">เลือกบริษัท</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}</select></div>
        <div><Label htmlFor="users-role">สิทธิ์ผู้ใช้งาน</Label><select id="users-role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="field-control mt-2"><option value="all">ทุกสิทธิ์</option>{COMPANY_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></div>
        <div><Label htmlFor="users-active">สถานะ</Label><select id="users-active" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} className="field-control mt-2"><option value="all">ทุกสถานะ</option><option value="active">ใช้งาน</option><option value="inactive">ระงับใช้งาน</option></select></div>
      </Card>

      {!companyId ? <StatePanel kind="empty" title="กรุณาเลือกบริษัท" message="เลือกบริษัทเพื่อดูและจัดการบัญชีผู้ใช้งาน" />
        : isError ? <StatePanel kind="error" title="โหลดผู้ใช้งานไม่สำเร็จ" message="กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่" />
        : isLoading ? <StatePanel kind="loading" title="กำลังโหลดผู้ใช้งาน" />
        : filteredUsers.length === 0 ? <StatePanel kind="empty" title="ไม่พบผู้ใช้งาน" message="ไม่พบบัญชีที่ตรงกับตัวกรองปัจจุบัน" />
        : <>
          <div className="grid gap-3 md:hidden">
            {filteredUsers.map((user) => (
              <Card key={user.id} className="surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-foreground">{user.username}</p>
                    <p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <SemanticBadge tone={user.isActive ? "success" : "neutral"}>{user.isActive ? "ใช้งาน" : "ระงับใช้งาน"}</SemanticBadge>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <span className="whitespace-nowrap rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200">{ROLE_LABELS[user.role as CompanyRole] ?? user.role}</span>
                  <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    จัดการ
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <Card className="surface-card hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead><tr><th>ชื่อผู้ใช้</th><th>อีเมล</th><th>สิทธิ์</th><th>สถานะ</th><th className="text-right">จัดการ</th></tr></thead>
              <tbody>{filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="font-semibold">{user.username}</td>
                  <td>{user.email}</td>
                  <td><span className="whitespace-nowrap rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200">{ROLE_LABELS[user.role as CompanyRole] ?? user.role}</span></td>
                  <td><SemanticBadge tone={user.isActive ? "success" : "neutral"}>{user.isActive ? "ใช้งาน" : "ระงับใช้งาน"}</SemanticBadge></td>
                  <td className="text-right"><Button variant="outline" size="sm" onClick={() => openEdit(user)}><ShieldCheck className="mr-2 h-4 w-4" />จัดการ</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        </>}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>เพิ่มผู้ใช้งานบริษัท</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>ชื่อผู้ใช้</Label><Input value={username} onChange={(event) => setUsername(event.target.value)} /></div><div><Label>อีเมล</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div><Label>รหัสผ่าน</Label><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /><p className="mt-1 text-xs text-slate-500">อย่างน้อย 12 ตัวอักษร พร้อมตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ</p></div><div><Label>สิทธิ์ผู้ใช้งาน</Label><select value={role} onChange={(event) => setRole(event.target.value as CompanyRole)} className="field-control mt-2">{COMPANY_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></div><Button className="w-full" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>สร้างผู้ใช้งาน</Button></div></DialogContent></Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>จัดการ {editing?.username}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>อีเมล</Label><Input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} /></div><div><Label>สิทธิ์ผู้ใช้งาน</Label><select value={editRole} onChange={(event) => setEditRole(event.target.value as CompanyRole)} className="field-control mt-2">{COMPANY_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></div><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={editActive} onChange={(event) => setEditActive(event.target.checked)} />เปิดใช้งานบัญชี</label><div><Label>รหัสผ่านใหม่ (ไม่บังคับ)</Label><div className="relative"><KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input className="pl-9" type="password" autoComplete="new-password" value={editPassword} onChange={(event) => setEditPassword(event.target.value)} /></div></div><Button className="w-full" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>บันทึกการเปลี่ยนแปลง</Button></div></DialogContent></Dialog>
    </div>
  );
}
