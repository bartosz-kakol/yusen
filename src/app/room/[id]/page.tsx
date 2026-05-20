"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Watcher from "@/components/Watcher";
import Assistant from "@/components/Assistant";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CardActionArea from "@mui/material/CardActionArea";

import TvIcon from "@mui/icons-material/Tv";
import SmartphoneIcon from "@mui/icons-material/Smartphone";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

type Role = "none" | "watcher" | "assistant";

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const roomId = resolvedParams.id;
    const router = useRouter();
    const searchParams = useSearchParams();
    const [role, setRole] = useState<Role>("none");
    const [showInviteOnMount, setShowInviteOnMount] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        localStorage.setItem("last_room_id", roomId);

        const isCreated = searchParams.get("created") === "true";
        if (isCreated) {
            setRole("watcher");
            setShowInviteOnMount(true);
            
            // strip the query param from the URL
            router.replace(`/room/${roomId}`);
        }
    }, [roomId, searchParams, router]);

    const handleLeave = () => {
        localStorage.removeItem("last_room_id");
        router.push("/");
    };

    if (role === "none") {
        return (
            <Box component="main" sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", p: 2 }}>
                <LanguageSwitcher />
                <Card sx={{ p: 4, display: "flex", flexDirection: "column", gap: 3, maxWidth: 400, width: "100%" }}>
                    <Box sx={{ textAlign: "center" }}>
                        <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                            {t("join_room")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t("select_role")}
                        </Typography>
                    </Box>

                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <Card variant="outlined" sx={{ borderColor: "primary.main", borderWidth: 2 }}>
                            <CardActionArea onClick={() => setRole("watcher")} sx={{ p: 3, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                                <TvIcon sx={{ fontSize: 40, mb: 1, color: "primary.main" }} />
                                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                    {t("join_watcher")}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                    {t("join_watcher_desc")}
                                </Typography>
                            </CardActionArea>
                        </Card>

                        <Card variant="outlined">
                            <CardActionArea onClick={() => setRole("assistant")} sx={{ p: 3, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                                <SmartphoneIcon sx={{ fontSize: 40, mb: 1 }} />
                                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                    {t("join_assistant")}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                    {t("join_assistant_desc")}
                                </Typography>
                            </CardActionArea>
                        </Card>
                    </Box>

                    <Button
                        variant="text"
                        color="inherit"
                        startIcon={<ArrowBackIcon />}
                        onClick={handleLeave}
                        sx={{ alignSelf: "center" }}
                    >
                        {t("back_home")}
                    </Button>
                </Card>
            </Box>
        );
    }

    return (
        <Box sx={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}>
            {role === "watcher" ? (
                <Watcher roomId={roomId} onLeave={handleLeave} showInviteOnMount={showInviteOnMount} />
            ) : (
                <Assistant roomId={roomId} onLeave={handleLeave} />
            )}
        </Box>
    );
}
