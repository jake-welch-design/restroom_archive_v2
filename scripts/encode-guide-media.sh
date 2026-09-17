#!/usr/bin/env bash
#
# Encodes the Archivist Guide's source recordings into the web assets
# GuideVideo expects: an mp4, a webm, and a poster frame per clip.
#
# The sources are phone and desktop screen recordings kept outside the repo
# (~24MB each at 1080p60); only the encoded output is committed. Re-run this
# after re-recording a clip, or for a new one, then pass the basename to
# <GuideVideo name="...">.
#
# Usage:
#   scripts/encode-guide-media.sh [SOURCE_DIR]
#
# SOURCE_DIR defaults to the guide folder on Jake's desktop.

set -euo pipefail

SRC="${1:-$HOME/Desktop/Projects/Personal/The Restroom Archive/Guides/Website guide}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/guide"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)" >&2; exit 1; }
[ -d "$SRC" ] || { echo "source dir not found: $SRC" >&2; exit 1; }

mkdir -p "$OUT"

# CRF pairs are matched by eye per kind of footage, not held at one number.
#
# The screen recordings carry small UI text that goes mushy well before the
# footage does, so they stay at x264 CRF 23 and full 1080. The handheld
# scanning footage is the opposite case: real-world, noisy, and the one clip
# where 1080 cost 12MB, so it drops to 720 at CRF 28 for 2.6MB and no visible
# loss at the size it's displayed.
#
# Everything drops to 30fps — these are 60fps captures of a guide clip, where
# the second half of those frames is pure bitrate.
#
# -an is belt and braces: the sources have no audio track to begin with, and
# the player is built on the assumption that none arrives.
encode() {
  local in="$1" name="$2" crf="$3" vp9crf="$4" scale="${5:-}"
  local vf=()
  [ -n "$scale" ] && vf=(-vf "scale=$scale")

  echo "→ $name"
  ffmpeg -y -v error -i "$in" -an -r 30 "${vf[@]}" \
    -c:v libx264 -crf "$crf" -preset slow -pix_fmt yuv420p \
    -movflags +faststart "$OUT/$name.mp4"

  ffmpeg -y -v error -i "$in" -an -r 30 "${vf[@]}" \
    -c:v libvpx-vp9 -crf "$vp9crf" -b:v 0 -row-mt 1 -pix_fmt yuv420p \
    "$OUT/$name.webm"

  # First frame, for a refused autoplay and for reduced-motion readers.
  ffmpeg -y -v error -ss 0 -i "$in" -frames:v 1 "${vf[@]}" -q:v 4 \
    "$OUT/$name-poster.jpg"
}

encode "$SRC/Scan demo.mp4" scan-demo 28 36 720:720
encode "$SRC/reprocess.mp4" reprocess 23 32
encode "$SRC/download.mp4" download 23 32
encode "$SRC/Upload.mp4" upload 23 32

# Stills are already well under 250KB at 1080 square and are displayed at 460,
# so they are copied rather than re-encoded.
for still in holes blur drift; do
  cp "$SRC/$still.jpg" "$OUT/$still.jpg"
done

echo
du -sh "$OUT"
