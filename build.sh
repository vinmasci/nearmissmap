#!/bin/bash
# Generate config.js from Vercel environment variables using node for reliable string handling
node -e "
const fs = require('fs');
const config = \`window.APP_CONFIG = {
  MAPBOX_TOKEN: '\${process.env.MAPBOX_TOKEN || ''}',
  GOOGLE_PLACES_KEY: '\${process.env.GOOGLE_PLACES_KEY || ''}',
  FIREBASE_CONFIG: {
    apiKey: '\${process.env.FIREBASE_API_KEY || ''}',
    authDomain: 'cyaroutes.firebaseapp.com',
    projectId: 'cyaroutes',
    storageBucket: 'cyaroutes.firebasestorage.app',
    messagingSenderId: '601003510442',
    appId: '1:601003510442:web:a91daf9016922656a89ed3'
  }
};\`;
fs.writeFileSync('config.js', config);
console.log('config.js generated');
console.log('MAPBOX_TOKEN length:', (process.env.MAPBOX_TOKEN || '').length);
console.log('FIREBASE_API_KEY length:', (process.env.FIREBASE_API_KEY || '').length);
"
