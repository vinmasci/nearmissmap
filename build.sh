#!/bin/bash
# Replace placeholders in config.js with Vercel environment variables
sed -i.bak \
  -e "s|__MAPBOX_TOKEN__|${MAPBOX_TOKEN}|g" \
  -e "s|__GOOGLE_PLACES_KEY__|${GOOGLE_PLACES_KEY}|g" \
  -e "s|__FIREBASE_API_KEY__|${FIREBASE_API_KEY}|g" \
  config.js
rm -f config.js.bak
