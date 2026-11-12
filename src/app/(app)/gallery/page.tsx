import type { Metadata } from "next";
import { GalleryView } from "./gallery-view";

export const metadata: Metadata = { title: "Gallery" };

export default function GalleryPage() {
  return <GalleryView />;
}
