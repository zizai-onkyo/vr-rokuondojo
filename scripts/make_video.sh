#!/usr/bin/env bash
# Convert an in-app WebM recording to an upload-ready MP4 (H.264 / AAC, 1080p, 60fps).
# Audio: a single static gain so the peak lands at -1 dBFS (no dynamic normalisation — the room tone and
# noise floor are part of the piece and must stay quiet while nothing happens).
# Usage: scripts/make_video.sh recordings/award_take.webm [out.mp4]
set -euo pipefail
IN="${1:?input webm}"
OUT="${2:-${IN%.webm}.mp4}"
MAX=$(ffmpeg -hide_banner -i "$IN" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-\{0,1\}[0-9.]*\) dB.*/\1/p')
GAIN=$(python3 -c "print(round(-1.0 - float('${MAX:-0}'), 2))")
echo "peak ${MAX} dB → gain ${GAIN} dB"
ffmpeg -y -hide_banner -loglevel error -i "$IN" \
  -vf "fps=60,scale=1920:1080:flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset slow -crf 18 -profile:v high -level 4.2 -movflags +faststart \
  -af "volume=${GAIN}dB" -c:a aac -b:a 192k -ar 48000 \
  "$OUT"
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height,r_frame_rate -of compact "$OUT"
echo "wrote $OUT"
