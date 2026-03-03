#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────
# OSRM Data Update Script
#
# Downloads the latest Geofabrik Nordeste extract, processes it with
# OSRM (extract → partition → customize), then swaps the processed
# data into the live volume and restarts the container.
#
# Intended for monthly runs (Geofabrik updates daily, but road network
# changes are infrequent for our region). Downtime is minimal — only
# the final swap + restart takes the service offline briefly.
#
# Usage:
#   ./update-data.sh
#
# Prerequisites:
#   - Docker installed and running
#   - Sufficient disk space (~2-3 GB for Nordeste extract + processed)
# ──────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OSRM_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$OSRM_DIR/data"
TEMP_DIR="$OSRM_DIR/data-tmp"
DOWNLOAD_URL="https://download.geofabrik.de/south-america/brazil/nordeste-latest.osm.pbf"
PBF_FILE="nordeste-latest.osm.pbf"
OSRM_IMAGE="osrm/osrm-backend:latest"

echo "==> Starting OSRM data update"
echo "    Data dir: $DATA_DIR"
echo "    Temp dir: $TEMP_DIR"

# 1. Download latest Geofabrik Nordeste extract to temp directory
echo "==> Downloading Nordeste extract..."
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"
curl -fSL -o "$TEMP_DIR/$PBF_FILE" "$DOWNLOAD_URL"
echo "    Download complete."

# 2. Process with OSRM: extract → partition → customize
echo "==> Running osrm-extract..."
docker run --rm -v "$TEMP_DIR:/data" "$OSRM_IMAGE" \
  osrm-extract -p /opt/car.lua "/data/$PBF_FILE"

echo "==> Running osrm-partition..."
docker run --rm -v "$TEMP_DIR:/data" "$OSRM_IMAGE" \
  osrm-partition /data/nordeste-latest.osrm

echo "==> Running osrm-customize..."
docker run --rm -v "$TEMP_DIR:/data" "$OSRM_IMAGE" \
  osrm-customize /data/nordeste-latest.osrm

echo "    Processing complete."

# 3. Swap processed data into the OSRM data volume (minimal downtime)
echo "==> Swapping data..."
if [ -d "$DATA_DIR" ]; then
  OLD_DIR="$OSRM_DIR/data-old"
  rm -rf "$OLD_DIR"
  mv "$DATA_DIR" "$OLD_DIR"
fi
mv "$TEMP_DIR" "$DATA_DIR"

# 4. Restart the OSRM container
echo "==> Restarting OSRM container..."
cd "$OSRM_DIR"
docker compose restart osrm

# Clean up old data
if [ -d "$OSRM_DIR/data-old" ]; then
  echo "==> Cleaning up old data..."
  rm -rf "$OSRM_DIR/data-old"
fi

echo "==> OSRM data update complete."
