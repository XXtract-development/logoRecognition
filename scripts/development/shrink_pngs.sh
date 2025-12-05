#!/bin/bash

# Gebruik: ./shrink_pngs.sh /Users/frisovanweelden/Documents/projects/logoRecognition/exampleLabels /Users/frisovanweelden/Documents/projects/logoRecognition/exampleLabels/png
SOURCE="$1"
TARGET="$2"

# Check of de directories bestaan
if [[ ! -d "$SOURCE" ]]; then
  echo "Source directory bestaat niet: $SOURCE"
  exit 1
fi

mkdir -p "$TARGET"

# Loop door alle PNG's in de source
find "$SOURCE" -type f -iname "*.png" | while read -r FILE; do
  FILESIZE=$(stat -f%z "$FILE")   # bestandsgrootte in bytes (MacOS)

  if (( FILESIZE > 500000 )); then
    BASENAME=$(basename "$FILE")
    DEST="$TARGET/$BASENAME"

    echo "Verkleinen: $BASENAME (was $((FILESIZE/1024)) KB)"

    # Eerst verkleinen met mogrify / convert tot max 500kb
    convert "$FILE" -define png:compression-level=9 -resize 50% -quality 85 "$DEST"

    # Check of nog steeds te groot is, herhaal met lagere kwaliteit indien nodig
    while (( $(stat -f%z "$DEST") > 500000 )); do
      convert "$DEST" -resize 90% -quality 85 "$DEST"
    done
  else
    echo "Overslaan: $(basename "$FILE") (kleiner dan 500kb)"
  fi
done