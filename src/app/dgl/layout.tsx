import type { Metadata } from "next";
import { DglMotion } from "@/components/dgl/DglMotion";

export const metadata: Metadata = {
  title: "DevFest Got Latent | DevFest Noida 2026",
  robots: { index: false },
};

export default function DglLayout({ children }: LayoutProps<"/dgl">) {
  return <DglMotion>{children}</DglMotion>;
}
