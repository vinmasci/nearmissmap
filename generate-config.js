const fs = require('fs');

const mapboxToken = (process.env.MAPBOX_TOKEN || '').trim();
const placesKey = (process.env.GOOGLE_PLACES_KEY || '').trim();
const firebaseKey = (process.env.FIREBASE_API_KEY || '').trim();

const config = `window.APP_CONFIG = {
  MAPBOX_TOKEN: '${mapboxToken}',
  GOOGLE_PLACES_KEY: '${placesKey}',
  FIREBASE_CONFIG: {
    apiKey: '${firebaseKey}',
    authDomain: 'cyaroutes.firebaseapp.com',
    projectId: 'cyaroutes',
    storageBucket: 'cyaroutes.firebasestorage.app',
    messagingSenderId: '601003510442',
    appId: '1:601003510442:web:a91daf9016922656a89ed3'
  }
};
`;

fs.writeFileSync('config.js', config);
console.log('config.js generated');
console.log('First 80 chars:', config.substring(0, 80));
