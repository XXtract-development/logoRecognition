#!/bin/bash
# rename_files.sh
#
# Gebruik: ./rename_files.sh mapping.txt /pad/naar/source /pad/naar/target

MAPPING_FILE="$1"
SOURCE="$2"
TARGET="$3"

if [[ ! -f "$MAPPING_FILE" ]]; then
  echo "Mapping bestand niet gevonden: $MAPPING_FILE"
  exit 1
fi

if [[ ! -d "$SOURCE" ]]; then
  echo "Source directory niet gevonden: $SOURCE"
  exit 1
fi

mkdir -p "$TARGET"

while IFS=, read -r OLD NEW; do
  [[ -z "$OLD" || -z "$NEW" ]] && continue  # lege regels overslaan

  # Zoek bestand (maakt niet uit welke extensie, pas aan indien nodig)
  FILE=$(find "$SOURCE" -maxdepth 1 -type f -name "${OLD}.*" | head -n 1)

  if [[ -z "$FILE" ]]; then
    echo "Bestand niet gevonden voor $OLD"
    continue
  fi

  EXT="${FILE##*.}"         # extensie behouden
  BASENAME="$NEW.$EXT"      # nieuwe bestandsnaam
  TARGETFILE="$TARGET/$BASENAME"

  if [[ -e "$TARGETFILE" ]]; then
    seq=1
    while :; do
      SEQ=$(printf "%02d" "$seq")
      BASENAME="${NEW}_${SEQ}.$EXT"
      TARGETFILE="$TARGET/$BASENAME"
      [[ ! -e "$TARGETFILE" ]] && break
      ((seq++))
    done
  fi

  cp "$FILE" "$TARGETFILE"
  echo "Gekopieerd & hernoemd: $(basename "$FILE") → $BASENAME"
done < "$MAPPING_FILE"