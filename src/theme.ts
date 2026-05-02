"use client";

import { createTheme } from "@mui/material/styles";

const theme = createTheme({
    palette: {
        mode: "dark",
        background: {
            default: "#000000",
            paper: "#121212",
        },
        primary: {
            main: "#DC6027",
        },
        text: {
            primary: "#ffffff",
            secondary: "#a0a0a0",
        },
        divider: "#333333",
    },
    typography: {
        fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    shape: {
        borderRadius: 8,
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: "none",
                    fontWeight: 600,
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: "none", // remove the default elevation overlay in dark mode
                    border: "1px solid #333333",
                },
            },
        },
    },
});

export default theme;
