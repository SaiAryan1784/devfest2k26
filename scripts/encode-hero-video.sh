#!/usr/bin/env bash
# Encodes the billboard loop from the aftermovie source (never committed):
# five segments joined in order, two sizes, no audio, plus two poster frames.
# Usage: scripts/encode-hero-video.sh [source]   (default: docs/reference/video/GDG Noida 2025.mp4)
set -euo pipefail
SRC="${1:-docs/reference/video/GDG Noida 2025.mp4}"
OUT="public/video"
mkdir -p "$OUT"

# The cut: 0:07-0:17, 0:22-0:39, 0:48-0:51, 1:00-1:10, 1:15-1:21 (46 s). Hard edits.
SEG='[0:v]trim=7:17,setpts=PTS-STARTPTS[a];[0:v]trim=22:39,setpts=PTS-STARTPTS[b];[0:v]trim=48:51,setpts=PTS-STARTPTS[c];[0:v]trim=60:70,setpts=PTS-STARTPTS[d];[0:v]trim=75:81,setpts=PTS-STARTPTS[e];[a][b][c][d][e]concat=n=5:v=1:a=0,fps=25[v]'

echo "1080p"
ffmpeg -y -loglevel error -stats -i "$SRC" -filter_complex "$SEG;[v]scale=1920:-2:flags=lanczos[o]" -map "[o]" \
  -c:v libx264 -preset slow -crf 26 -maxrate 3400k -bufsize 6800k -profile:v high -pix_fmt yuv420p -movflags +faststart -an "$OUT/hero-1080.mp4"

echo "720p"
ffmpeg -y -loglevel error -stats -i "$SRC" -filter_complex "$SEG;[v]scale=1280:-2:flags=lanczos[o]" -map "[o]" \
  -c:v libx264 -preset slow -crf 28 -maxrate 1100k -bufsize 2200k -profile:v main -pix_fmt yuv420p -movflags +faststart -an "$OUT/hero-720.mp4"

echo "posters (the loop's first frame, 0:07 in the source): PNG from ffmpeg, WebP via sharp (this ffmpeg has no libwebp)"
ffmpeg -y -loglevel error -ss 7 -i "$SRC" -frames:v 1 -vf "scale=1920:-2:flags=lanczos" "$OUT/hero-poster.png"
node -e '
const sharp = require("sharp");
(async () => {
  await sharp("public/video/hero-poster.png").webp({ quality: 78 }).toFile("public/video/hero-poster.webp");
  await sharp("public/video/hero-poster.png").resize(1280).webp({ quality: 76 }).toFile("public/video/hero-poster-720.webp");
})();
'
rm -f "$OUT/hero-poster.png"

ls -la "$OUT"
