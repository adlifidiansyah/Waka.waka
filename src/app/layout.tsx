import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "ClientDeck — one link your client actually understands",
    template: "%s · ClientDeck",
  },
  description:
    "A client portal for freelancers and boutique agencies. Milestones, approvals, gated deliverables and a sign-off trail — behind a single magic link.",
  openGraph: {
    title: "ClientDeck",
    description:
      "Replace the email/WhatsApp/Drive/Trello sprawl with one branded link per client.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
