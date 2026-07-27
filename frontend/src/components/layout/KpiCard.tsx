import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type KpiTone = "teal" | "blue" | "cyan" | "emerald" | "amber" | "rose";

const tones: Record<KpiTone, { card: string; icon: string; accent: string }> = {
  teal: { card: "border-teal-200 bg-teal-50 dark:border-teal-800/60 dark:bg-teal-950/40", icon: "bg-white/80 text-teal-700 dark:bg-slate-900/60 dark:text-teal-300", accent: "bg-teal-600" },
  blue: { card: "border-blue-200 bg-blue-50 dark:border-blue-800/60 dark:bg-blue-950/40", icon: "bg-white/80 text-blue-600 dark:bg-slate-900/60 dark:text-blue-300", accent: "bg-blue-600" },
  cyan: { card: "border-cyan-200 bg-cyan-50 dark:border-cyan-800/60 dark:bg-cyan-950/40", icon: "bg-white/80 text-cyan-700 dark:bg-slate-900/60 dark:text-cyan-300", accent: "bg-cyan-600" },
  emerald: { card: "border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/40", icon: "bg-white/80 text-emerald-600 dark:bg-slate-900/60 dark:text-emerald-300", accent: "bg-emerald-500" },
  amber: { card: "border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/35", icon: "bg-white/80 text-amber-600 dark:bg-slate-900/60 dark:text-amber-300", accent: "bg-amber-500" },
  rose: { card: "border-rose-200 bg-rose-50 dark:border-rose-800/60 dark:bg-rose-950/35", icon: "bg-white/80 text-rose-600 dark:bg-slate-900/60 dark:text-rose-300", accent: "bg-rose-500" },
};

type KpiCardProps = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: KpiTone;
  helper?: string;
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "teal",
  helper,
}: KpiCardProps) {
  const style = tones[tone];
  return (
    <article className={cn("kpi-card min-h-36", style.card)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p>
          <p className="mt-3 truncate text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            {value}
          </p>
          {helper && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p>}
        </div>
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", style.icon)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <span className={cn("absolute inset-x-5 bottom-0 h-1 rounded-t-full", style.accent)} aria-hidden="true" />
    </article>
  );
}
