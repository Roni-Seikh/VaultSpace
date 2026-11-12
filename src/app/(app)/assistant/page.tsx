import type { Metadata } from "next";
import { AssistantView } from "./assistant-view";

export const metadata: Metadata = { title: "AI Assistant" };

export default function AssistantPage() {
  return <AssistantView />;
}
