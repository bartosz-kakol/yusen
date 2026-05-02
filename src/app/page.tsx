'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { getVisitorId } from '@/lib/visitor';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n';
import { Container } from '@mui/material';

export default function LandingPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const { t } = useTranslation();

    useEffect(() => {
        getVisitorId();

        const lastRoomId = localStorage.getItem('last_room_id');

        if (lastRoomId) {
            router.replace(`/room/${lastRoomId}`);
        } else {
            setIsLoading(false);
        }
    }, [router]);

    const handleCreateRoom = () => {
        const newRoomId = uuidv4();
        localStorage.setItem('last_room_id', newRoomId);
        router.push(`/room/${newRoomId}?created=true`);
    };

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box component="main" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', p: 2 }}>
            <LanguageSwitcher />

            <Container sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', md: 'row' },
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4
            }}>
                <video 
                    width="300" 
                    height="300" 
                    autoPlay 
                    muted 
                    playsInline 
                    poster="/logo/still.png">
                    <source src="/logo/anim.mp4" type="video/mp4" />
                    <img src="/logo/still.png" width="300" height="300" />
                </video>

                <Container sx={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: { xs: 'center', md: 'flex-start' },
                    textAlign: { xs: 'center', md: 'left' }
                }}>
                    <Typography variant="h3" component="h1" sx={{ fontWeight: 600 }}>
                        {t('welcome')}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
                        {t('welcome_desc')}
                    </Typography>
                    <Button
                        variant="contained"
                        size="large"
                        startIcon={<AddCircleOutlinedIcon />}
                        onClick={handleCreateRoom}
                        sx={{ mt: 3 }}
                    >
                        {t('create_room')}
                    </Button>
                </Container>
            </Container>
        </Box>
    );
}
