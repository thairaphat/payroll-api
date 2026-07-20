import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Search,
  Clock,
  RotateCcw,
  Loader2,
  CheckCircle2,
  UserCheck,
  Building2,
  Info,
  ChevronDown,
  LayoutGrid,
  List,
  Eraser
} from "lucide-react";
import { format, subDays } from "date-fns";
import { getFieldAttendance, saveFieldAttendance, getCompanies } from "@/services/field-attendance.service";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/authz";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const OT_TYPE_OPTIONS = [
  { label: "OT 1", field: "ot1" },
  { label: "OT 1.5", field: "ot15" },
  // TODO: Add real ot3 storage in DB/backend; temporarily maps OT 3 to ot2.
  { label: "OT 3", field: "ot2" },
];

export default function FieldAttendanceEntry() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  // Local state for OT Entry inputs (per employee_code)
  const [otInputs, setOtInputs] = useState<Record<string, { type: string, hours: string }>>({});

  useEffect(() => {
    fetchRecords();
  }, [date]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [empRes, companyData] = await Promise.all([
        authFetch(`${API_URL}/employees`),
        getCompanies()
      ]);
      
      if (empRes.ok) {
        const json = await empRes.json();
        setAllEmployees(json.data || []);
      }
      setCompanies(companyData);
    } catch (error) {
      console.error("Failed to load initial data", error);
    }
  };

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const data = await getFieldAttendance(date);
      setRecords(normalizeRecords(data));
    } catch (error) {
      toast.error("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  // Safe string coercion — guards against null/undefined fields from incomplete DB records.
  const safeStr = (v: any): string => (v === null || v === undefined ? "" : String(v));

  const createRecordObject = (emp: any) => {
    const employeeCode = safeStr(emp?.emp_code) || safeStr(emp?.employee_code);
    const firstName = safeStr(emp?.first_name);
    const lastName = safeStr(emp?.last_name);

    return {
      employee_code: employeeCode,
      employee_code_13: safeStr(emp?.employee_code_13),
      first_name: firstName,
      last_name: lastName,
      employee_name: `${firstName} ${lastName}`.trim(),
      branch_code: safeStr(emp?.branch_code),
      start_time: "08:00",
      work_time: "08:00-17:00",
      ot1: 0,
      ot15: 0,
      ot2: 0,
      half_day: false,
      leave_day: false,
      work_type_2: "",
      note: ""
    };
  };

  // Normalize records arriving from the API/DB so every string/number/boolean field
  // is guaranteed safe — prevents undefined.slice() crashes and controlled-input warnings.
  const normalizeRecord = (r: any) => ({
    ...r,
    employee_code: safeStr(r?.employee_code) || safeStr(r?.emp_code),
    employee_code_13: safeStr(r?.employee_code_13),
    first_name: safeStr(r?.first_name),
    last_name: safeStr(r?.last_name),
    employee_name:
      safeStr(r?.employee_name) ||
      `${safeStr(r?.first_name)} ${safeStr(r?.last_name)}`.trim(),
    branch_code: safeStr(r?.branch_code),
    start_time: safeStr(r?.start_time) || "08:00",
    work_time: safeStr(r?.work_time) || "08:00-17:00",
    work_type_2: safeStr(r?.work_type_2),
    note: safeStr(r?.note),
    ot1: Number(r?.ot1 ?? 0) || 0,
    ot15: Number(r?.ot15 ?? 0) || 0,
    ot2: Number(r?.ot2 ?? 0) || 0,
    half_day: Boolean(r?.half_day),
    leave_day: Boolean(r?.leave_day),
  });

  const normalizeRecords = (data: any): any[] =>
    Array.isArray(data) ? data.map(normalizeRecord) : [];

  const handleAddEmployee = (emp: any) => {
    if (records.find(r => r.employee_code === (emp.emp_code || emp.employee_code))) {
      toast.warning("พนักงานคนนี้อยู่ในรายการแล้ว");
      return;
    }
    setRecords(prev => [...prev, createRecordObject(emp)]);
    setSearch("");
    setIsSearching(false);
  };

  const handleBulkAddByCompany = () => {
    if (!selectedCompany) return;
    const companyEmployees = allEmployees.filter(e => e.company_name === selectedCompany);
    const newRecords = companyEmployees
      .filter(emp => !records.find(r => r.employee_code === emp.emp_code))
      .map(createRecordObject);
    
    if (newRecords.length === 0) {
      toast.info("พนักงานบริษัทนี้มีในรายการครบแล้ว");
    } else {
      setRecords(prev => [...prev, ...newRecords]);
      toast.success(`เพิ่มพนักงาน ${newRecords.length} คน จาก ${selectedCompany}`);
    }
    setSelectedCompany("");
  };

  const handleRemoveRecord = (index: number) => {
    setRecords(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateRecord = (index: number, field: string, value: any) => {
    const updated = [...records];
    updated[index] = { ...updated[index], [field]: value };

    if (field === "half_day" && value === true) updated[index].leave_day = false;
    if (field === "leave_day" && value === true) updated[index].half_day = false;

    setRecords(updated);
  };

  const handleAddOT = (index: number) => {
    const empCode = records[index].employee_code;
    const input = otInputs[empCode] || { type: "ot1", hours: "" };
    const hours = parseFloat(input.hours);

    if (isNaN(hours) || hours <= 0) {
      toast.error("กรุณากรอกจำนวนชั่วโมงให้ถูกต้อง");
      return;
    }

    const field = input.type;
    const currentVal = Number(records[index][field] || 0);
    handleUpdateRecord(index, field, currentVal + hours);

    setOtInputs(prev => ({
      ...prev,
      [empCode]: { ...input, hours: "" }
    }));

    const label = OT_TYPE_OPTIONS.find(o => o.field === field)?.label;
    toast.success(`บวกเพิ่ม ${label} จำนวน ${hours} ชม. แล้ว`);
  };

  const handleClearOT = (index: number) => {
    const updated = [...records];
    updated[index].ot1 = 0;
    updated[index].ot15 = 0;
    updated[index].ot2 = 0;
    setRecords(updated);
    toast.info(`ล้างข้อมูล OT ของ ${updated[index].employee_name} แล้ว`);
  };

  const handleQuickAction = (type: "present" | "clear_ot" | "prev_day") => {
    if (type === "present") {
      setRecords(prev => prev.map(r => ({ ...r, leave_day: false })));
      toast.success("ทำเครื่องหมายมาทำงานทุกคนแล้ว");
    } else if (type === "clear_ot") {
      setRecords(prev => prev.map(r => ({ ...r, ot1: 0, ot15: 0, ot2: 0 })));
      toast.success("ล้าง OT ทั้งหมดแล้ว");
    } else if (type === "prev_day") {
      const prevDate = format(subDays(new Date(date), 1), "yyyy-MM-dd");
      toast.promise(getFieldAttendance(prevDate), {
        loading: "กำลังดึงข้อมูลวันก่อนหน้า...",
        success: (data) => {
          if (!Array.isArray(data) || data.length === 0) return "ไม่พบข้อมูลวันก่อนหน้า";
          setRecords(normalizeRecords(data).map((r: any) => ({ ...r, id: undefined, work_date: date })));
          return `คัดลอกข้อมูลจากวันที่ ${prevDate} สำเร็จ`;
        },
        error: "โหลดข้อมูลล้มเหลว"
      });
    }
  };

  const validateRecords = () => {
    for (const r of records) {
      if (!r.employee_code) return "พบรายการที่ไม่มีรหัสพนักงาน";
      if (r.half_day && r.leave_day) return `พนักงาน ${r.employee_name} ไม่สามารถเลือกทั้ง 'ครึ่งวัน' และ 'ลา/ขาด' พร้อมกันได้`;
    }
    return null;
  };

  const handleSave = async () => {
    const error = validateRecords();
    if (error) {
      toast.error(error);
      return;
    }

    try {
      setSaving(true);
      await saveFieldAttendance(date, records);
      toast.success("บันทึกข้อมูลหน้างานสำเร็จ");
    } catch (error) {
      toast.error("บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = search.length >= 2 
    ? Array.from(new Map(allEmployees
        .filter(emp => emp.first_name?.toLowerCase().includes(search.toLowerCase()) || emp.emp_code?.toLowerCase().includes(search.toLowerCase()))
        .map(e => [e.emp_code || e.employee_code, e])).values()
      ).slice(0, 8)
    : [];

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {/* --- HEADER --- */}
        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-3xl bg-[#1e3a8a] shadow-lg shadow-blue-200 flex items-center justify-center shrink-0">
              <UserCheck className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">บันทึกหน้างาน</h1>
              <div className="flex items-center gap-2 mt-1 text-slate-500 text-sm font-medium">
                <Building2 className="h-4 w-4" />
                <span>Field Entry Assistant</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-2xl border border-[#e5e7eb] shadow-sm">
              <CalendarIcon className="h-5 w-5 text-[#1e3a8a]" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border-none bg-transparent text-sm font-bold text-slate-700 outline-none"
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || loading || records.length === 0}
              className="rounded-2xl bg-[#1e3a8a] hover:bg-[#162a64] text-white shadow-lg h-11 px-6 font-bold transition-all hover:-translate-y-0.5 active:scale-95"
            >
              {saving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Save className="h-5 w-5 mr-2" />}
              บันทึก {records.length > 0 && `(${records.length})`}
            </Button>
          </div>
        </header>

        {/* --- QUICK ACTIONS --- */}
        {/* <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-[#e5e7eb] border-l-4 border-l-[#1e3a8a] shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2">Quick Actions:</span>
          <Button variant="outline" size="sm" onClick={() => handleQuickAction("present")} className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-semibold shadow-sm">
            <CheckCircle2 className="h-4 w-4 mr-2" /> มาทุกคน
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickAction("clear_ot")} className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50 font-semibold shadow-sm">
            <Clock className="h-4 w-4 mr-2" /> ล้าง OT ทั้งหมด
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickAction("prev_day")} className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 font-semibold shadow-sm">
            <RotateCcw className="h-4 w-4 mr-2" /> คัดลอกเมื่อวาน
          </Button>
          <div className="ml-auto hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
             <Button variant={viewMode === "table" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("table")} className="rounded-lg h-8 px-3">
               <List className="h-4 w-4" />
             </Button>
             <Button variant={viewMode === "card" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("card")} className="rounded-lg h-8 px-3">
               <LayoutGrid className="h-4 w-4" />
             </Button>
          </div>
        </div> */}

        {/* --- ADD CONTROLS --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <Input
                placeholder="ค้นหาชื่อหรือรหัสพนักงาน..."
                value={search}
                onChange={(e) => {setSearch(e.target.value); setIsSearching(true);}}
                onFocus={() => setIsSearching(true)}
                className="pl-12 h-14 rounded-2xl border-slate-200 bg-white shadow-sm font-medium text-slate-700 focus:ring-blue-500"
              />
              {isSearching && filteredEmployees.length > 0 && (
                <Card className="absolute z-50 w-full mt-2 rounded-2xl shadow-2xl border-slate-200 overflow-hidden ring-4 ring-black/5 animate-in fade-in zoom-in-95">
                  <div className="max-h-80 overflow-y-auto">
                    {filteredEmployees.map((emp) => (
                      <div
                        key={emp.emp_code}
                        onClick={() => handleAddEmployee(emp)}
                        className="p-4 hover:bg-blue-50 cursor-pointer flex items-center justify-between border-b border-slate-50 last:border-0 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-black text-sm">
                            {emp.first_name?.[0] ?? "?"}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{emp.first_name} {emp.last_name}</p>
                            <p className="text-xs font-bold text-slate-400">{emp.emp_code}</p>
                          </div>
                        </div>
                        <Plus className="h-5 w-5 text-blue-600" />
                      </div>
                    ))}
                  </div>
                </Card>
              )}
           </div>

           {/* <div className="flex gap-2">
             <div className="relative flex-1">
               <select
                 value={selectedCompany}
                 onChange={(e) => setSelectedCompany(e.target.value)}
                 className="w-full h-14 pl-12 pr-10 rounded-2xl border border-slate-200 bg-white shadow-sm appearance-none font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
               >
                 <option value="">เลือกบริษัท...</option>
                 {companies.map(c => <option key={c.id} value={c.company_name || c.name}>{c.company_name || c.name}</option>)}
               </select>
               <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
               <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
             </div>
             <Button 
               onClick={handleBulkAddByCompany}
               disabled={!selectedCompany}
               className="h-14 px-6 rounded-2xl bg-slate-900 text-white hover:bg-black font-bold shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5"
             >
               เพิ่มทั้งหมดจากบริษัท
             </Button>
           </div> */}
        </div>

        {/* --- MAIN ENTRY AREA --- */}
        {viewMode === "table" ? (
          <Card className="rounded-[2rem] border-none bg-white shadow-[0_20px_50px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1300px]">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr>
                    <th className="py-5 px-6 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">พนักงาน</th>
                    <th className="py-5 px-2 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest w-24">เริ่มงาน</th>
                    <th className="py-5 px-2 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest w-32">เวลาทำงาน</th>
                    <th className="py-5 px-2 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest w-64">เพิ่ม OT</th>
                    <th className="py-5 px-2 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest w-16">ครึ่ง</th>
                    <th className="py-5 px-2 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest w-16">ลา</th>
                    <th className="py-5 px-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">หมายเหตุ</th>
                    <th className="py-5 px-4 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={8} className="py-20 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-blue-600 opacity-20" /></td></tr>
                  ) : records.length === 0 ? (
                    <tr><td colSpan={8} className="py-20 text-center text-slate-400 font-medium">ยังไม่มีรายการข้อมูล กรุณาเลือกพนักงานหรือบริษัทเพื่อเริ่มบันทึก</td></tr>
                  ) : (
                    records.map((row, index) => {
                      const otInput = otInputs[row.employee_code] || { type: "ot1", hours: "" };
                      const isLeave = Boolean(row.leave_day);

                      return (
                        <tr key={row.employee_code} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center font-bold text-xs shadow-sm", row.leave_day ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>
                                {String(row?.employee_code ?? "").slice(-3) || "—"}
                              </div>
                              <div className="max-w-[200px]">
                                <p className="font-black text-slate-800 truncate leading-none mb-1 text-sm">{row.employee_name}</p>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{row.employee_code}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-1"><Input value={row.start_time} onChange={(e) => handleUpdateRecord(index, "start_time", e.target.value)} className="h-10 rounded-xl border-slate-200 text-center font-medium" /></td>
                          <td className="py-2 px-1"><Input value={row.work_time} onChange={(e) => handleUpdateRecord(index, "work_time", e.target.value)} className="h-10 rounded-xl border-slate-200 text-center font-medium" /></td>
                          
                          <td className="py-2 px-1">
                            <div className="flex gap-1 items-center justify-center">
                               <div className="w-32">
                                  <Select 
                                    disabled={isLeave}
                                    value={otInput.type} 
                                    onValueChange={(v) => setOtInputs(prev => ({...prev, [row.employee_code]: {...otInput, type: v}}))}
                                  >
                                    <SelectTrigger className="h-10 rounded-xl border-slate-200 text-[11px] font-bold">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {OT_TYPE_OPTIONS.map(opt => (
                                        <SelectItem key={opt.field} value={opt.field}>{opt.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                               </div>
                                 <Input 
                                 disabled={isLeave}
                                 type="number" 
                                 placeholder="ชม."
                                 value={otInput.hours} 
                                 onChange={(e) => setOtInputs(prev => ({...prev, [row.employee_code]: {...otInput, hours: e.target.value}}))}
                                 className="h-10 w-16 rounded-xl border-slate-200 text-center font-bold" 
                               />
                               <Button 
                                 disabled={isLeave}
                                 onClick={() => handleAddOT(index)}
                                 size="icon" 
                                 className="h-10 w-10 shrink-0 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-sm"
                               >
                                 <Plus className="h-4 w-4" />
                               </Button>
                               <Button 
                                 onClick={() => handleClearOT(index)}
                                 variant="outline"
                                 size="icon" 
                                 className="h-10 w-10 shrink-0 rounded-xl border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
                                 title="ล้าง OT"
                               >
                                 <Eraser className="h-4 w-4" />
                               </Button>
                            </div>
                          </td>

                          <td className="py-2 px-1 text-center"><Checkbox checked={row.half_day} onCheckedChange={(v) => handleUpdateRecord(index, "half_day", v)} className="h-5 w-5 rounded-md border-slate-300" /></td>
                          <td className="py-2 px-1 text-center"><Checkbox checked={row.leave_day} onCheckedChange={(v) => handleUpdateRecord(index, "leave_day", v)} className="h-5 w-5 rounded-md border-slate-300" /></td>
                          <td className="py-2 px-4"><Input value={row.note} onChange={(e) => handleUpdateRecord(index, "note", e.target.value)} className="h-10 rounded-xl border-slate-200 text-sm italic" placeholder="..." /></td>
                          <td className="py-2 px-4 text-center"><Button variant="ghost" size="icon" onClick={() => handleRemoveRecord(index)} className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl"><Trash2 className="h-4 w-4" /></Button></td>
                        </tr>
                      );
                    }
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {records.map((row, index) => {
              const otInput = otInputs[row.employee_code] || { type: "ot1", hours: "" };
              const isLeave = Boolean(row.leave_day);

              return (
                <Card key={row.employee_code} className={cn("p-5 rounded-3xl border-none shadow-sm transition-all", row.leave_day ? "bg-red-50/50" : "bg-white")}>
                   <div className="flex justify-between items-start mb-4">
                     <div className="flex items-center gap-3">
                       <div className="h-12 w-12 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center font-black text-slate-400">
                         {String(row?.employee_code ?? "").slice(-3) || "—"}
                       </div>
                       <div>
                         <p className="font-black text-slate-900">{row.employee_name}</p>
                         <p className="text-xs font-bold text-slate-400">{row.employee_code}</p>
                       </div>
                     </div>
                     <Button variant="ghost" size="icon" onClick={() => handleRemoveRecord(index)} className="text-slate-300"><Trash2 className="h-4 w-4" /></Button>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-3 mb-6">
                     <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase">เวลาเริ่ม</label>
                       <Input value={row.start_time} onChange={(e) => handleUpdateRecord(index, "start_time", e.target.value)} className="rounded-xl h-10 border-slate-200" />
                     </div>
                   </div>

                   <div className="bg-slate-50/80 rounded-2xl p-4 mb-4 border border-slate-100">
                      <div className="mb-3">
                         <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">จัดการ OT</span>
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1">
                           <Select 
                             disabled={isLeave}
                             value={otInput.type} 
                             onValueChange={(v) => setOtInputs(prev => ({...prev, [row.employee_code]: {...otInput, type: v}}))}
                           >
                             <SelectTrigger className="h-12 rounded-xl border-slate-200 text-xs font-bold bg-white">
                               <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                               {OT_TYPE_OPTIONS.map(opt => (
                                 <SelectItem key={opt.field} value={opt.field}>{opt.label}</SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                        </div>
                        <Input 
                           disabled={isLeave}
                           type="number" 
                           placeholder="ชม."
                           value={otInput.hours} 
                           onChange={(e) => setOtInputs(prev => ({...prev, [row.employee_code]: {...otInput, hours: e.target.value}}))}
                           className="h-12 w-20 rounded-xl border-slate-200 text-center bg-white font-bold" 
                        />
                        <Button 
                           disabled={isLeave}
                           onClick={() => handleAddOT(index)}
                           className="h-12 w-12 rounded-xl bg-blue-600 shadow-md shadow-blue-100"
                        >
                           <Plus className="h-5 w-5 text-white" />
                        </Button>
                        <Button 
                           onClick={() => handleClearOT(index)}
                           variant="outline"
                           className="h-12 w-12 rounded-xl border-slate-200 bg-white text-slate-400"
                        >
                           <Eraser className="h-5 w-5" />
                        </Button>
                      </div>
                   </div>

                   <div className="flex gap-4 p-3 bg-slate-50/50 rounded-2xl mb-4">
                      <div className="flex items-center gap-2">
                         <Checkbox checked={row.half_day} onCheckedChange={(v) => handleUpdateRecord(index, "half_day", v)} />
                         <span className="text-xs font-bold text-slate-700">ครึ่งวัน</span>
                      </div>
                      <div className="flex items-center gap-2">
                         <Checkbox checked={row.leave_day} onCheckedChange={(v) => handleUpdateRecord(index, "leave_day", v)} />
                         <span className="text-xs font-bold text-slate-700">ลา/ขาด</span>
                      </div>
                   </div>

                   <Input value={row.note} onChange={(e) => handleUpdateRecord(index, "note", e.target.value)} className="rounded-xl h-10 border-slate-200 text-sm" placeholder="หมายเหตุ..." />
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2 text-slate-400 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
           <Info className="h-5 w-5 text-blue-500 shrink-0" />
           <p className="text-xs font-medium leading-relaxed">
             <b>Tips:</b> เลือกกะงาน ระบบจะเติมเวลาอัตโนมัติ / ใช้ระบบ <b>บวกเพิ่ม OT</b> เพื่อสะสมชั่วโมงงาน / ปุ่มยางลบ (<Eraser className="inline h-3 w-3" />) ใช้สำหรับล้างข้อมูล OT รายคน
           </p>
        </div>
      </div>
    </div>
  );
}
