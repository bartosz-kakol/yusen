"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";

import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { useTranslation } from "react-i18next";

interface InviteModalProps {
    roomId: string;
    onClose: () => void;
}

export default function InviteModal({ roomId, onClose }: InviteModalProps) {
    const [url, setUrl] = useState("");
    const [copied, setCopied] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        setUrl(`${window.location.origin}/room/${roomId}`);
    }, [roomId]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    };

    return (
        <Dialog open={true} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {t("invite_friends")}
                <IconButton onClick={onClose} size="small">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, pb: 4 }}>
                <Box sx={{ bgcolor: "white", p: 2, borderRadius: 2 }}>
                    {url && <QRCodeSVG value={url} size={200} />}
                </Box>

                <Box sx={{ display: "flex", width: "100%", gap: 1 }}>
                    <TextField
                        value={url}
                        slotProps={{ htmlInput: { readOnly: true } }}
                        fullWidth
                        size="small"
                        variant="outlined"
                    />
                    <Tooltip title={copied ? t("copied") : t("copy_link")} placement="top">
                        <Button
                            variant="contained"
                            color={copied ? "success" : "primary"}
                            onClick={handleCopy}
                            sx={{ minWidth: 48, px: 0 }}
                            disableElevation
                        >
                            {copied ? <CheckIcon /> : <ContentCopyIcon />}
                        </Button>
                    </Tooltip>
                </Box>
            </DialogContent>
        </Dialog>
    );
}
