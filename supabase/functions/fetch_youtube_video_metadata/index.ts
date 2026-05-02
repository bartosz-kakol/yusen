import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const { queue_item_id, room_id } = await req.json();
    if (!queue_item_id || !room_id) {
      return jsonResponse(
        { error: "queue_item_id and room_id are required" },
        400,
      );
    }

    let videoId: string | null = null;

    const fetchQueueItem = async () => {
      const { data, error } = await supabase
        .from("queue")
        .select("video_id")
        .eq("id", queue_item_id)
        .single();
      if (error || !data) return null;
      return data.video_id;
    };

    videoId = await fetchQueueItem();

    if (!videoId) {
      const { data: room } = await supabase
        .from("rooms")
        .select("current_video_id")
        .eq("id", room_id)
        .single();

      if (room?.current_video_id) {
        videoId = room.current_video_id;
      }
    }

    if (!videoId) {
      // try again, was this a timing issue?
      await new Promise((resolve) => setTimeout(resolve, 2000));
      videoId = await fetchQueueItem();
    }

    if (!videoId) {
      return jsonResponse(
        { error: "Video not found in queue or room." },
        404,
      );
    }

    const { data: cached } = await supabase
      .from("metadata_cache")
      .select("*")
      .eq("video_id", videoId)
      .single();

    if (cached) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      const isStale = age > SEVEN_DAYS_MS;

      if (cached.status === "complete" && !isStale) {
        return jsonResponse({
          status: "complete",
          video_id: videoId,
          title: cached.title,
          thumbnail: cached.thumbnail,
          author: cached.author,
        });
      }

      if (cached.status === "pending" && !isStale) {
        return jsonResponse({
          status: "pending",
          video_id: videoId,
          message:
            "Metadata is being fetched. Subscribe to metadata_cache for updates.",
        });
      }
    }

    await supabase.from("metadata_cache").upsert({
      video_id: videoId,
      status: "pending",
      updated_at: new Date().toISOString(),
    });

    const apiKey = Deno.env.get("YOUTUBE_DATA_API_KEY");
    if (!apiKey) {
      return jsonResponse(
        { error: "YOUTUBE_DATA_API_KEY is not configured" },
        500,
      );
    }

    const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    apiUrl.searchParams.set("part", "snippet");
    apiUrl.searchParams.set("id", videoId);
    apiUrl.searchParams.set("key", apiKey);

    const apiResponse = await fetch(apiUrl.toString());
    const apiData = await apiResponse.json();

    if (!apiResponse.ok) {
      await supabase.from("metadata_cache").update({
        status: "error",
        updated_at: new Date().toISOString(),
      }).eq("video_id", videoId);

      console.error(
        "[fetch_youtube_video_metadata] YouTube API error:",
        apiData,
      );
      return jsonResponse(
        { error: "YouTube API request failed", details: apiData.error },
        502,
      );
    }

    const items = apiData.items;
    if (!items || items.length === 0) {
      await supabase.from("metadata_cache").update({
        status: "error",
        updated_at: new Date().toISOString(),
      }).eq("video_id", videoId);

      return jsonResponse({ error: "Video not found on YouTube" }, 404);
    }

    const snippet = items[0].snippet;
    const title = snippet.title ?? "Unknown Title";
    const author = snippet.channelTitle ?? "Unknown Author";
    const thumbnails = snippet.thumbnails ?? {};
    const thumbnail = thumbnails.maxres?.url ??
      thumbnails.high?.url ??
      thumbnails.medium?.url ??
      thumbnails.default?.url ??
      "";

    const { error: updateError } = await supabase.from("metadata_cache")
      .update({
        title,
        thumbnail,
        author,
        status: "complete",
        updated_at: new Date().toISOString(),
      }).eq("video_id", videoId);

    if (updateError) {
      console.error(
        "[fetch_youtube_video_metadata] Cache update error:",
        updateError,
      );
    }

    return jsonResponse({
      status: "complete",
      video_id: videoId,
      title,
      thumbnail,
      author,
    });
  } catch (error) {
    console.error("[fetch_youtube_video_metadata] Unexpected error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
