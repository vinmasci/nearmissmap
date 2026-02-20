#!/bin/bash
# Generate config.js from Vercel environment variables
cat > config.js << JSEOF
window.APP_CONFIG = {
  MAPBOX_TOKEN: '${MAPBOX_TOKEN}',
  GOOGLE_PLACES_KEY: '${GOOGLE_PLACES_KEY}',
  FIREBASE_CONFIG: {
    apiKey: '${FIREBASE_API_KEY}',
    authDomain: 'cyaroutes.firebaseapp.com',
    projectId: 'cyaroutes',
    storageBucket: 'cyaroutes.firebasestorage.app',
    messagingSenderId: '601003510442',
    appId: '1:601003510442:web:a91daf9016922656a89ed3'
  }
};
JSEOF
echo "config.js generated"
