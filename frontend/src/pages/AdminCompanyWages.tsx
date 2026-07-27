import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Loader2, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatePanel } from "@/components/layout/StatePanel";
import { SemanticBadge } from "@/components/ui/semantic-badge";
import {
  type CompanyWageInput,
  type CompanyWageRow,
  createCompanyWage,
  fetchCompanyWages,
  updateCompanyWage,
} from "@/services/company-wage.service";

const DEFAULT_FORM: CompanyWageInput = {
  dailyWage: "",
  workHoursPerDay: "8",
  ot1Multiplier: "1",
  ot15Multiplier: "1.5",
  ot2Multiplier: "2",
  ot3Multiplier: "3",
  isActive: true,
};
type WageFilter = "all" | "configured" | "missing" | "inactive";
type FormErrors = Partial<Record<keyof CompanyWageInput, string>>;

function validate(form: CompanyWageInput): FormErrors {
  const errors: FormErrors = {};
  const positive = (key: Exclude<keyof CompanyWageInput, "isActive">, max?: number) => {
    const value = Number(form[key]);
    if (!form[key].trim() || !Number.isFinite(value) || value <= 0 || (max && value > max)) {
      errors[key] = "กรุณาระบุจำนวนที่มากกว่า 0";
    }
  };
  positive("dailyWage");
  positive("workHoursPerDay", 24);
  positive("ot1Multiplier");
  positive("ot15Multiplier");
  positive("ot2Multiplier");
  positive("ot3Multiplier");
  return errors;
}

function WageField(props: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input id={props.id} type="number" min="0" step="0.01" value={props.value}
        onChange={(event) => props.onChange(event.target.value)} aria-invalid={Boolean(props.error)} />
      {props.error && <p className="text-xs text-red-600">{props.error}</p>}
    </div>
  );
}

