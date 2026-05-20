import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeRegistry from "@/components/ThemeRegistry";

export const viewport: Viewport = {
    themeColor: "#000000",
};

export const metadata: Metadata = {
    title: "Yusen",
    description: "Synchronized YouTube viewing sessions for the web.",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "Yusen",
    },
    formatDetection: {
        telephone: false,
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body>
                <ThemeRegistry>{children}</ThemeRegistry>
            </body>
        </html>
    );
}
