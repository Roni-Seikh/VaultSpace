import { Archive, File as FileIcon, FileSpreadsheet, FileText, Folder, Image as ImageIcon, Presentation, Video } from "lucide-react";
import type { MimeCategory } from "@/lib/files/types";
import { cn } from "@/lib/utils";

const MAP: Record<MimeCategory, { icon: typeof FileIcon; label: string; plural: string; color: string }> = {
  image: { icon: ImageIcon, label: "Image", plural: "Images", color: "text-pink-500 bg-pink-500/10" },
  video: { icon: Video, label: "Video", plural: "Videos", color: "text-purple-500 bg-purple-500/10" },
  document: { icon: FileText, label: "Document", plural: "Documents", color: "text-blue-500 bg-blue-500/10" },
  spreadsheet: { icon: FileSpreadsheet, label: "Spreadsheet", plural: "Spreadsheets", color: "text-emerald-500 bg-emerald-500/10" },
  presentation: { icon: Presentation, label: "Presentation", plural: "Presentations", color: "text-orange-500 bg-orange-500/10" },
  text: { icon: FileText, label: "Text", plural: "Text files", color: "text-slate-500 bg-slate-500/10" },
  archive: { icon: Archive, label: "Archive", plural: "Archives", color: "text-amber-500 bg-amber-500/10" },
};

export const categoryLabel = (c: MimeCategory) => MAP[c].label;
export const categoryPlural = (c: MimeCategory) => MAP[c].plural;

export function CategoryIcon({ category, className, box = true }: { category: MimeCategory | "folder"; className?: string; box?: boolean }) {
  if (category === "folder") {
    return <span className={cn("grid shrink-0 place-items-center rounded-lg bg-brand/10 text-brand", box ? "h-10 w-10" : "", className)}><Folder className="h-5 w-5" aria-hidden /></span>;
  }
  const { icon: Icon, color } = MAP[category];
  return <span className={cn("grid shrink-0 place-items-center rounded-lg", color, box ? "h-10 w-10" : "", className)}><Icon className="h-5 w-5" aria-hidden /></span>;
}
