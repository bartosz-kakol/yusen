'use client';

import { useTranslation } from '@/lib/i18n';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import LanguageIcon from '@mui/icons-material/Language';
import { useState } from 'react';
import Box from '@mui/material/Box';

export default function LanguageSwitcher() {
    const { language, setLanguage } = useTranslation();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    return (
        <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} color="inherit" sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                <LanguageIcon />
            </IconButton>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                <MenuItem onClick={() => { setLanguage('en'); setAnchorEl(null); }} selected={language === 'en'}>English</MenuItem>
                <MenuItem onClick={() => { setLanguage('pl'); setAnchorEl(null); }} selected={language === 'pl'}>Polski</MenuItem>
            </Menu>
        </Box>
    );
}