export default function AdminCompanyWages() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<WageFilter>("all");
  const [selected, setSelected] = useState<CompanyWageRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CompanyWageInput>(DEFAULT_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const query = useQuery({ queryKey: ["company-wages"], queryFn: fetchCompanyWages });

  useEffect(() => {
    if (!open || !selected) return;
    const config = selected.wageConfig;
    setForm(config ? {
      dailyWage: config.dailyWage,
      workHoursPerDay: config.workHoursPerDay,
      ot1Multiplier: config.ot1Multiplier,
      ot15Multiplier: config.ot15Multiplier,
      ot2Multiplier: config.ot2Multiplier,
      ot3Multiplier: config.ot3Multiplier,
      isActive: config.isActive,
    } : { ...DEFAULT_FORM });
    setErrors({});
  }, [open, selected]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data ?? []).filter((row) => {
      const found = !needle || row.companyName.toLowerCase().includes(needle) ||
        String(row.companyId).includes(needle);
      const status = filter === "all" ||
        (filter === "configured" && row.wageConfig !== null) ||
        (filter === "missing" && row.wageConfig === null) ||
        (filter === "inactive" && row.wageConfig?.isActive === false);
      return found && status;
    });
  }, [filter, query.data, search]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Company is required");
      return selected.wageConfig
        ? updateCompanyWage(selected.companyId, form)
        : createCompanyWage(selected.companyId, form);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-wages"] });
      toast.success("บันทึกค่าจ้างบริษัทเรียบร้อยแล้ว");
      setOpen(false);
      setSelected(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = () => {
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0 && !mutation.isPending) mutation.mutate();
  };
  const hourlyPreview = Number(form.dailyWage) > 0 && Number(form.workHoursPerDay) > 0
    ? (Number(form.dailyWage) / Number(form.workHoursPerDay)).toLocaleString("th-TH", {
        minimumFractionDigits: 2, maximumFractionDigits: 4,
      })
    : "—";
  const setField = (key: keyof CompanyWageInput, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="page-shell">
      <PageHeader
        title="ค่าจ้างรายบริษัท"
        description="กำหนดค่าจ้างและตัวคูณ OT แยกตามบริษัท"
        icon={Banknote}
      />

      <Card className="soft-panel">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input aria-label="ค้นหาบริษัท" className="pl-9" placeholder="ค้นหาชื่อหรือรหัสบริษัท"
              value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <select aria-label="กรองสถานะค่าจ้าง" className="field-control"
            value={filter} onChange={(event) => setFilter(event.target.value as WageFilter)}>
            <option value="all">ทั้งหมด</option><option value="configured">ตั้งค่าแล้ว</option>
            <option value="missing">ยังไม่ตั้งค่า</option><option value="inactive">ปิดใช้งาน</option>
          </select>
        </div>
      </Card>

      {query.isLoading ? (
        <StatePanel kind="loading" title="กำลังโหลดข้อมูลค่าจ้าง" />
      ) : query.isError ? (
        <StatePanel kind="error" title="โหลดข้อมูลค่าจ้างไม่สำเร็จ"
          message="กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่"
          action={<Button variant="outline" onClick={() => query.refetch()}>ลองใหม่</Button>} />
      ) : rows.length === 0 ? (
        <StatePanel kind="empty" title="ไม่พบข้อมูลบริษัท" message="ลองปรับคำค้นหาหรือตัวกรองสถานะ" />
      ) : (
        <Card className="surface-card overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead><tr>
              <th className="p-4">บริษัท</th><th className="p-4">ค่าจ้าง/วัน</th>
              <th className="p-4">ชั่วโมง/วัน</th><th className="p-4">OT 1 / 1.5 / 2 / 3</th>
              <th className="p-4">สถานะ</th><th className="p-4">แก้ไขล่าสุด</th>
              <th className="p-4 text-right">จัดการ</th>
            </tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.companyId} className="border-t">
                <td className="p-4"><div className="font-semibold">{row.companyName}</div>
                  <div className="text-xs text-slate-500">ID {row.companyId}</div></td>
                <td className="p-4">{row.wageConfig?.dailyWage ?? "—"}</td>
                <td className="p-4">{row.wageConfig?.workHoursPerDay ?? "—"}</td>
                <td className="p-4">{row.wageConfig ? [
                  row.wageConfig.ot1Multiplier, row.wageConfig.ot15Multiplier,
                  row.wageConfig.ot2Multiplier, row.wageConfig.ot3Multiplier,
                ].join(" / ") : "—"}</td>
                <td className="p-4">{!row.wageConfig ? <SemanticBadge tone="neutral">ยังไม่ตั้งค่า</SemanticBadge>
                  : row.wageConfig.isActive ? <SemanticBadge tone="success">ใช้งาน</SemanticBadge>
                  : <SemanticBadge tone="danger">ปิดใช้งาน</SemanticBadge>}</td>
                <td className="p-4">{row.wageConfig
                  ? new Date(row.wageConfig.updatedAt).toLocaleString("th-TH") : "—"}</td>
                <td className="p-4 text-right"><Button size="sm" variant={row.wageConfig ? "outline" : "default"}
                  onClick={() => { setSelected(row); setOpen(true); }}>
                  {row.wageConfig ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {row.wageConfig ? "แก้ไข" : "เพิ่ม"}</Button></td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) setOpen(next); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{selected?.wageConfig ? "แก้ไขค่าจ้างบริษัท" : "เพิ่มค่าจ้างบริษัท"}</DialogTitle>
            <DialogDescription>ค่าทศนิยมจะถูกส่งเป็นข้อความเพื่อรักษาความแม่นยำ</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>บริษัท</Label>
              <Input readOnly value={selected ? `${selected.companyName} (ID ${selected.companyId})` : ""} /></div>
            <WageField id="daily-wage" label="ค่าจ้างต่อวัน" value={form.dailyWage} error={errors.dailyWage} onChange={(v) => setField("dailyWage", v)} />
            <WageField id="work-hours" label="ชั่วโมงทำงานต่อวัน" value={form.workHoursPerDay} error={errors.workHoursPerDay} onChange={(v) => setField("workHoursPerDay", v)} />
            <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">ค่าแรงต่อชั่วโมงโดยประมาณ<div className="mt-1 text-lg font-bold">{hourlyPreview}</div></div>
            <WageField id="ot1" label="ตัวคูณ OT 1" value={form.ot1Multiplier} error={errors.ot1Multiplier} onChange={(v) => setField("ot1Multiplier", v)} />
            <WageField id="ot15" label="ตัวคูณ OT 1.5" value={form.ot15Multiplier} error={errors.ot15Multiplier} onChange={(v) => setField("ot15Multiplier", v)} />
            <WageField id="ot2" label="ตัวคูณ OT 2" value={form.ot2Multiplier} error={errors.ot2Multiplier} onChange={(v) => setField("ot2Multiplier", v)} />
            <WageField id="ot3" label="ตัวคูณ OT 3" value={form.ot3Multiplier} error={errors.ot3Multiplier} onChange={(v) => setField("ot3Multiplier", v)} />
            <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <Label htmlFor="wage-active">เปิดใช้งานค่าจ้างนี้</Label>
              <Switch id="wage-active" checked={form.isActive} onCheckedChange={(v) => setField("isActive", v)} />
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>ยกเลิก</Button>
            <Button onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
