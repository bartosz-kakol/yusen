import type { Metadata, Viewport } from "next";
import "./globals.css";

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

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from '@/theme';

import { LanguageProvider } from '@/lib/i18n';

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body>
                <AppRouterCacheProvider>
                    <ThemeProvider theme={theme}>
                        <CssBaseline />
                        <LanguageProvider>
                            {children}
                        </LanguageProvider>
                    </ThemeProvider>
                </AppRouterCacheProvider>
            </body>
        </html>
    );
}
