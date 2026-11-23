import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
 title: "JobPilot AI — Find your next opportunity",
 description: "Discover DevOps, Platform, SRE and Cloud roles from company career pages. Newest listings first.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 return <html lang="en"><body>{children}</body></html>;
}
