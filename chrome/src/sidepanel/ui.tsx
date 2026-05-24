// Design-system primitives shared by every side-panel screen.
// Ported from chrome/OttoNote Side Panel.html — see Phase B in the roadmap.

import {
  AlignLeft,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  CheckSquare,
  ChevronLeft,
  Download,
  Info,
  Lock,
  Mail,
  Minus,
  MoreHorizontal,
  Pause,
  Plus,
  Search,
  Settings,
  Share2,
  Sparkles,
  Square,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";

// ---------- Icon ----------
// Register only icons the mockup uses. Add new entries as screens need them.
const ICONS: Record<string, LucideIcon> = {
  "align-left": AlignLeft,
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  calendar: Calendar,
  check: Check,
  "check-square": CheckSquare,
  "chevron-left": ChevronLeft,
  download: Download,
  info: Info,
  lock: Lock,
  mail: Mail,
  minus: Minus,
  "more-horizontal": MoreHorizontal,
  pause: Pause,
  plus: Plus,
  search: Search,
  settings: Settings,
  "share-2": Share2,
  sparkles: Sparkles,
  square: Square,
  "trash-2": Trash2,
  upload: Upload,
};

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.75,
  className = "",
}: {
  name: IconName | (string & {});
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Cmp = ICONS[name];
  if (!Cmp) {
    if (import.meta.env.DEV) console.warn(`Icon "${name}" not registered`);
    return null;
  }
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      className={`inline-flex shrink-0 ${className}`}
      aria-hidden="true"
    />
  );
}

// ---------- Logo ----------
// Two concentric "O"s: outer ink ring + offset flame disc creating a crescent.
// Reads as a typographic 'o', a tape reel, an eclipse.
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9.5"
        fill="none"
        className="stroke-paper-900 dark:stroke-paper-50"
        strokeWidth="2.2"
      />
      <circle cx="14.2" cy="12" r="4.2" className="fill-flame-500" />
    </svg>
  );
}

// ---------- StatusChip ----------
type ChipStatus = "done" | "processing" | "failed";

const CHIP_STYLES: Record<
  ChipStatus,
  { label: string; cls: string; dot: string }
> = {
  done: {
    label: "DONE",
    cls: "text-emerald-800 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40",
    dot: "bg-emerald-500",
  },
  processing: {
    label: "PROCESSING",
    cls: "text-flame-800 bg-flame-100 dark:text-flame-300 dark:bg-flame-900/40",
    dot: "bg-flame-500 animate-pulse",
  },
  failed: {
    label: "FAILED",
    cls: "text-red-800 bg-red-100 dark:text-red-300 dark:bg-red-900/40",
    dot: "bg-red-500",
  },
};

export function StatusChip({
  status,
  label,
}: {
  status: ChipStatus;
  label?: string;
}) {
  const s = CHIP_STYLES[status];
  return (
    <span className={`chip-sq ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-sm ${s.dot}`} />
      {label ?? s.label}
    </span>
  );
}

// ---------- Button ----------
type ButtonVariant = "ink" | "flame" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12.5px]",
  md: "h-10 px-4 text-[13.5px]",
  lg: "h-12 px-5 text-[14.5px]",
};

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  ink: "btn-ink rounded-lg font-medium",
  flame:
    "bg-flame-500 hover:bg-flame-600 text-white rounded-lg font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]",
  outline:
    "border border-paper-200 dark:border-paper-800 hover:bg-paper-100 dark:hover:bg-paper-900 text-paper-800 dark:text-paper-200 rounded-lg font-medium",
  ghost:
    "text-paper-500 hover:text-paper-900 dark:text-paper-400 dark:hover:text-paper-50 hover:bg-paper-100 dark:hover:bg-paper-900 rounded-lg font-medium",
  danger:
    "bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.20)]",
};

export function Button({
  variant = "ink",
  size = "md",
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 transition-colors select-none disabled:opacity-50 disabled:cursor-not-allowed ${BTN_SIZES[size]} ${BTN_VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------- IconBtn ----------
// Small square icon button for detail header (download/share/delete/more).
export function IconBtn({
  name,
  tooltip,
  danger = false,
  onClick,
  ariaLabel,
}: {
  name: IconName | (string & {});
  tooltip?: string;
  danger?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const base =
    "w-7 h-7 rounded-md flex items-center justify-center text-paper-500 dark:text-paper-400 transition-colors";
  const hover = danger
    ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
    : "hover:bg-paper-100 dark:hover:bg-paper-900 hover:text-paper-900 dark:hover:text-paper-50";
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={ariaLabel ?? tooltip}
      onClick={onClick}
      className={`${base} ${hover}`}
    >
      <Icon name={name} size={13} />
    </button>
  );
}

// ---------- SectionLabel ----------
// Editorial rule: "001  SUMMARY ────  (trailing)"
export function SectionLabel({
  index,
  children,
  trailing,
  className = "",
}: {
  index?: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`sec-rule text-paper-500 dark:text-paper-400 mb-2.5 ${className}`}
    >
      {index != null && (
        <span className="text-paper-400 dark:text-paper-500 font-medium tabular-nums">
          {index}
        </span>
      )}
      <span className="text-paper-700 dark:text-paper-200 font-medium">
        {children}
      </span>
      <span className="line" />
      {trailing}
    </div>
  );
}

// ---------- PanelMast ----------
// Sticky top bar: logo · "OttoNote" wordmark · slot (left) · slot (right)
// · settings gear · avatar initials.
export function PanelMast({
  left,
  right,
  initials = "SR",
  onSettings,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
  initials?: string;
  onSettings?: () => void;
}) {
  return (
    <div className="px-4 pt-3 pb-2.5 flex items-center gap-2.5 border-b border-paper-200/70 dark:border-paper-800/70">
      <Logo size={18} />
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-[12px] font-semibold tracking-[-0.01em]">
          OttoNote
        </span>
        {left}
      </div>
      {right}
      <button
        type="button"
        onClick={onSettings}
        aria-label="Settings"
        className="w-7 h-7 rounded-md hover:bg-paper-100 dark:hover:bg-paper-900 flex items-center justify-center text-paper-500"
      >
        <Icon name="settings" size={13} />
      </button>
      <div className="w-7 h-7 rounded-md bg-paper-900 dark:bg-paper-100 text-paper-50 dark:text-paper-900 flex items-center justify-center text-[10.5px] font-mono font-semibold">
        {initials}
      </div>
    </div>
  );
}
