import { Noto_Sans, JetBrains_Mono } from "next/font/google";
import { Providers } from "../state/providers";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { getModels, getSystemPromptTemplates } from "@/lib/action";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});


export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
    const [models, systemPromptTemplates] = await Promise.all([
    getModels(),
    getSystemPromptTemplates(),
  ])

  return (
    <html lang="en">
      <body
        className={`${notoSans.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <Providers>
            <AppShell models={models} systemPromptTemplates={systemPromptTemplates}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
