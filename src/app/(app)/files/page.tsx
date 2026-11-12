import type { Metadata } from "next";
import { FilesBrowser } from "./files-browser";

export const metadata: Metadata = { title: "My Files" };

export default function FilesPage() {
  return <FilesBrowser />;
}
