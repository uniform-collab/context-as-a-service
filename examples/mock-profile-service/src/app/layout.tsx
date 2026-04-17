import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mock Profile Service",
  description: "Mock profile service with 10 test users",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
