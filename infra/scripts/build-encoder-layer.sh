#!/bin/sh
# Builds the Lambda layer that gives the API an ffmpeg for MP3 and M4A exports of recordings
# (5.6; services/api providers/audio_encoding.py). Output: infra/envs/dev/.build/encoder-layer.zip,
# which modules/encoder_layer publishes. The zip is build output and is never committed.
#
# The binary is John Van Sickle's static arm64 build (the Lambda functions run on arm64), pinned
# by version and SHA-256 so a changed download is refused. It is GPLv3; it runs on our server
# and is not distributed, and its licence file travels inside the layer.
set -eu

VERSION="7.0.2"
SHA256="f4149bb2b0784e30e99bdda85471c9b5930d3402014e934a5098b41d0f7201b1"
NAME="ffmpeg-${VERSION}-arm64-static"
# The current release lives under releases/, older ones under old-releases/.
URLS="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz
https://johnvansickle.com/ffmpeg/old-releases/${NAME}.tar.xz"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/envs/dev/.build/encoder-layer.zip"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ok=""
for url in $URLS; do
  if curl -fsSL --max-time 300 -o "$WORK/ffmpeg.tar.xz" "$url" &&
    [ "$(shasum -a 256 "$WORK/ffmpeg.tar.xz" | cut -d' ' -f1)" = "$SHA256" ]; then
    ok="yes"
    break
  fi
done
[ -n "$ok" ] || { echo "No download of ffmpeg ${VERSION} matched the pinned SHA-256." >&2; exit 1; }

# A layer is unpacked under /opt, so bin/ffmpeg becomes /opt/bin/ffmpeg.
mkdir -p "$WORK/layer/bin"
tar -xJf "$WORK/ffmpeg.tar.xz" -C "$WORK" "${NAME}/ffmpeg" "${NAME}/GPLv3.txt"
mv "$WORK/${NAME}/ffmpeg" "$WORK/layer/bin/ffmpeg"
mv "$WORK/${NAME}/GPLv3.txt" "$WORK/layer/bin/ffmpeg-GPLv3.txt"
chmod 755 "$WORK/layer/bin/ffmpeg"

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
(cd "$WORK/layer" && zip -qr -X "$OUT" bin)
echo "Built $OUT"
