'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getVisitorId } from '@/lib/visitor';
import { v4 as uuidv4 } from 'uuid';

import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';

import DeleteIcon from '@mui/icons-material/Delete';
import MovieIcon from '@mui/icons-material/Movie';
import LinkIcon from '@mui/icons-material/Link';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useTranslation } from '@/lib/i18n';

interface QueueProps {
    roomId: string;
}

interface QueueItem {
    id: string;
    room_id: string;
    video_id: string;
    sort_order: number;
    added_by: string;
    metadata?: any;
}

function extractVideoId(url: string) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/);
    
    return match ? match[1] : null;
}

export default function Queue({ roomId }: QueueProps) {
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [inputValue, setInputValue] = useState('');
    const visitorId = getVisitorId();
    const { t } = useTranslation();

    const fetchQueue = useCallback(async () => {
        const { data: queueData } = await supabase
            .from('queue')
            .select('*')
            .eq('room_id', roomId)
            .order('sort_order', { ascending: true });

        if (queueData) {
            const videoIds = queueData.map(q => q.video_id);
            let metadataMap: Record<string, any> = {};

            if (videoIds.length > 0) {
                const { data: metadataData } = await supabase
                    .from('metadata_cache')
                    .select('*')
                    .in('video_id', videoIds);

                metadataMap = (metadataData || []).reduce((acc: any, curr: any) => {
                    acc[curr.video_id] = curr;
                    return acc;
                }, {});
            }

            setQueue(queueData.map(q => ({ ...q, metadata: metadataMap[q.video_id] })));
        }
    }, [roomId]);

    useEffect(() => {
        fetchQueue();

        const queueChannel = supabase.channel(`queue:${roomId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue', filter: `room_id=eq.${roomId}` }, () => {
                fetchQueue();
            })
            .subscribe();

        const metaCacheChannel = supabase.channel(`metacache:${roomId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'metadata_cache' }, () => {
                fetchQueue();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(queueChannel);
            supabase.removeChannel(metaCacheChannel);
        };
    }, [roomId, fetchQueue]);

    const handleAddVideo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue) return;

        const videoId = extractVideoId(inputValue);
        if (!videoId) {
            alert(t('invalid_url'));
            return;
        }
        setInputValue('');

        // always add to queue immediately
        const queueItemId = await addToQueue(videoId);
        if (!queueItemId) return;

        // auto-play: if nothing is currently playing, start with this video
        await autoPlayIfIdle(videoId, queueItemId);

        // request metadata via the edge function
        try {
            const { data, error } = await supabase.functions.invoke('fetch_youtube_video_metadata', {
                body: { queue_item_id: queueItemId, room_id: roomId }
            });

            if (error) {
                console.error(`[Queue] Edge function error for ${videoId}:`, error);
                return;
            }

            if (data?.status === 'pending') {
                // metadata is being fetched by another request, so subscribe and wait
                const metaChannel = supabase.channel(`meta:${videoId}:${Date.now()}`)
                    .on('postgres_changes', {
                        event: '*',
                        schema: 'public',
                        table: 'metadata_cache',
                        filter: `video_id=eq.${videoId}`
                    }, (payload) => {
                        const newMeta = payload.new as any;
                        if (newMeta && newMeta.status === 'complete') {
                            supabase.removeChannel(metaChannel);
                            fetchQueue();
                        }
                    })
                    .subscribe();
                return;
            }

            if (data?.status === 'complete') {
                // metadata just arrived, so refresh the queue to show it
                fetchQueue();
            }

            if (data?.error) {
                console.error(`[Queue] Metadata fetch failed for ${videoId}:`, data.error);
            }
        } catch (err) {
            console.error(`[Queue] Failed to invoke fetch_youtube_video_metadata for ${videoId}:`, err);
        }
    };

    const addToQueue = async (videoId: string): Promise<string | null> => {
        // get max sort order
        const { data } = await supabase
            .from('queue')
            .select('sort_order')
            .eq('room_id', roomId)
            .order('sort_order', { ascending: false })
            .limit(1);

        const nextOrder = data && data.length > 0 ? data[0].sort_order + 1 : 1;
        const queueItemId = uuidv4();

        // insert
        const { error } = await supabase.from('queue').insert({
            id: queueItemId,
            room_id: roomId,
            video_id: videoId,
            sort_order: nextOrder,
            added_by: visitorId
        });

        if (error) {
            console.error('[Queue] Failed to add to queue:', error);
            return null;
        }

        return queueItemId;
    };

    const autoPlayIfIdle = async (videoId: string, queueItemId: string) => {
        // check if the room currently has a video playing
        const { data: room } = await supabase
            .from('rooms')
            .select('current_video_id')
            .eq('id', roomId)
            .single();

        if (room && !room.current_video_id) {
            // nothing is playing
            await supabase.from('rooms').update({
                current_video_id: videoId,
                playback_state: 'playing',
                seek_time: 0,
                last_updated_by: visitorId,
                last_activity: new Date().toISOString()
            }).eq('id', roomId);

            // remove from queue since it's now playing
            await supabase.from('queue').delete().eq('id', queueItemId);
        }
    };

    const handleMoveUp = async (index: number) => {
        if (index <= 0) return;
        const current = queue[index];
        const above = queue[index - 1];
        // swap sort_order values
        await supabase.from('queue').update({ sort_order: above.sort_order }).eq('id', current.id);
        await supabase.from('queue').update({ sort_order: current.sort_order }).eq('id', above.id);
        fetchQueue();
    };

    const handleMoveDown = async (index: number) => {
        if (index >= queue.length - 1) return;
        const current = queue[index];
        const below = queue[index + 1];
        // swap sort_order values
        await supabase.from('queue').update({ sort_order: below.sort_order }).eq('id', current.id);
        await supabase.from('queue').update({ sort_order: current.sort_order }).eq('id', below.id);
        fetchQueue();
    };

    const handleRemove = async (id: string) => {
        setQueue(prev => prev.filter(item => item.id !== id));
        await supabase.from('queue').delete().eq('id', id);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            <Box component="form" onSubmit={handleAddVideo} sx={{ display: 'flex', gap: 1 }}>
                <TextField
                    type="url"
                    placeholder={t('paste_url')}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    size="small"
                    fullWidth
                    variant="outlined"
                />
                <Button type="submit" variant="contained" disabled={!inputValue} disableElevation>
                    {t('add')}
                </Button>
            </Box>

            <List sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1, p: 0 }}>
                {queue.length === 0 ? (
                    <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                        {t('queue_empty')}
                    </Typography>
                ) : null}

                {queue.map((item, index) => (
                    <ListItem
                        key={item.id}
                        sx={{ bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider', alignItems: 'center', pr: 1, pl: 1, py: 1 }}
                    >
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 24, flexShrink: 0 }}>
                            {index + 1}
                        </Typography>
                        <ListItemAvatar sx={{ minWidth: 80, mr: 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                            {item.metadata?.thumbnail ? (
                                <img src={item.metadata.thumbnail} alt="" style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
                            ) : (
                                <Box sx={{ width: 64, height: 36, bgcolor: 'background.default', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {item.metadata?.title ? <MovieIcon fontSize="small" /> : <LinkIcon fontSize="small" />}
                                </Box>
                            )}
                        </ListItemAvatar>
                        
                        <Box sx={{ flex: 1, minWidth: 0, mr: 1 }}>
                            {item.metadata?.title ? (
                                <ListItemText
                                    primary={item.metadata.title}
                                    secondary={item.metadata?.author || item.video_id}
                                    slotProps={{
                                        primary: { noWrap: true, variant: 'body2', sx: { fontWeight: 500 } },
                                        secondary: { noWrap: true, variant: 'caption' }
                                    }}
                                    sx={{ m: 0 }}
                                />
                            ) : (
                                <ListItemText
                                    primary={
                                        <Link
                                            href={`https://youtu.be/${item.video_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            color="primary"
                                            underline="hover"
                                            variant="body2"
                                            sx={{ fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        >
                                            youtu.be/{item.video_id}
                                        </Link>
                                    }
                                    secondary={t('no_metadata')}
                                    slotProps={{
                                        secondary: { variant: 'caption' }
                                    }}
                                    sx={{ m: 0 }}
                                />
                            )}
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                <IconButton size="small" aria-label="move up" onClick={() => handleMoveUp(index)} disabled={index === 0} sx={{ p: 0.25 }}>
                                    <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                                <IconButton size="small" aria-label="move down" onClick={() => handleMoveDown(index)} disabled={index === queue.length - 1} sx={{ p: 0.25 }}>
                                    <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Box>
                            <IconButton size="small" aria-label="delete" onClick={() => handleRemove(item.id)}>
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </ListItem>
                ))}
            </List>
        </Box>
    );
}
