import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Context as a Service",
  description: "Server-side Uniform Context personalization API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
