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
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import Slider from '@mui/material/Slider';

interface WatcherProps {
    roomId: string;
    onLeave: () => void;
    showInviteOnMount?: boolean;
}

export default function Watcher({ roomId, onLeave, showInviteOnMount = false }: WatcherProps) {
    const playerRef = useRef<YouTubePlayer | null>(null);
    const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
    const currentVideoIdRef = useRef<string | null>(null);
    const roomStateRef = useRef<any>(null);
    const initialSeekTimeRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);
    const [hasPrevious, setHasPrevious] = useState<boolean>(false);
    const [showInvite, setShowInvite] = useState(showInviteOnMount);
    const [showQueue, setShowQueue] = useState(false);
    const [volume, setVolume] = useState<number>(100);
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isSeeking, setIsSeeking] = useState<boolean>(false);
    const [showControls, setShowControls] = useState<boolean>(true);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

            if (data) {
                roomStateRef.current = data;
                
                const now = new Date().getTime();
                const lastPing = data.master_last_ping ? new Date(data.master_last_ping).getTime() : 0;
                if (!data.master_watcher_id || (now - lastPing > 10000)) {
                    const updates = {
                        master_watcher_id: visitorId,
                        master_last_ping: new Date().toISOString()
                    };
                    await supabase.from('rooms').update(updates).eq('id', roomId);
                    roomStateRef.current.master_watcher_id = visitorId;
                    roomStateRef.current.master_last_ping = updates.master_last_ping;
                }

                if (data.current_video_id) {
                    setCurrentVideoId(data.current_video_id);
                }
                setHasPrevious(!!data.previous_video_id);
                if (data.seek_time) {
                    initialSeekTimeRef.current = data.seek_time;
                }
            }

            channel = supabase.channel(`room:${roomId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
                    const newRoom = payload.new as any;
                    if (!newRoom) return;

                    roomStateRef.current = newRoom;

                    if (newRoom.current_video_id !== currentVideoIdRef.current) {
                        setCurrentVideoId(newRoom.current_video_id);
                    }

                    if (newRoom.previous_video_id !== undefined) {
                        setHasPrevious(!!newRoom.previous_video_id);
                    }

                    if (newRoom.last_updated_by === visitorId) {
                        // ignore our own updates to prevent loops
                        return;
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
                                lastTimeRef.current = newRoom.seek_time;
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

    const updateServerState = async (state: 'playing' | 'paused' | 'unstarted', seekTime: number, claimMaster: boolean = true) => {
        const duration = playerRef.current?.getDuration?.() || 0;
        
        const updates: any = {
            playback_state: state,
            seek_time: seekTime,
            duration,
            last_updated_by: visitorId,
            last_activity: new Date().toISOString()
        };

        if (claimMaster) {
            updates.master_watcher_id = visitorId;
            updates.master_last_ping = new Date().toISOString();
        }

        if (roomStateRef.current) {
            roomStateRef.current = { ...roomStateRef.current, ...updates };
        }

        await supabase.from('rooms').update(updates).eq('id', roomId);
    };

    // periodically broadcast current time so the Assistant can show progress
    useEffect(() => {
        const interval = setInterval(async () => {
            if (playerRef.current && roomStateRef.current) {
                const player = playerRef.current;
                const state = player.getPlayerState?.();
                const currentTime = player.getCurrentTime() || 0;
                
                const now = new Date().getTime();
                const lastPing = roomStateRef.current.master_last_ping ? new Date(roomStateRef.current.master_last_ping).getTime() : 0;
                let isMaster = roomStateRef.current.master_watcher_id === visitorId;
                
                if (!isMaster && (now - lastPing > 10000)) {
                    const updates = {
                        master_watcher_id: visitorId,
                        master_last_ping: new Date().toISOString()
                    };
                    await supabase.from('rooms').update(updates).eq('id', roomId);
                    isMaster = true;
                    roomStateRef.current.master_watcher_id = visitorId;
                    roomStateRef.current.master_last_ping = updates.master_last_ping;
                }
                
                if (state === 1 || state === 2 || state === 3) {
                    let expectedTime = lastTimeRef.current;
                    if (state === 1) expectedTime += 2;

                    if (Math.abs(currentTime - expectedTime) > 4) {
                        const broadcastState = state === 1 ? 'playing' : state === 2 ? 'paused' : roomStateRef.current.playback_state;
                        await updateServerState(broadcastState, currentTime, true);
                    } else if (isMaster && state === 1) {
                        const updates = {
                            seek_time: currentTime,
                            duration: player.getDuration() || 0,
                            master_last_ping: new Date().toISOString()
                        };
                        roomStateRef.current.master_last_ping = updates.master_last_ping;
                        await supabase.from('rooms').update(updates).eq('id', roomId);
                    } else if (isMaster) {
                        const updates = { master_last_ping: new Date().toISOString() };
                        roomStateRef.current.master_last_ping = updates.master_last_ping;
                        await supabase.from('rooms').update(updates).eq('id', roomId);
                    }

                    lastTimeRef.current = currentTime;
                } else if (isMaster) {
                    const updates = { master_last_ping: new Date().toISOString() };
                    roomStateRef.current.master_last_ping = updates.master_last_ping;
                    await supabase.from('rooms').update(updates).eq('id', roomId);
                }
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [roomId, visitorId]);

    useEffect(() => {
        const handleUnload = () => {
            if (roomStateRef.current?.master_watcher_id === visitorId) {
                supabase.from('rooms').update({ master_watcher_id: null }).eq('id', roomId).then();
            }
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => {
            handleUnload();
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, [roomId, visitorId]);

    useEffect(() => {
        handleMouseMove();
        return () => {
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        };
    }, []);

    const handleMouseMove = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    };

    useEffect(() => {
        const interval = setInterval(() => {
            if (playerRef.current && !isSeeking) {
                const time = playerRef.current.getCurrentTime() || 0;
                setCurrentTime(time);
                
                const state = playerRef.current.getPlayerState?.();
                setIsPlaying(state === 1);
            }
        }, 500);
        return () => clearInterval(interval);
    }, [isSeeking]);

    const handleSeekChange = (_e: Event | React.SyntheticEvent, newValue: number | number[]) => {
        setIsSeeking(true);
        setCurrentTime(newValue as number);
    };

    const handleSeekCommitted = (_e: Event | React.SyntheticEvent, newValue: number | number[]) => {
        const val = newValue as number;
        setCurrentTime(val);
        if (playerRef.current) {
            playerRef.current.seekTo(val, true);
            updateServerState(roomStateRef.current?.playback_state || 'playing', val, true);
        }
        setIsSeeking(false);
    };

    const togglePlayPause = () => {
        if (!playerRef.current) return;
        const state = playerRef.current.getPlayerState?.();
        if (state === 1) {
            playerRef.current.pauseVideo();
        } else {
            playerRef.current.playVideo();
        }
    };

    const formatTime = (timeInSeconds: number) => {
        if (isNaN(timeInSeconds)) return '0:00';
        const m = Math.floor(timeInSeconds / 60);
        const s = Math.floor(timeInSeconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const onReady = (event: YouTubeEvent) => {
        playerRef.current = event.target;
        event.target.setVolume(volume);
        if (isMuted) event.target.mute();

        if (initialSeekTimeRef.current > 0) {
            event.target.seekTo(initialSeekTimeRef.current, true);
            lastTimeRef.current = initialSeekTimeRef.current;
            initialSeekTimeRef.current = 0;
        }

        const dur = event.target.getDuration?.() || 0;
        setDuration(dur);

        if (dur > 0 && roomStateRef.current?.duration !== dur) {
            supabase.from('rooms').update({ duration: dur, last_updated_by: visitorId }).eq('id', roomId);
        }
    };

    const handleVolumeChange = (_e: Event | React.SyntheticEvent, newValue: number | number[]) => {
        const val = newValue as number;
        setVolume(val);
        if (playerRef.current) {
            playerRef.current.setVolume(val);
            if (val > 0 && isMuted) {
                playerRef.current.unMute();
                setIsMuted(false);
            }
        }
    };

    const toggleMute = () => {
        if (playerRef.current) {
            if (isMuted) {
                playerRef.current.unMute();
                setIsMuted(false);
            } else {
                playerRef.current.mute();
                setIsMuted(true);
            }
        }
    };

    const onPlay = async (event: YouTubeEvent) => {
        if (roomStateRef.current?.playback_state !== 'playing') {
            await updateServerState('playing', event.target.getCurrentTime(), true);
        }
    };

    const onPause = async (event: YouTubeEvent) => {
        if (roomStateRef.current?.playback_state !== 'paused') {
            await updateServerState('paused', event.target.getCurrentTime(), true);
        }
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

    const handlePrevious = async () => {
        const { data: roomData } = await supabase.from('rooms').select('previous_video_id, current_video_id').eq('id', roomId).single();
        if (!roomData?.previous_video_id) return;

        const prevVideoId = roomData.previous_video_id;

        if (roomData.current_video_id) {
            const { data: firstItem } = await supabase
                .from('queue')
                .select('sort_order')
                .eq('room_id', roomId)
                .order('sort_order', { ascending: true })
                .limit(1);

            const insertOrder = firstItem && firstItem.length > 0
                ? firstItem[0].sort_order - 1
                : 1;

            await supabase.from('queue').insert({
                id: crypto.randomUUID(),
                room_id: roomId,
                video_id: roomData.current_video_id,
                sort_order: insertOrder,
                added_by: visitorId
            });
        }

        await supabase.from('rooms').update({
            current_video_id: prevVideoId,
            previous_video_id: null,
            playback_state: 'playing',
            seek_time: 0,
            duration: 0,
            last_updated_by: visitorId,
            last_activity: new Date().toISOString()
        }).eq('id', roomId);
    };

    return (
        <Box 
            sx={{ display: 'flex', height: '100vh', width: '100vw', bgcolor: 'black', overflow: 'hidden' }}
            onMouseMove={handleMouseMove}
            onTouchStart={handleMouseMove}
        >
            <Box sx={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <AppBar position="absolute" color="transparent" elevation={0} sx={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)', opacity: showControls ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: showControls ? 'auto' : 'none' }}>
                    <Toolbar sx={{ justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <IconButton onClick={onLeave} sx={{ color: 'white' }}>
                                <ArrowBackIcon />
                            </IconButton>
                        </Box>
                    </Toolbar>
                </AppBar>

                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    {currentVideoId ? (
                        <Box sx={{ width: '100%', height: '100%', pointerEvents: 'auto', position: 'relative' }}>
                            <Box sx={{ position: 'absolute', inset: 0, zIndex: 1 }} />
                            <YouTube
                                videoId={currentVideoId}
                                opts={{
                                    width: '100%',
                                    height: '100%',
                                    playerVars: {
                                        autoplay: 1,
                                        controls: 0,
                                        modestbranding: 1,
                                        rel: 0,
                                        disablekb: 1,
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

                <Box sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0.67), transparent)',
                    p: 2,
                    pt: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    opacity: showControls ? 1 : 0,
                    transition: 'opacity 0.3s',
                    pointerEvents: showControls ? 'auto' : 'none',
                    zIndex: 10
                }}>
                    <IconButton onClick={handlePrevious} disabled={!hasPrevious} sx={{ color: hasPrevious ? 'white' : 'rgba(255,255,255,0.3)' }}>
                        <SkipPreviousIcon />
                    </IconButton>

                    <IconButton onClick={togglePlayPause} sx={{ color: 'white' }}>
                        {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                    </IconButton>

                    <IconButton onClick={onEnd} sx={{ color: 'white' }}>
                        <SkipNextIcon />
                    </IconButton>

                    <Typography variant="body2" sx={{ color: 'white', minWidth: 40, textAlign: 'center' }}>
                        {formatTime(currentTime)}
                    </Typography>

                    <Slider
                        size="small"
                        value={currentTime}
                        max={duration > 0 ? duration : 100}
                        onChange={handleSeekChange}
                        onChangeCommitted={handleSeekCommitted}
                        sx={{ color: 'white', flex: 1, mx: 1 }}
                    />

                    <Typography variant="body2" sx={{ color: 'white', minWidth: 40, textAlign: 'center' }}>
                        {formatTime(duration)}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', width: { xs: 80, sm: 120 }, ml: 1, mr: 1, gap: 1 }}>
                        <IconButton onClick={toggleMute} sx={{ color: 'white' }} size="small">
                            {isMuted || volume === 0 ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
                        </IconButton>
                        <Slider
                            size="small"
                            value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            sx={{ color: 'white' }}
                        />
                    </Box>

                    <IconButton onClick={() => setShowQueue(!showQueue)} sx={{ color: 'white' }}>
                        <QueueMusicIcon />
                    </IconButton>
                    
                    <IconButton onClick={() => setShowInvite(true)} sx={{ color: 'white' }}>
                        <QrCodeIcon />
                    </IconButton>
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
