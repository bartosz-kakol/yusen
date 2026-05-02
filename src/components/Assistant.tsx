'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getVisitorId } from '@/lib/visitor';
import Queue from './Queue';
import InviteModal from './InviteModal';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Card from '@mui/material/Card';
import Slider from '@mui/material/Slider';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import QrCodeIcon from '@mui/icons-material/QrCode';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import MovieIcon from '@mui/icons-material/Movie';
import { useTranslation } from '@/lib/i18n';

interface AssistantProps {
    roomId: string;
    onLeave: () => void;
}

function formatTime(seconds: number): string {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export default function Assistant({ roomId, onLeave }: AssistantProps) {
    const [showInvite, setShowInvite] = useState(false);
    const [roomState, setRoomState] = useState<any>(null);
    const [currentMeta, setCurrentMeta] = useState<any>(null);
    const [isSeeking, setIsSeeking] = useState(false);
    const [seekValue, setSeekValue] = useState(0);
    const visitorId = getVisitorId();
    const { t } = useTranslation();

    const fetchMeta = useCallback(async (videoId: string) => {
        const { data } = await supabase.from('metadata_cache').select('*').eq('video_id', videoId).single();
        if (data) setCurrentMeta(data);
    }, []);

    useEffect(() => {
        let active = true;

        const fetchRoom = async () => {
            const { data } = await supabase.from('rooms').select('*').eq('id', roomId).single();
            if (!active) return;

            setRoomState(data);
            if (data?.current_video_id) {
                fetchMeta(data.current_video_id);
            } else {
                setCurrentMeta(null);
            }
        };
        fetchRoom();

        const channel = supabase.channel(`assistant:${roomId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
                const newRoom = payload.new as any;
                if (!active) return;

                setRoomState(newRoom);

                if (newRoom.current_video_id) {
                    fetchMeta(newRoom.current_video_id);
                } else {
                    setCurrentMeta(null);
                }
            })
            .subscribe();

        return () => {
            active = false;
            supabase.removeChannel(channel);
        };
    }, [roomId, fetchMeta]);

    // keep seek slider in sync with room state when not actively seeking
    useEffect(() => {
        if (!isSeeking && roomState?.seek_time != null) {
            setSeekValue(roomState.seek_time);
        }
    }, [roomState?.seek_time, isSeeking]);

    const handlePlayPause = async () => {
        if (!roomState?.current_video_id) return;
        const newState = roomState.playback_state === 'playing' ? 'paused' : 'playing';

        setRoomState((prev: any) => ({ ...prev, playback_state: newState }));

        await supabase.from('rooms').update({
            playback_state: newState,
            last_updated_by: visitorId,
            last_activity: new Date().toISOString()
        }).eq('id', roomId);
    };

    const handleSeekCommit = async (_event: Event | React.SyntheticEvent, value: number | number[]) => {
        const seekTime = value as number;
        setIsSeeking(false);

        await supabase.from('rooms').update({
            seek_time: seekTime,
            last_updated_by: visitorId,
            last_activity: new Date().toISOString()
        }).eq('id', roomId);
    };

    const handleNext = async () => {
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
                duration: 0,
                last_updated_by: visitorId,
                last_activity: new Date().toISOString()
            };

            if (roomState?.current_video_id) {
                updates.previous_video_id = roomState.current_video_id;
            }

            await supabase.from('rooms').update(updates).eq('id', roomId);
            await supabase.from('queue').delete().eq('id', nextVideo.id);
        } else {
            const updates: any = {
                current_video_id: null,
                playback_state: 'unstarted',
                seek_time: 0,
                duration: 0,
                last_updated_by: visitorId,
                last_activity: new Date().toISOString()
            };

            if (roomState?.current_video_id) {
                updates.previous_video_id = roomState.current_video_id;
            }

            await supabase.from('rooms').update(updates).eq('id', roomId);
        }
    };

    const handlePrevious = async () => {
        if (!roomState?.previous_video_id) return;

        const prevVideoId = roomState.previous_video_id;

        // push the currently playing video to the front of the queue
        if (roomState?.current_video_id) {
            // get the lowest sort_order to insert before it
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
                video_id: roomState.current_video_id,
                sort_order: insertOrder,
                added_by: visitorId
            });
        }

        // set the previous video as current, and clear previous_video_id
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

    const seekTime = roomState?.seek_time ?? 0;
    const duration = roomState?.duration ?? 0;

    return (
        <Container maxWidth="sm" sx={{ display: 'flex', flexDirection: 'column', height: '100%', py: 2, gap: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <IconButton onClick={onLeave} color="inherit">
                    <ArrowBackIcon />
                </IconButton>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {t('remote_control')}
                </Typography>
                <IconButton onClick={() => setShowInvite(true)} color="inherit">
                    <QrCodeIcon />
                </IconButton>
            </Box>

            {/* now playing */}
            <Card sx={{ p: 2 }}>
                {roomState?.current_video_id ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {/* thumbnail + info row */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            {currentMeta?.thumbnail ? (
                                <img src={currentMeta.thumbnail} alt="" style={{ width: 72, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                            ) : (
                                <Box sx={{ width: 72, height: 48, bgcolor: 'background.default', borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <MovieIcon />
                                </Box>
                            )}
                            <Box sx={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
                                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                                    {currentMeta?.title || t('loading')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>
                                    {currentMeta?.author || t('unknown')}
                                </Typography>
                            </Box>
                        </Box>

                        {/* seek slider + time */}
                        <Box sx={{ px: 0.5 }}>
                            <Slider
                                size="small"
                                min={0}
                                max={duration || 1}
                                value={isSeeking ? seekValue : seekTime}
                                onChange={(_e, val) => { setIsSeeking(true); setSeekValue(val as number); }}
                                onChangeCommitted={handleSeekCommit}
                                sx={{ py: 0.5 }}
                            />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption" color="text.secondary">
                                    {formatTime(isSeeking ? seekValue : seekTime)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {duration > 0 ? formatTime(duration) : '--:--'}
                                </Typography>
                            </Box>
                        </Box>

                        {/* controls row */}
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
                            <IconButton onClick={handlePrevious} disabled={!roomState?.previous_video_id} sx={{ width: 44, height: 44 }}>
                                <SkipPreviousIcon />
                            </IconButton>
                            <IconButton
                                onClick={handlePlayPause}
                                sx={{ width: 56, height: 56, bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
                            >
                                {roomState.playback_state === 'playing' ? <PauseIcon fontSize="large" /> : <PlayArrowIcon fontSize="large" />}
                            </IconButton>
                            <IconButton onClick={handleNext} sx={{ width: 44, height: 44 }}>
                                <SkipNextIcon />
                            </IconButton>
                        </Box>
                    </Box>
                ) : (
                    <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                        {t('nothing_playing_assistant')}
                    </Typography>
                )}
            </Card>

            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    {t('queue')}
                </Typography>
                <Queue roomId={roomId} />
            </Box>

            {showInvite && <InviteModal roomId={roomId} onClose={() => setShowInvite(false)} />}
        </Container>
    );
}
