import type { ReactNode } from "react";
import {
  AlertTriangle,
  DatabaseZap,
  Inbox,
  Loader2,
  ShieldAlert,
  WifiOff,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StateKind =
  | "loading"
  | "empty"
  | "error"
  | "warning"
  | "permission"
  | "offline";

const stateStyles: Record<StateKind, string> = {
  loading: "border-teal-100 bg-teal-50 text-slate-700 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-100",
  empty: "border-teal-100 bg-teal-50 text-slate-700 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-100",
  error: "border-red-200 bg-red-50 text-red-900 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-100",
  warning: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100",
  permission: "border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-800/60 dark:bg-orange-950/40 dark:text-orange-100",
  offline: "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
};

const stateIcons = {
  loading: Loader2,
  empty: Inbox,
  error: AlertTriangle,
  warning: DatabaseZap,
  permission: ShieldAlert,
  offline: WifiOff,
};

type StatePanelProps = {
  kind: StateKind;
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
};

export function StatePanel({
  kind,
  title,
  message,
  action,
  className,
}: StatePanelProps) {
  const Icon = stateIcons[kind];
  return (
    <Card
      role={kind === "error" || kind === "warning" ? "alert" : "status"}
      aria-live={kind === "loading" ? "polite" : undefined}
      className={cn(
        "flex min-h-44 flex-col items-center justify-center rounded-2xl p-6 text-center shadow-card",
        stateStyles[kind],
        className
      )}
    >
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 shadow-sm dark:bg-slate-900/60">
        <Icon
          className={cn("h-5 w-5", kind === "loading" && "animate-spin")}
          aria-hidden="true"
        />
      </span>
      <h2 className="text-base font-bold sm:text-lg">{title}</h2>
      {message && <p className="mt-1 max-w-xl text-sm leading-6 opacity-80">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
