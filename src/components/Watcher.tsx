'use client';

import { useEffect, useRef, useState } from 'react';
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube';
import { supabase } from '@/lib/supabase';
import { getVisitorId } from '@/lib/visitor';
import InviteModal from './InviteModal';
import Queue from './Queue';
import { useTranslation } from '@/lib/i18n';

import Box from '@mui/material/Box';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Drawer from '@mui/material/Drawer';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import QrCodeIcon from '@mui/icons-material/QrCode';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import TvOffIcon from '@mui/icons-material/TvOff';

interface WatcherProps {
    roomId: string;
    onLeave: () => void;
    showInviteOnMount?: boolean;
}

export default function Watcher({ roomId, onLeave, showInviteOnMount = false }: WatcherProps) {
    const playerRef = useRef<YouTubePlayer | null>(null);
    const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
    const currentVideoIdRef = useRef<string | null>(null);
    const [showInvite, setShowInvite] = useState(showInviteOnMount);
    const [showQueue, setShowQueue] = useState(false);
    const visitorId = getVisitorId();
    const { t } = useTranslation();

    useEffect(() => {
        currentVideoIdRef.current = currentVideoId;
    }, [currentVideoId]);

    // Initialize room in DB and subscribe
    useEffect(() => {
        let active = true;
        let channel: any;

        const setupRoom = async () => {
            await supabase.from('rooms').upsert({
                id: roomId,
                last_activity: new Date().toISOString()
            }, { onConflict: 'id' });

            if (!active) return;

            // fetch initial state
            const { data } = await supabase.from('rooms').select('*').eq('id', roomId).single();
            if (!active) return;

            if (data && data.current_video_id) {
                setCurrentVideoId(data.current_video_id);
            }

            channel = supabase.channel(`room:${roomId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
                    const newRoom = payload.new as any;
                    if (!newRoom) return;

                    if (newRoom.last_updated_by === visitorId) {
                        // ignore our own updates to prevent loops
                        return;
                    }

                    if (newRoom.current_video_id !== currentVideoIdRef.current) {
                        setCurrentVideoId(newRoom.current_video_id);
                    }

                    if (playerRef.current) {
                        const player = playerRef.current;

                        // sync playback state
                        if (newRoom.playback_state === 'playing') {
                            player.playVideo();
                        } else if (newRoom.playback_state === 'paused') {
                            player.pauseVideo();
                        }

                        // sync seek time if difference is > 2 seconds
                        if (newRoom.seek_time !== null && newRoom.seek_time !== undefined) {
                            const currentTime = player.getCurrentTime() || 0;
                            
                            if (Math.abs(currentTime - newRoom.seek_time) > 2) {
                                player.seekTo(newRoom.seek_time, true);
                            }
                        }
                    }
                })
                .subscribe();
        };

        setupRoom();

        return () => {
            active = false;
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [roomId]);

    const updateServerState = async (state: 'playing' | 'paused' | 'unstarted', seekTime: number) => {
        const duration = playerRef.current?.getDuration?.() || 0;
        await supabase.from('rooms').update({
            playback_state: state,
            seek_time: seekTime,
            duration,
            last_updated_by: visitorId,
            last_activity: new Date().toISOString()
        }).eq('id', roomId);
    };

    // periodically broadcast current time so the Assistant can show progress
    useEffect(() => {
        const interval = setInterval(async () => {
            if (playerRef.current) {
                const player = playerRef.current;
                const state = player.getPlayerState?.();
                
                // only broadcast while playing (state 1)
                if (state === 1) {
                    const currentTime = player.getCurrentTime() || 0;
                    const duration = player.getDuration() || 0;
                    await supabase.from('rooms').update({
                        seek_time: currentTime,
                        duration,
                        last_updated_by: visitorId,
                    }).eq('id', roomId);
                }
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [roomId]);

    const onReady = (event: YouTubeEvent) => {
        playerRef.current = event.target;

        const duration = event.target.getDuration?.() || 0;

        if (duration > 0) {
            supabase.from('rooms').update({ duration, last_updated_by: visitorId }).eq('id', roomId);
        }
    };

    const onPlay = async (event: YouTubeEvent) => {
        await updateServerState('playing', event.target.getCurrentTime());
    };

    const onPause = async (event: YouTubeEvent) => {
        await updateServerState('paused', event.target.getCurrentTime());
    };

    const onEnd = async () => {
        // attempt to play next video from queue
        const { data: queueData } = await supabase
            .from('queue')
            .select('*')
            .eq('room_id', roomId)
            .order('sort_order', { ascending: true })
            .limit(1);

        if (queueData && queueData.length > 0) {
            const nextVideo = queueData[0];

            const updates: any = {
                current_video_id: nextVideo.video_id,
                playback_state: 'playing',
                seek_time: 0,
                last_updated_by: visitorId,
                last_activity: new Date().toISOString()
            };

            // save current video as previous
            if (currentVideoId) {
                updates.previous_video_id = currentVideoId;
            }

            await supabase.from('rooms').update(updates).eq('id', roomId);

            // remove from queue
            await supabase.from('queue').delete().eq('id', nextVideo.id);
        } else {
            // nothing in queue, so stop and save previous
            const updates: any = {
                current_video_id: null,
                playback_state: 'unstarted',
                seek_time: 0,
                last_updated_by: visitorId,
                last_activity: new Date().toISOString()
            };

            if (currentVideoId) {
                updates.previous_video_id = currentVideoId;
            }

            await supabase.from('rooms').update(updates).eq('id', roomId);
        }
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh', width: '100vw', bgcolor: 'black', overflow: 'hidden' }}>
            <Box sx={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <AppBar position="absolute" color="transparent" elevation={0} sx={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}>
                    <Toolbar sx={{ justifyContent: 'space-between' }}>
                        <IconButton onClick={onLeave} sx={{ color: 'white' }}>
                            <ArrowBackIcon />
                        </IconButton>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                                variant="outlined"
                                color="inherit"
                                onClick={() => setShowQueue(!showQueue)}
                                startIcon={showQueue ? <CloseFullscreenIcon /> : <QueueMusicIcon />}
                                sx={{ bgcolor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.2)' }}
                            >
                                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                                    {showQueue ? t('hide_queue') : t('show_queue')}
                                </Box>
                            </Button>
                            <Button
                                variant="outlined"
                                color="inherit"
                                onClick={() => setShowInvite(true)}
                                startIcon={<QrCodeIcon />}
                                sx={{ bgcolor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.2)' }}
                            >
                                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                                    {t('invite')}
                                </Box>
                            </Button>
                        </Box>
                    </Toolbar>
                </AppBar>

                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    {currentVideoId ? (
                        <Box sx={{ width: '100%', height: '100%', pointerEvents: 'auto' }}>
                            <YouTube
                                videoId={currentVideoId}
                                opts={{
                                    width: '100%',
                                    height: '100%',
                                    playerVars: {
                                        autoplay: 1,
                                        controls: 0,
                                        disablekb: 1,
                                        modestbranding: 1,
                                        rel: 0,
                                    },
                                }}
                                onReady={onReady}
                                onPlay={onPlay}
                                onPause={onPause}
                                onEnd={onEnd}
                                style={{ width: '100%', height: '100%' }}
                                className="w-full h-full"
                            />
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: 'text.secondary' }}>
                            <TvOffIcon sx={{ fontSize: 64 }} />
                            <Typography>{t('nothing_playing_watcher')}</Typography>
                        </Box>
                    )}
                </Box>
            </Box>

            <Drawer
                anchor="right"
                open={showQueue}
                onClose={() => setShowQueue(false)}
                slotProps={{ paper: {
                    sx: {
                        width: { xs: '100%', sm: 350 },
                        bgcolor: 'background.paper',
                        borderLeft: '1px solid',
                        borderColor: 'divider',
                        p: 2,
                        boxSizing: 'border-box'
                    }
                }}}
            >
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {t('queue')}
                </Typography>
                <Queue roomId={roomId} />
            </Drawer>

            {showInvite && <InviteModal roomId={roomId} onClose={() => setShowInvite(false)} />}
        </Box>
    );
}
