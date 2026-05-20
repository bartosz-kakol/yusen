"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import LanguageIcon from "@mui/icons-material/Language";
import Box from "@mui/material/Box";

export default function LanguageSwitcher() {
    const { i18n } = useTranslation();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const language = (i18n.language?.split("-")[0] || "en") as "en" | "pl";

    const changeLanguage = async (lang: "en" | "pl") => {
        await i18n.changeLanguage(lang);
        localStorage.setItem("language", lang);
        setAnchorEl(null);
    };

    return (
        <Box sx={{ position: "absolute", top: 16, right: 16 }}>
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} color="inherit" sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}>
                <LanguageIcon />
            </IconButton>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                <MenuItem onClick={() => changeLanguage("en")} selected={language === "en"}>English</MenuItem>
                <MenuItem onClick={() => changeLanguage("pl")} selected={language === "pl"}>Polski</MenuItem>
            </Menu>
        </Box>
    );
}
