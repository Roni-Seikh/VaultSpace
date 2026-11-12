import type { Metadata } from "next";
import { SharedView } from "./shared-view";

export const metadata: Metadata = { title: "Shared links" };

export default function SharedPage() {
  return <SharedView />;
}
