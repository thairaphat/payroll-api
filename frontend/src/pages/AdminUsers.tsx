import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCompanies } from "@/services/employee.service";
import {
  createManagedUser,
  fetchManagedUsers,
  updateManagedUser,
  type ManagedUser,
} from "@/services/user-management.service";

const COMPANY_ROLES = ["admin", "hr", "accounting", "field_staff", "viewer"] as const;
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
      toast.success("User created successfully");
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
      toast.success("User updated successfully");
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
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900"><UserCog className="text-blue-700" />User Management</h1>
          <p className="mt-1 text-slate-500">Manage company-scoped accounts without exposing credentials.</p>
        </div>
        <Button disabled={!companyId} onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Create user</Button>
      </header>

      <Card className="grid gap-4 p-5 md:grid-cols-3">
        <div><Label htmlFor="users-company">Company</Label><select id="users-company" value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border px-3"><option value="">Select a company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}</select></div>
        <div><Label htmlFor="users-role">Role</Label><select id="users-role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="mt-2 h-11 w-full rounded-xl border px-3"><option value="all">All roles</option>{COMPANY_ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div><Label htmlFor="users-active">Status</Label><select id="users-active" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} className="mt-2 h-11 w-full rounded-xl border px-3"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      </Card>

      {!companyId ? <Card className="p-8 text-center text-slate-500">Select a company to view its users.</Card>
        : isError ? <Card className="border-red-200 bg-red-50 p-6 text-red-700">Unable to load users. Please try again.</Card>
        : isLoading ? <p className="text-slate-500">Loading users...</p>
        : filteredUsers.length === 0 ? <Card className="p-8 text-center text-slate-500">No users found for this company.</Card>
        : <Card className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-4">Username</th><th className="p-4">Email</th><th className="p-4">Role</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id} className="border-t"><td className="p-4 font-semibold">{user.username}</td><td className="p-4">{user.email}</td><td className="p-4"><span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{user.role}</span></td><td className="p-4">{user.isActive ? "Active" : "Inactive"}</td><td className="p-4 text-right"><Button variant="outline" size="sm" onClick={() => openEdit(user)}><ShieldCheck className="mr-2 h-4 w-4" />Manage</Button></td></tr>)}</tbody></table></Card>}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Create company user</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Username</Label><Input value={username} onChange={(event) => setUsername(event.target.value)} /></div><div><Label>Email</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div><Label>Password</Label><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /><p className="mt-1 text-xs text-slate-500">12+ characters with uppercase, lowercase, number and special character.</p></div><div><Label>Role</Label><select value={role} onChange={(event) => setRole(event.target.value as CompanyRole)} className="mt-2 h-10 w-full rounded-md border px-3">{COMPANY_ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div><Button className="w-full" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>Create user</Button></div></DialogContent></Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>Manage {editing?.username}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Email</Label><Input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} /></div><div><Label>Role</Label><select value={editRole} onChange={(event) => setEditRole(event.target.value as CompanyRole)} className="mt-2 h-10 w-full rounded-md border px-3">{COMPANY_ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editActive} onChange={(event) => setEditActive(event.target.checked)} />Account active</label><div><Label>New password (optional)</Label><div className="relative"><KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" type="password" autoComplete="new-password" value={editPassword} onChange={(event) => setEditPassword(event.target.value)} /></div></div><Button className="w-full" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>Save changes</Button></div></DialogContent></Dialog>
    </div>
  );
}
