// ============================================
// NEAR MISS MAP
// ============================================

const config = window.APP_CONFIG || {};
mapboxgl.accessToken = config.MAPBOX_TOKEN || '';

// ============================================
// FIREBASE
// ============================================

const firebaseConfig = config.FIREBASE_CONFIG || {};
let db = null;
let auth = null;
let storage = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  auth = firebase.auth();
  storage = firebase.storage();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
} catch (e) {
  console.warn('Firebase initialization failed:', e.message);
}

// ============================================
// STATE
// ============================================

let currentUser = null;
let isAdmin = false;
let map = null;
let placeholderMarker = null;
let reportCoords = null; // [lng, lat]
let isPlacingMarker = false;
let incidentsData = { type: 'FeatureCollection', features: [] };
let annoyancesData = { type: 'FeatureCollection', features: [] };
let reportMode = 'incident'; // 'incident' or 'annoyance'

// Form state
let selectedType = null;
let selectedScariness = null;
let selectedParty = null;
let contactMade = null;
let injuryOccurred = null;
let selectedReporter = null;
let currentInfrastructure = null;

// Annoyance form state
let selectedAnnoyanceType = null;
let selectedOngoing = null;

// ============================================
// SCARINESS COLORS (replaces severity)
// ============================================

const SCARINESS_COLORS = {
  not_scary: '#22c55e',
  a_bit_scary: '#f59e0b',
  fairly_scary: '#f97316',
  very_scary: '#ef4444'
};

const SCARINESS_LABELS = {
  not_scary: 'Not Scary',
  a_bit_scary: 'A Bit Scary',
  fairly_scary: 'Fairly Scary',
  very_scary: 'Very Scary'
};

const SCARINESS_DESCRIPTIONS = {
  not_scary: 'Mildly unsettling — e.g. unnecessary honking, minor obstruction.',
  a_bit_scary: 'Felt unsafe but had room to react — e.g. close pass with space to move.',
  fairly_scary: 'Genuinely frightening — e.g. had to brake hard or swerve to avoid collision.',
  very_scary: 'Terrifying — e.g. deliberate aggression, actual collision, or narrowly avoided serious injury.'
};

// ============================================
// TYPE LABELS (13 DCA-based categories)
// ============================================

const TYPE_LABELS = {
  intersection: 'Intersection',
  same_direction: 'Sideswipe / Rear End',
  driveway_uturn: 'Driveway / U-Turn',
  dooring: 'Dooring',
  loss_of_control: 'Loss of Control',
  hit_parked: 'Hit Parked Car',
  parking: 'Parking Manoeuvre',
  head_on: 'Head-On',
  pedestrian: 'Pedestrian',
  overtaking: 'Close Pass',
  struck_object: 'Struck Object / Animal',
  road_rage: 'Road Rage',
  other: 'Other'
};

const TYPE_DESCRIPTIONS = {
  intersection: 'Collision or near miss at an intersection — e.g. right hook, left hook, cross traffic, or turning conflict.',
  same_direction: 'Hit from behind or side by a vehicle travelling the same direction — e.g. rear end, lane sideswipe, or left turn cut-off.',
  driveway_uturn: 'Vehicle pulling out of a driveway, side street, or making a U-turn across your path.',
  dooring: 'A parked car door opened into your path — whether you hit it or swerved to avoid it.',
  loss_of_control: 'Single-bike crash — e.g. slipped on wet surface, hit a pothole, or lost control on a bend.',
  hit_parked: 'Collided with or swerved to avoid a vehicle parked in or near the bike lane.',
  parking: 'Vehicle entering or leaving a parking space crossed your path.',
  head_on: 'Vehicle coming towards you in the opposite direction — e.g. on wrong side of road or shared path.',
  pedestrian: 'Conflict with a pedestrian — e.g. stepped out onto path, crossing road, or walking in bike lane.',
  overtaking: 'Vehicle passed too close while overtaking — the classic "close pass" or "punishment pass".',
  struck_object: 'Hit an object on the road (debris, branch, bollard) or an animal ran into your path.',
  road_rage: 'Deliberate intimidation, verbal abuse, or aggressive driving directed at you.',
  other: 'Anything not covered above — describe what happened in the details.'
};

// Font Awesome icon classes for popups
const TYPE_ICONS = {
  intersection: '<i class="fa-solid fa-shuffle" style="font-size:14px"></i>',
  same_direction: '<i class="fa-solid fa-car-rear" style="font-size:14px"></i>',
  driveway_uturn: '<i class="fa-solid fa-rotate-left" style="font-size:14px"></i>',
  dooring: '<i class="fa-solid fa-door-open" style="font-size:14px"></i>',
  loss_of_control: '<i class="fa-solid fa-person-falling" style="font-size:14px"></i>',
  hit_parked: '<i class="fa-solid fa-square-parking" style="font-size:14px"></i>',
  parking: '<i class="fa-solid fa-car-side" style="font-size:14px"></i>',
  head_on: '<i class="fa-solid fa-car-burst" style="font-size:14px"></i>',
  pedestrian: '<i class="fa-solid fa-person-walking" style="font-size:14px"></i>',
  overtaking: '<i class="fa-solid fa-angles-right" style="font-size:14px"></i>',
  struck_object: '<i class="fa-solid fa-triangle-exclamation" style="font-size:14px"></i>',
  road_rage: '<i class="fa-solid fa-face-angry" style="font-size:14px"></i>',
  other: '<i class="fa-solid fa-circle-question" style="font-size:14px"></i>'
};

// Font Awesome 6 Free Solid unicode values for canvas rendering
const TYPE_FA_UNICODE = {
  intersection: '\uf074',
  same_direction: '\uf5de',
  driveway_uturn: '\uf0e2',
  dooring: '\uf52b',
  loss_of_control: '\ue546',
  hit_parked: '\uf540',
  parking: '\uf5e4',
  head_on: '\uf5e1',
  pedestrian: '\uf554',
  overtaking: '\uf101',
  struck_object: '\uf071',
  road_rage: '\uf556',
  other: '\uf059'
};

// ============================================
// ANNOYANCE TYPES & LEVELS
// ============================================

const ANNOYANCE_TYPE_LABELS = {
  blocked_lane: 'Blocked Bike Lane', poor_surface: 'Poor Surface',
  glass_debris: 'Glass / Debris', overgrown: 'Overgrown',
  faded_markings: 'Faded Markings', no_infrastructure: 'No Bike Infra',
  poor_signage: 'Poor Signage', traffic_lights: 'Traffic Lights',
  pinch_point: 'Pinch Point', poor_lighting: 'Poor Lighting',
  path_ends: 'Path Ends', dog_off_leash: 'Dog Off Leash',
  bad_intersection: 'Bad Intersection', flooding: 'Flooding', other: 'Other'
};

const ANNOYANCE_TYPE_DESCRIPTIONS = {
  blocked_lane: 'Bike lane blocked by parked cars, bins, construction, or other obstructions.',
  poor_surface: 'Potholes, cracks, uneven pavement, or badly maintained road surface.',
  glass_debris: 'Broken glass, branches, rubbish, or other debris on the road or path.',
  overgrown: 'Trees, shrubs, or grass encroaching on the bike lane or shared path.',
  faded_markings: 'Worn out bike lane markings, missing lane dividers, or unclear road paint.',
  no_infrastructure: 'A road or area that really needs a bike lane or shared path but doesn\'t have one.',
  poor_signage: 'Missing, confusing, or misleading signs for cyclists.',
  traffic_lights: 'Lights that don\'t detect bikes, excessively long waits, or poorly timed signals.',
  pinch_point: 'Road narrows dangerously, forcing bikes and cars into close proximity.',
  poor_lighting: 'Dark section of road or path that needs better lighting for safety.',
  path_ends: 'Bike lane or path abruptly ends, forcing you to merge into traffic with no transition.',
  dog_off_leash: 'Unleashed dogs on shared paths creating hazards for cyclists.',
  bad_intersection: 'Intersection design is unsafe or confusing for cyclists — poor sight lines, no bike box, etc.',
  flooding: 'Path or road regularly floods or has poor drainage, making it impassable after rain.',
  other: 'Anything else that makes cycling annoying — describe it below.'
};

const ANNOYANCE_TYPE_ICONS = {
  blocked_lane: '<i class="fa-solid fa-road-barrier" style="font-size:14px"></i>',
  poor_surface: '<i class="fa-solid fa-road-circle-exclamation" style="font-size:14px"></i>',
  glass_debris: '<i class="fa-solid fa-burst" style="font-size:14px"></i>',
  overgrown: '<i class="fa-solid fa-leaf" style="font-size:14px"></i>',
  faded_markings: '<i class="fa-solid fa-border-none" style="font-size:14px"></i>',
  no_infrastructure: '<i class="fa-solid fa-ban" style="font-size:14px"></i>',
  poor_signage: '<i class="fa-solid fa-signs-post" style="font-size:14px"></i>',
  traffic_lights: '<i class="fa-solid fa-traffic-light" style="font-size:14px"></i>',
  pinch_point: '<i class="fa-solid fa-right-left" style="font-size:14px"></i>',
  poor_lighting: '<i class="fa-regular fa-lightbulb" style="font-size:14px"></i>',
  path_ends: '<i class="fa-solid fa-road-circle-xmark" style="font-size:14px"></i>',
  dog_off_leash: '<i class="fa-solid fa-dog" style="font-size:14px"></i>',
  bad_intersection: '<i class="fa-solid fa-diamond-turn-right" style="font-size:14px"></i>',
  flooding: '<i class="fa-solid fa-water" style="font-size:14px"></i>',
  other: '<i class="fa-solid fa-circle-question" style="font-size:14px"></i>'
};

const ANNOYANCE_FA_UNICODE = {
  blocked_lane: '\ue562', poor_surface: '\ue565', glass_debris: '\ue4dc',
  overgrown: '\uf06c', faded_markings: '\uf850', no_infrastructure: '\uf05e',
  poor_signage: '\uf277', traffic_lights: '\uf637', pinch_point: '\uf362',
  poor_lighting: '\uf0eb', path_ends: '\ue566', dog_off_leash: '\uf6d3',
  bad_intersection: '\uf5eb', flooding: '\uf773', other: '\uf059'
};

const ANNOYANCE_MARKER_COLOR = '#f59e0b';

// ============================================
// INFRASTRUCTURE AUTO-DETECTION (OSM Overpass)
// ============================================

const ROAD_TYPE_LABELS = {
  motorway: 'Motorway', trunk: 'Trunk Road', primary: 'Primary Road',
  secondary: 'Secondary Road', tertiary: 'Tertiary Road',
  residential: 'Residential Street', service: 'Service Road',
  unclassified: 'Minor Road', living_street: 'Shared Zone',
  cycleway: 'Bike Path', footway: 'Footpath', path: 'Path',
  track: 'Track', pedestrian: 'Pedestrian Zone'
};

const SURFACE_LABELS = {
  asphalt: 'Asphalt', concrete: 'Concrete', paved: 'Paved',
  'concrete:plates': 'Concrete', 'concrete:lanes': 'Concrete',
  sett: 'Cobblestone', cobblestone: 'Cobblestone', paving_stones: 'Paving Stones',
  gravel: 'Gravel', 'fine_gravel': 'Fine Gravel', compacted: 'Compacted Gravel',
  dirt: 'Dirt', earth: 'Dirt', mud: 'Mud', sand: 'Sand',
  grass: 'Grass', wood: 'Timber', metal: 'Metal Grating',
  unpaved: 'Unpaved', ground: 'Unsealed'
};

function getBikeInfrastructure(tags) {
  if (tags.highway === 'cycleway') return 'Dedicated Bike Path';
  if ((tags.highway === 'footway' || tags.highway === 'path') &&
      (tags.bicycle === 'designated' || tags.bicycle === 'yes')) return 'Shared Use Path';
  const vals = [tags.cycleway, tags['cycleway:left'], tags['cycleway:right'], tags['cycleway:both']].filter(Boolean);
  for (const v of vals) {
    if (v === 'track' || v === 'separate') return 'Protected Bike Lane';
    if (v === 'lane') return 'Painted Bike Lane';
    if (v === 'shared_lane') return 'Sharrow';
    if (v === 'share_busway') return 'Shared Bus Lane';
  }
  if (['motorway','trunk','primary','secondary','tertiary','residential','unclassified','service'].includes(tags.highway)) return 'No Bike Lane';
  return null;
}

// Distance from point to line segment (in approx metres)
function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  const dlat = (py - cy) * 111320;
  const dlng = (px - cx) * 111320 * Math.cos(py * Math.PI / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

// Min distance from point to a way's geometry
function distToWay(lng, lat, geom) {
  if (!geom || geom.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < geom.length - 1; i++) {
    const d = pointToSegmentDist(lng, lat, geom[i].lon, geom[i].lat, geom[i+1].lon, geom[i+1].lat);
    if (d < min) min = d;
  }
  return min;
}

async function queryInfrastructure(lngLat) {
  const [lng, lat] = lngLat;
  const query = `[out:json];way(around:25,${lat},${lng})["highway"];out geom;`;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`
    });
    if (!res.ok) throw new Error('Overpass API error');
    const data = await res.json();
    if (!data.elements || data.elements.length === 0) return null;

    // Pick the closest way to the pin
    data.elements.sort((a, b) => {
      return distToWay(lng, lat, a.geometry) - distToWay(lng, lat, b.geometry);
    });

    const tags = data.elements[0].tags || {};
    return {
      osmWayId: data.elements[0].id,
      name: tags.name || null,
      roadType: tags.highway || null,
      roadTypeLabel: ROAD_TYPE_LABELS[tags.highway] || tags.highway || 'Unknown',
      speedLimit: tags.maxspeed ? (parseInt(tags.maxspeed) || tags.maxspeed) : null,
      bikeInfrastructure: getBikeInfrastructure(tags),
      lanes: tags.lanes ? parseInt(tags.lanes) : null,
      lit: tags.lit || null,
      surface: tags.surface ? (SURFACE_LABELS[tags.surface] || capitalize(tags.surface)) : null,
      oneway: tags.oneway || null,
      sidewalk: tags.sidewalk || null
    };
  } catch (err) {
    console.warn('Infrastructure query failed:', err);
    return null;
  }
}

function displayInfrastructure(infra, cardEl, spinnerEl) {
  const el = cardEl || document.getElementById('infrastructure-card');
  const spinner = spinnerEl || document.getElementById('infra-spinner');
  if (spinner) spinner.classList.add('hidden');
  if (!el) return;

  if (!infra) {
    el.innerHTML = '<span class="text-xs text-gray-400">No road data found near this location</span>';
    return;
  }

  const pills = [];

  // Road type
  pills.push(`<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700"><i class="fa-solid fa-road text-[9px]"></i> ${infra.roadTypeLabel}</span>`);

  // Speed limit
  if (infra.speedLimit) {
    pills.push(`<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700"><i class="fa-solid fa-gauge text-[9px]"></i> ${infra.speedLimit} km/h</span>`);
  }

  // Bike infrastructure
  if (infra.bikeInfrastructure) {
    const good = ['Dedicated Bike Path', 'Protected Bike Lane', 'Shared Use Path'].includes(infra.bikeInfrastructure);
    const cls = good ? 'bg-green-50 text-green-700' : infra.bikeInfrastructure === 'No Bike Lane' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
    const icon = good ? 'fa-bicycle' : infra.bikeInfrastructure === 'No Bike Lane' ? 'fa-ban' : 'fa-bicycle';
    pills.push(`<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-medium ${cls}"><i class="fa-solid ${icon} text-[9px]"></i> ${infra.bikeInfrastructure}</span>`);
  }

  // Lanes
  if (infra.lanes) {
    pills.push(`<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700"><i class="fa-solid fa-arrows-left-right text-[9px]"></i> ${infra.lanes} lane${infra.lanes > 1 ? 's' : ''}</span>`);
  }

  // Lighting
  if (infra.lit) {
    const litLabel = infra.lit === 'yes' ? 'Street Lit' : infra.lit === 'no' ? 'Unlit' : infra.lit;
    const litCls = infra.lit === 'yes' ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-100 text-gray-600';
    const litIcon = infra.lit === 'yes' ? 'fa-lightbulb' : 'fa-moon';
    pills.push(`<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-medium ${litCls}"><i class="fa-solid ${litIcon} text-[9px]"></i> ${litLabel}</span>`);
  }

  // Surface
  if (infra.surface) {
    pills.push(`<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700"><i class="fa-solid fa-layer-group text-[9px]"></i> ${infra.surface}</span>`);
  }

  // One-way
  if (infra.oneway === 'yes') {
    pills.push(`<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700"><i class="fa-solid fa-arrow-right text-[9px]"></i> One-way</span>`);
  }

  const nameHtml = infra.name ? `<div class="flex items-center gap-1.5 mb-1.5"><i class="fa-solid fa-location-dot text-[11px] text-slate-400"></i><span class="text-[13px] font-medium text-gray-800">${escapeHtml(infra.name)}</span></div>` : '';
  el.innerHTML = `${nameHtml}<div class="flex flex-wrap gap-1.5">${pills.join('')}</div>`;
}

// Generate marker images for each type × scariness combo using canvas
function generateMarkerImages() {
  const ratio = window.devicePixelRatio || 1;
  const size = 24;
  const pxSize = size * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = pxSize;
  canvas.height = pxSize;
  const ctx = canvas.getContext('2d');
  const scarinessLevels = Object.keys(SCARINESS_COLORS);

  for (const type of Object.keys(TYPE_LABELS)) {
    for (const scare of scarinessLevels) {
      ctx.clearRect(0, 0, pxSize, pxSize);

      // White border circle
      ctx.beginPath();
      ctx.arc(pxSize / 2, pxSize / 2, pxSize / 2 - 1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Scariness-colored inner circle
      ctx.beginPath();
      ctx.arc(pxSize / 2, pxSize / 2, pxSize / 2 - 3 * ratio, 0, Math.PI * 2);
      ctx.fillStyle = SCARINESS_COLORS[scare] || '#6b7280';
      ctx.fill();

      // White FA icon
      const iconSize = Math.round(11 * ratio);
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${iconSize}px "Font Awesome 6 Free"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TYPE_FA_UNICODE[type] || '?', pxSize / 2, pxSize / 2);

      const imageData = ctx.getImageData(0, 0, pxSize, pxSize);
      map.addImage(`marker-${type}-${scare}`, imageData, { pixelRatio: ratio });
    }
  }

  // Generate annoyance markers (rounded squares, single amber color)
  const r = Math.round(5 * ratio); // corner radius
  for (const type of Object.keys(ANNOYANCE_TYPE_LABELS)) {
    ctx.clearRect(0, 0, pxSize, pxSize);
    // White border rounded square
    const m = 1;
    ctx.beginPath();
    ctx.roundRect(m, m, pxSize - m * 2, pxSize - m * 2, r + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    // Amber inner rounded square
    const p = 3 * ratio;
    ctx.beginPath();
    ctx.roundRect(p, p, pxSize - p * 2, pxSize - p * 2, r);
    ctx.fillStyle = ANNOYANCE_MARKER_COLOR;
    ctx.fill();
    // White FA icon
    const iconSize = Math.round(11 * ratio);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${iconSize}px "Font Awesome 6 Free"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ANNOYANCE_FA_UNICODE[type] || '?', pxSize / 2, pxSize / 2);
    const imgData = ctx.getImageData(0, 0, pxSize, pxSize);
    map.addImage(`annoyance-${type}`, imgData, { pixelRatio: ratio });
  }
}

// ============================================
// MAP INIT
// ============================================

map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [144.96, -37.81], // Melbourne
  zoom: 11
});

// Customize map style to match route builder (muted light mode)
function customizeMapStyle() {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  style.layers.forEach(layer => {
    const id = layer.id;
    try {
      // Hide road shields and route number badges
      if (layer.type === 'symbol' && (
          id.includes('shield') || id.includes('road-number') || id.includes('route-') ||
          id.includes('ref') || id.match(/road.*label/) || id.includes('junction') || id.includes('exit')
      )) {
        map.setLayoutProperty(id, 'visibility', 'none');
      }
      // Mute land/background
      if (id === 'land' || id === 'background') {
        map.setPaintProperty(id, 'background-color', '#F8F8F8');
      }
      // Mute green areas
      if (id.includes('park') || id.includes('landuse') || id.includes('landcover') ||
          id.includes('grass') || id.includes('forest') || id.includes('vegetation') ||
          id.includes('green') || id.includes('nature') || id.includes('wood')) {
        if (layer.type === 'fill') map.setPaintProperty(id, 'fill-color', '#D8E8D8');
      }
      // Mute water
      if ((id === 'water' || id.includes('water')) && layer.type === 'fill') {
        map.setPaintProperty(id, 'fill-color', '#D4E4EC');
      }
      // Reduce hillshade
      if (id.includes('hillshade')) {
        map.setPaintProperty(id, 'hillshade-exaggeration', 0.3);
      }
      // Mute road colors
      if (layer.type === 'line') {
        if (id.includes('motorway') || id.includes('trunk')) {
          map.setPaintProperty(id, 'line-color', '#E0D8D0');
        } else if (id.includes('primary')) {
          map.setPaintProperty(id, 'line-color', '#EEEEEE');
        } else if (id.includes('road') || id.includes('street') || id.includes('secondary') || id.includes('tertiary')) {
          map.setPaintProperty(id, 'line-color', '#F0F0F0');
        }
      }
    } catch (e) {
      // Some layers may not support certain paint properties — skip them
    }
  });
}

map.on('style.load', () => {
  customizeMapStyle();
  addMapLayers();
});


map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

// Google Places Autocomplete (initialized via callback)
window.initPlacesAutocomplete = function() {
  const input = document.getElementById('search-input');
  const autocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: 'au' },
    fields: ['geometry', 'name', 'formatted_address']
  });
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) return;
    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    map.flyTo({ center: [lng, lat], zoom: 15 });
  });
};

// Geolocate control (hidden — triggered by custom button)
const geolocate = new mapboxgl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: false,
  showUserLocation: true
});
map.addControl(geolocate, 'bottom-right');
// Hide the default geolocate button (we use our own)
geolocate._container.style.display = 'none';

document.getElementById('locate-btn').addEventListener('click', () => {
  geolocate.trigger();
});

// Reset view button (mobile) — snap back to Melbourne
document.getElementById('reset-view-btn')?.addEventListener('click', () => {
  map.flyTo({ center: [144.96, -37.81], zoom: 11, duration: 1000 });
});

// ============================================
// MAP LAYERS
// ============================================

function addMapLayers() {
  // --- 1. OSM Cycling Routes (loaded from Firestore osmRoutes) ---
  map.addSource('cycling-routes', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });

  // Route casing — thin white stroke
  map.addLayer({
    id: 'routes-casing',
    type: 'line',
    source: 'cycling-routes',
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 10, 4, 14, 5],
      'line-opacity': 0.8
    }
  });

  // Route lines — thin colored line on top
  map.addLayer({
    id: 'routes-line',
    type: 'line',
    source: 'cycling-routes',
    paint: {
      'line-color': '#0097e6',
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 10, 2, 14, 3],
      'line-opacity': 0.6
    }
  });

  // Invisible wider hit area for easier route clicking
  map.addLayer({
    id: 'routes-hit',
    type: 'line',
    source: 'cycling-routes',
    paint: {
      'line-color': 'transparent',
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 16, 14, 20],
      'line-opacity': 0
    }
  });

  // Route labels at high zoom
  map.addLayer({
    id: 'routes-labels',
    type: 'symbol',
    source: 'cycling-routes',
    minzoom: 13,
    layout: {
      'symbol-placement': 'line',
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
      'text-anchor': 'center',
      'text-offset': [0, -1],
      'text-max-angle': 30
    },
    paint: {
      'text-color': '#1e3056',
      'text-halo-color': '#fff',
      'text-halo-width': 2
    }
  });

  // Load cycling routes from Firestore
  loadCyclingRoutes();

  // --- 3. Incident Markers (GeoJSON source, filled later) ---
  map.addSource('incidents', {
    type: 'geojson',
    data: incidentsData,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50
  });

  // Cluster circles
  map.addLayer({
    id: 'incident-clusters',
    type: 'circle',
    source: 'incidents',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step', ['get', 'point_count'],
        '#f59e0b', 10,
        '#f97316', 25,
        '#ef4444'
      ],
      'circle-radius': [
        'step', ['get', 'point_count'],
        18, 10,
        24, 25,
        30
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff'
    }
  });

  // Cluster count labels
  map.addLayer({
    id: 'incident-cluster-count',
    type: 'symbol',
    source: 'incidents',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 13
    },
    paint: {
      'text-color': '#fff'
    }
  });

  // Generate marker images (wait for Font Awesome to load)
  document.fonts.ready.then(() => {
    generateMarkerImages();

    // Individual incident markers (symbol layer with type-based icons)
    map.addLayer({
      id: 'incident-points',
      type: 'symbol',
      source: 'incidents',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': [
          'concat',
          'marker-',
          ['get', 'incidentType'],
          '-',
          ['get', 'scariness']
        ],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 0.75, 14, 0.9],
        'icon-allow-overlap': true
      }
    });

    // --- 4. Annoyance Markers ---
    map.addSource('annoyances', {
      type: 'geojson',
      data: annoyancesData,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50
    });

    map.addLayer({
      id: 'annoyance-clusters',
      type: 'circle',
      source: 'annoyances',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#f59e0b',
        'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 25, 22],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });

    map.addLayer({
      id: 'annoyance-cluster-count',
      type: 'symbol',
      source: 'annoyances',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 13
      },
      paint: { 'text-color': '#fff' }
    });

    map.addLayer({
      id: 'annoyance-points',
      type: 'symbol',
      source: 'annoyances',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['concat', 'annoyance-', ['get', 'annoyanceType']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 0.75, 14, 0.9],
        'icon-allow-overlap': true
      }
    });

    // Load both datasets after layers are ready
    loadIncidents();
    loadAnnoyances();
  });

  // --- Click handlers ---

  // Click cluster to zoom
  map.on('click', 'incident-clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['incident-clusters'] });
    const clusterId = features[0].properties.cluster_id;
    map.getSource('incidents').getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: features[0].geometry.coordinates, zoom });
    });
  });

  // Helper: build photo HTML for popups (handles single photoURL + multi photoURLs)
  function buildPhotoHtml(p) {
    let urls = [];
    // Try photoURLs array first (may be JSON string from Firestore GeoJSON properties)
    if (p.photoURLs) {
      try {
        const parsed = typeof p.photoURLs === 'string' ? JSON.parse(p.photoURLs) : p.photoURLs;
        if (Array.isArray(parsed)) urls = parsed;
      } catch (e) {}
    }
    // Fallback to single photoURL
    if (urls.length === 0 && p.photoURL && p.photoURL !== '') {
      urls = [p.photoURL];
    }
    if (urls.length === 0) return '';
    const escaped = urls.map(u => escapeHtml(u));
    const jsonUrls = JSON.stringify(escaped).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    if (urls.length === 1) {
      return `<div class="mb-2"><img src="${escaped[0]}" class="max-h-32 rounded-lg border border-gray-200 cursor-pointer" onerror="this.parentElement.style.display='none'" onclick="openLightbox([&quot;${escaped[0]}&quot;],0)" /></div>`;
    }
    return `<div class="mb-2 flex gap-1.5 overflow-x-auto">${escaped.map((u, i) =>
      `<img src="${u}" class="h-20 w-20 object-cover rounded-lg border border-gray-200 cursor-pointer shrink-0" onerror="this.style.display='none'" onclick="openLightbox(${jsonUrls},${i})" />`
    ).join('')}</div>`;
  }

  // Click incident point to show popup
  map.on('click', 'incident-points', (e) => {
    if (isPlacingMarker) return; // Don't popup while placing marker
    const f = e.features[0];
    const p = f.properties;
    const coords = f.geometry.coordinates.slice();

    const dateStr = p.dateTime ? new Date(p.dateTime).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '';

    const typeLabel = TYPE_LABELS[p.incidentType] || p.incidentType;

    const scarinessStyles = {
      not_scary: 'bg-green-100 text-green-800',
      a_bit_scary: 'bg-amber-100 text-amber-800',
      fairly_scary: 'bg-orange-100 text-orange-800',
      very_scary: 'bg-red-100 text-red-800'
    };

    const scarinessLabel = SCARINESS_LABELS[p.scariness] || p.scariness || '';
    const contactLabel = p.contactMade === true || p.contactMade === 'true' ? 'Contact' : 'No Contact';
    const contactStyle = p.contactMade === true || p.contactMade === 'true' ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700';
    const injuryLabel = p.injuryOccurred === true || p.injuryOccurred === 'true' ? 'Injury' : '';

    // Build infrastructure pills for popup
    let infraHtml = '';
    if (p.infrastructure) {
      try {
        const infra = typeof p.infrastructure === 'string' ? JSON.parse(p.infrastructure) : p.infrastructure;
        const iPills = [];
        if (infra.roadTypeLabel) iPills.push(`<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700">${infra.roadTypeLabel}</span>`);
        if (infra.speedLimit) iPills.push(`<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">${infra.speedLimit} km/h</span>`);
        if (infra.bikeInfrastructure) {
          const good = ['Dedicated Bike Path', 'Protected Bike Lane', 'Shared Use Path'].includes(infra.bikeInfrastructure);
          const cls = good ? 'bg-green-50 text-green-700' : infra.bikeInfrastructure === 'No Bike Lane' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
          iPills.push(`<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium ${cls}">${infra.bikeInfrastructure}</span>`);
        }
        if (infra.lanes) iPills.push(`<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">${infra.lanes} lane${infra.lanes > 1 ? 's' : ''}</span>`);
        if (infra.lit) {
          const litLabel = infra.lit === 'yes' ? 'Street Lit' : infra.lit === 'no' ? 'Unlit' : infra.lit;
          iPills.push(`<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">${litLabel}</span>`);
        }
        if (infra.surface) iPills.push(`<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">${infra.surface}</span>`);
        if (infra.oneway === 'yes') iPills.push(`<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">One-way</span>`);
        if (iPills.length > 0) {
          infraHtml = `<div class="flex gap-1 flex-wrap pt-1.5 mt-1.5 border-t border-gray-100"><i class="fa-solid fa-road text-gray-300 text-[10px] mt-0.5"></i>${iPills.join('')}</div>`;
        }
      } catch (e) {}
    }

    const reporterName = p.reporterName || 'Anonymous';

    const html = `
      <div class="max-w-[320px] font-['Inter',sans-serif]">
        <div class="flex items-start gap-2 mb-2">
          <div class="shrink-0 size-8 inline-flex items-center justify-center rounded-full bg-red-100 text-red-600 text-sm">${TYPE_ICONS[p.incidentType] || '<i class="fa-solid fa-triangle-exclamation"></i>'}</div>
          <div class="grow">
            <h3 class="text-sm font-semibold text-gray-800">${typeLabel}</h3>
            <p class="text-[11px] text-gray-500">${p.roadName || 'Unknown road'} ${dateStr ? '&middot; ' + dateStr : ''}</p>
          </div>
        </div>
        <p class="text-[13px] text-gray-700 mb-2.5 leading-relaxed">${escapeHtml(p.description || '')}</p>
        <div class="flex gap-1.5 flex-wrap mb-2">
          <span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium ${scarinessStyles[p.scariness] || 'bg-gray-100 text-gray-700'}">${scarinessLabel}</span>
          <span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium ${contactStyle}">${contactLabel}</span>
          ${injuryLabel ? `<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-red-100 text-red-700">${injuryLabel}</span>` : ''}
          ${p.otherParty && p.otherParty !== 'none' ? `<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">${formatParty(p.otherParty)}</span>` : ''}
        </div>
        ${buildPhotoHtml(p)}
        ${infraHtml}
        <div class="flex items-center justify-between pt-2 mt-2 border-t border-gray-100">
          <span class="text-[11px] text-gray-400"><i class="fa-solid fa-user text-[10px] mr-1"></i>${escapeHtml(reporterName)}</span>
          <div class="flex gap-1.5">
            <button onclick="flagReport('incidents','${f.id || p.id}')" class="py-1 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:bg-gray-50"><i class="fa-solid fa-flag text-[9px]"></i> Flag</button>
            ${isAdmin ? `<button onclick="deleteIncident('${f.id || p.id}')" class="py-1 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-red-500 bg-white border border-red-200 rounded-md hover:bg-red-50"><i class="fa-solid fa-trash text-[9px]"></i> Delete</button>` : ''}
          </div>
        </div>
      </div>
    `;

    new mapboxgl.Popup({ maxWidth: '320px' })
      .setLngLat(coords)
      .setHTML(html)
      .addTo(map);
  });

  // Click annoyance cluster to zoom
  map.on('click', 'annoyance-clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['annoyance-clusters'] });
    const clusterId = features[0].properties.cluster_id;
    map.getSource('annoyances').getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: features[0].geometry.coordinates, zoom });
    });
  });

  // Click annoyance point to show popup
  map.on('click', 'annoyance-points', (e) => {
    if (isPlacingMarker) return;
    const f = e.features[0];
    const p = f.properties;
    const coords = f.geometry.coordinates.slice();
    const typeLabel = ANNOYANCE_TYPE_LABELS[p.annoyanceType] || p.annoyanceType;
    const ongoingLabel = p.isOngoing === true || p.isOngoing === 'true' ? 'Ongoing' : 'One-off';

    let infraHtml = '';
    if (p.infrastructure) {
      try {
        const infra = typeof p.infrastructure === 'string' ? JSON.parse(p.infrastructure) : p.infrastructure;
        const iPills = [];
        if (infra.roadTypeLabel) iPills.push(`<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700">${infra.roadTypeLabel}</span>`);
        if (infra.speedLimit) iPills.push(`<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">${infra.speedLimit} km/h</span>`);
        if (infra.bikeInfrastructure) {
          const good = ['Dedicated Bike Path', 'Protected Bike Lane', 'Shared Use Path'].includes(infra.bikeInfrastructure);
          const cls = good ? 'bg-green-50 text-green-700' : infra.bikeInfrastructure === 'No Bike Lane' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
          iPills.push(`<span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium ${cls}">${infra.bikeInfrastructure}</span>`);
        }
        if (iPills.length > 0) infraHtml = `<div class="flex gap-1 flex-wrap pt-1.5 mt-1.5 border-t border-gray-100"><i class="fa-solid fa-road text-gray-300 text-[10px] mt-0.5"></i>${iPills.join('')}</div>`;
      } catch (e) {}
    }

    const reporterName = p.reporterName || 'Anonymous';

    const html = `
      <div class="max-w-[320px] font-['Inter',sans-serif]">
        <div class="flex items-start gap-2 mb-2">
          <div class="shrink-0 size-8 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-600 text-sm">${ANNOYANCE_TYPE_ICONS[p.annoyanceType] || '<i class="fa-solid fa-circle-exclamation"></i>'}</div>
          <div class="grow">
            <h3 class="text-sm font-semibold text-gray-800">${typeLabel}</h3>
            <p class="text-[11px] text-gray-500">${p.roadName || 'Unknown road'}</p>
          </div>
        </div>
        <p class="text-[13px] text-gray-700 mb-2.5 leading-relaxed">${escapeHtml(p.description || '')}</p>
        <div class="flex gap-1.5 flex-wrap mb-2">
          <span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">Annoyance</span>
          <span class="inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">${ongoingLabel}</span>
        </div>
        ${buildPhotoHtml(p)}
        ${infraHtml}
        <div class="flex items-center justify-between pt-2 mt-2 border-t border-gray-100">
          <span class="text-[11px] text-gray-400"><i class="fa-solid fa-user text-[10px] mr-1"></i>${escapeHtml(reporterName)}</span>
          <div class="flex gap-1.5">
            <button onclick="flagReport('annoyances','${f.id || p.id}')" class="py-1 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:bg-gray-50"><i class="fa-solid fa-flag text-[9px]"></i> Flag</button>
            ${isAdmin ? `<button onclick="deleteAnnoyance('${f.id || p.id}')" class="py-1 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-red-500 bg-white border border-red-200 rounded-md hover:bg-red-50"><i class="fa-solid fa-trash text-[9px]"></i> Delete</button>` : ''}
          </div>
        </div>
      </div>
    `;
    new mapboxgl.Popup({ maxWidth: '320px' }).setLngLat(coords).setHTML(html).addTo(map);
  });

  // Cursor styles
  map.on('mouseenter', 'incident-clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'incident-clusters', () => { map.getCanvas().style.cursor = ''; });
  map.on('mouseenter', 'incident-points', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'incident-points', () => { map.getCanvas().style.cursor = ''; });
  map.on('mouseenter', 'annoyance-clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'annoyance-clusters', () => { map.getCanvas().style.cursor = ''; });
  map.on('mouseenter', 'annoyance-points', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'annoyance-points', () => { map.getCanvas().style.cursor = ''; });

  // Route click popup
  const routePopup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, offset: 10 });
  map.on('mouseenter', 'routes-hit', () => {
    if (!isPlacingMarker) map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'routes-hit', () => {
    if (!isPlacingMarker) map.getCanvas().style.cursor = '';
  });
  map.on('click', 'routes-hit', (e) => {
    if (isPlacingMarker) return;
    const p = e.features[0].properties;
    routePopup.setLngLat(e.lngLat)
      .setHTML(`
        <div class="font-['Inter',sans-serif] px-1 py-0.5">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-route text-blue-500 text-sm"></i>
            <span class="text-sm font-semibold text-gray-900">${p.name || 'Unnamed Route'}</span>
          </div>
        </div>
      `)
      .addTo(map);
  });
}

// ============================================
// LOAD INCIDENTS FROM FIRESTORE
// ============================================

function loadIncidents() {
  if (!db) return;

  const query = db.collection('incidents')
    .where('status', '==', 'approved')
    .orderBy('reportedAt', 'desc')
    .limit(2000);

  // Real-time listener
  query.onSnapshot(snapshot => {
    const features = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      if (!d.geometry || !d.geometry.coordinates) return;
      features.push({
        type: 'Feature',
        id: doc.id,
        geometry: d.geometry,
        properties: {
          id: doc.id,
          incidentType: d.incidentType,
          scariness: d.scariness || d.severity || '',
          contactMade: d.contactMade || false,
          injuryOccurred: d.injuryOccurred || false,
          otherParty: d.otherParty,
          description: d.description,
          dateTime: d.dateTime ? d.dateTime.toDate().toISOString() : null,
          roadName: d.roadName || '',
          reportCount: d.reportCount || 0,
          flagged: d.flagged || false,
          photoURL: d.photoURL || '',
          infrastructure: d.infrastructure ? JSON.stringify(d.infrastructure) : ''
        }
      });
    });

    incidentsData = { type: 'FeatureCollection', features };
    if (map.getSource('incidents')) {
      map.getSource('incidents').setData(incidentsData);
    }
    applyFilters(); // Re-apply any active filters
    updateIncidentCount();
  }, err => {
    console.error('Error loading incidents:', err);
  });
}

// ============================================
// LOAD ANNOYANCES FROM FIRESTORE
// ============================================

function loadAnnoyances() {
  if (!db) return;

  const query = db.collection('annoyances')
    .where('status', '==', 'approved')
    .orderBy('reportedAt', 'desc')
    .limit(2000);

  query.onSnapshot(snapshot => {
    const features = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      if (!d.geometry || !d.geometry.coordinates) return;
      features.push({
        type: 'Feature',
        id: doc.id,
        geometry: d.geometry,
        properties: {
          id: doc.id,
          annoyanceType: d.annoyanceType,
          isOngoing: d.isOngoing || false,
          description: d.description,
          roadName: d.roadName || '',
          flagged: d.flagged || false,
          photoURL: d.photoURL || '',
          infrastructure: d.infrastructure ? JSON.stringify(d.infrastructure) : ''
        }
      });
    });

    annoyancesData = { type: 'FeatureCollection', features };
    if (map.getSource('annoyances')) {
      map.getSource('annoyances').setData(annoyancesData);
    }
    applyFilters();
    updateIncidentCount();
  }, err => {
    console.error('Error loading annoyances:', err);
  });
}

// ============================================
// LOAD CYCLING ROUTES FROM FIRESTORE
// ============================================

// Decode Google Encoded Polyline to [lng, lat] coordinates
function decodePolyline(encoded) {
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

// Split coordinates into segments at large gaps (avoids straight lines between disconnected parts)
function splitAtGaps(coords, maxGapKm) {
  const segments = [];
  let current = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const dlat = (lat2 - lat1) * 111.32;
    const dlng = (lng2 - lng1) * 111.32 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
    const dist = Math.sqrt(dlat * dlat + dlng * dlng);
    if (dist > maxGapKm) {
      if (current.length >= 2) segments.push(current);
      current = [coords[i]];
    } else {
      current.push(coords[i]);
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

async function loadCyclingRoutes() {
  if (!db) return;
  try {
    const snapshot = await db.collection('osmRoutes').get();
    const features = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      const props = {
        name: d.name || 'Unnamed',
        routeType: d.routeType || '',
        network: d.network || '',
        category: d.category || '',
        total_length_m: d.totalLengthM || 0,
        shortCode: d.shieldText || d.ref || ''
      };
      // Use safetySegments (individual OSM ways) — each is a separate polyline
      if (Array.isArray(d.safetySegments) && d.safetySegments.length > 0) {
        for (const seg of d.safetySegments) {
          if (!seg.p) continue;
          const coords = decodePolyline(seg.p);
          if (coords.length < 2) continue;
          features.push({
            type: 'Feature',
            properties: props,
            geometry: { type: 'LineString', coordinates: coords }
          });
        }
      } else if (d.polyline) {
        // Fallback to single polyline for routes without safetySegments
        const coords = decodePolyline(d.polyline);
        if (coords.length < 2) return;
        features.push({
          type: 'Feature',
          properties: props,
          geometry: { type: 'LineString', coordinates: coords }
        });
      }
    });
    console.log(`Loaded ${features.length} cycling route segments from Firestore`);
    if (map.getSource('cycling-routes')) {
      map.getSource('cycling-routes').setData({ type: 'FeatureCollection', features });
    }
  } catch (err) {
    console.error('Error loading cycling routes:', err);
  }
}

// ============================================
// FILTERS
// ============================================

function applyFilters() {
  const reportType = document.getElementById('filter-report-type').value;
  const type = document.getElementById('filter-type').value;
  const scariness = document.getElementById('filter-scariness').value;

  // Show/hide incident layers based on report type filter
  const showIncidents = !reportType || reportType === 'incident';
  const showAnnoyances = !reportType || reportType === 'annoyance';

  const incidentVis = showIncidents ? 'visible' : 'none';
  const annoyanceVis = showAnnoyances ? 'visible' : 'none';

  ['incident-clusters', 'incident-cluster-count', 'incident-points'].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', incidentVis);
  });
  ['annoyance-clusters', 'annoyance-cluster-count', 'annoyance-points'].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', annoyanceVis);
  });

  // Build filter for unclustered incident points
  const filters = ['all', ['!', ['has', 'point_count']]];
  if (type) filters.push(['==', ['get', 'incidentType'], type]);
  if (scariness) filters.push(['==', ['get', 'scariness'], scariness]);

  if (map.getLayer('incident-points')) map.setFilter('incident-points', filters);

  // For clusters, filter the source data directly
  if (type || scariness) {
    const filtered = incidentsData.features.filter(f => {
      const p = f.properties;
      if (type && p.incidentType !== type) return false;
      if (scariness && p.scariness !== scariness) return false;
      return true;
    });
    if (map.getSource('incidents')) map.getSource('incidents').setData({ type: 'FeatureCollection', features: filtered });
  } else {
    if (map.getSource('incidents')) map.getSource('incidents').setData(incidentsData);
  }

  // Annoyance source always shows full data (no type/scariness sub-filter for annoyances)
  if (map.getSource('annoyances')) map.getSource('annoyances').setData(annoyancesData);

  updateIncidentCount();
}

function updateIncidentCount() {
  const reportType = document.getElementById('filter-report-type').value;
  const incidentSource = map.getSource('incidents');
  const annoyanceSource = map.getSource('annoyances');
  const incidentCount = (incidentSource && incidentSource._data && incidentSource._data.features) ? incidentSource._data.features.length : 0;
  const annoyanceCount = (annoyanceSource && annoyanceSource._data && annoyanceSource._data.features) ? annoyanceSource._data.features.length : 0;

  let text;
  if (reportType === 'incident') {
    text = incidentCount + ' incident' + (incidentCount !== 1 ? 's' : '');
  } else if (reportType === 'annoyance') {
    text = annoyanceCount + ' annoyance' + (annoyanceCount !== 1 ? 's' : '');
  } else {
    const parts = [];
    if (incidentCount > 0) parts.push(incidentCount + ' incident' + (incidentCount !== 1 ? 's' : ''));
    if (annoyanceCount > 0) parts.push(annoyanceCount + ' annoyance' + (annoyanceCount !== 1 ? 's' : ''));
    text = parts.join(', ') || '0 reports';
  }
  document.getElementById('incident-count').textContent = text;
}

// Filter event listeners
document.getElementById('filter-report-type').addEventListener('change', applyFilters);
document.getElementById('filter-type').addEventListener('change', applyFilters);
document.getElementById('filter-scariness').addEventListener('change', applyFilters);
document.getElementById('filter-reset').addEventListener('click', () => {
  document.getElementById('filter-report-type').value = '';
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-scariness').value = '';
  applyFilters();
});

// ============================================
// LAYER TOGGLES
// ============================================


// ============================================
// REPORT FLOW
// ============================================

const incidentPanel = document.getElementById('incident-panel');
const annoyancePanel = document.getElementById('annoyance-panel');
const reportButtonsDiv = document.getElementById('report-buttons');

// Report button clicks
document.getElementById('report-btn').addEventListener('click', () => {
  reportMode = 'incident';
  startPlacingMarker();
});

document.getElementById('report-annoying-btn').addEventListener('click', () => {
  reportMode = 'annoyance';
  startPlacingMarker();
});

function startPlacingMarker() {
  isPlacingMarker = true;
  map.getCanvas().style.cursor = 'crosshair';
  const msg = reportMode === 'annoyance' ? 'Click the map to place the annoyance location' : 'Click the map to place the incident location';
  showToast(msg);
  reportButtonsDiv.style.display = 'none';
}

function stopPlacingMarker() {
  isPlacingMarker = false;
  map.getCanvas().style.cursor = '';
  reportButtonsDiv.style.display = '';
}

// Map click to place marker
map.on('click', async (e) => {
  if (!isPlacingMarker) return;

  const lngLat = [e.lngLat.lng, e.lngLat.lat];
  reportCoords = lngLat;

  // Remove old marker
  if (placeholderMarker) placeholderMarker.remove();

  // Create pulsing marker
  const el = document.createElement('div');
  el.className = 'pulsing-marker';
  placeholderMarker = new mapboxgl.Marker({ element: el, draggable: true })
    .setLngLat(lngLat)
    .addTo(map);

  // Update coords on drag
  placeholderMarker.on('dragend', () => {
    const pos = placeholderMarker.getLngLat();
    reportCoords = [pos.lng, pos.lat];
    updateLocationDisplay(reportCoords);
    fetchInfrastructure(reportCoords);
  });

  stopPlacingMarker();

  // Show correct panel and update location
  updateLocationDisplay(lngLat);

  if (reportMode === 'annoyance') {
    resetAnnoyanceForm();
    setDefaultAnnoyanceDateTime();
    annoyancePanel.classList.add('visible');
    fetchInfrastructure(lngLat);
    validateAnnoyanceForm();
  } else {
    resetForm();
    setDefaultDateTime();
    incidentPanel.classList.add('visible');
    fetchInfrastructure(lngLat);
    validateForm();
  }
});

async function fetchInfrastructure(lngLat) {
  const isAnnoyance = reportMode === 'annoyance';
  const spinner = document.getElementById(isAnnoyance ? 'annoyance-infra-spinner' : 'infra-spinner');
  const card = document.getElementById(isAnnoyance ? 'annoyance-infrastructure-card' : 'infrastructure-card');
  if (spinner) spinner.classList.remove('hidden');
  if (card) card.innerHTML = '<span class="text-xs text-gray-400">Detecting road details...</span>';
  currentInfrastructure = await queryInfrastructure(lngLat);
  displayInfrastructure(currentInfrastructure, card, spinner);
}

async function updateLocationDisplay(lngLat) {
  const isAnnoyance = reportMode === 'annoyance';
  const locationEl = document.getElementById(isAnnoyance ? 'annoyance-location' : 'incident-location');
  try {
    const address = await reverseGeocode(lngLat);
    locationEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg><span>${address}</span>`;
  } catch (e) {
    locationEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg><span>${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}</span>`;
  }
}

async function reverseGeocode(lngLat) {
  const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lngLat[0]},${lngLat[1]}.json?access_token=${mapboxgl.accessToken}&types=address,poi`);
  const data = await res.json();
  if (data.features && data.features.length > 0) {
    return data.features[0].place_name;
  }
  return `${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}`;
}

// ============================================
// FORM HANDLERS
// ============================================

// Type buttons
document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedType = btn.dataset.type;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const descEl = document.getElementById('type-description');
    descEl.textContent = TYPE_DESCRIPTIONS[selectedType] || '';
    descEl.classList.remove('hidden');
    validateForm();
  });
});

// Scariness buttons
document.querySelectorAll('.scariness-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedScariness = btn.dataset.scariness;
    document.querySelectorAll('.scariness-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const descEl = document.getElementById('scariness-description');
    descEl.textContent = SCARINESS_DESCRIPTIONS[selectedScariness] || '';
    descEl.classList.remove('hidden');
    validateForm();
  });
});

// Contact made toggle
document.querySelectorAll('.contact-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    contactMade = btn.dataset.contact === 'yes';
    document.querySelectorAll('.contact-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// Injury toggle
document.querySelectorAll('.injury-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    injuryOccurred = btn.dataset.injury === 'yes';
    document.querySelectorAll('.injury-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// Party buttons
document.querySelectorAll('.party-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedParty = btn.dataset.party;
    document.querySelectorAll('.party-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// Reporter-for buttons
document.querySelectorAll('.reporter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedReporter = btn.dataset.reporter;
    document.querySelectorAll('.reporter-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    validateForm();
  });
});

// Rider dropdowns — trigger validation on change
['rider-age', 'ride-type', 'bike-type'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => validateForm());
});

// Description char count
const descEl = document.getElementById('incident-description');
const charCountEl = document.getElementById('char-count');
descEl.addEventListener('input', () => {
  const len = descEl.value.length;
  charCountEl.textContent = len + ' / 1000';
  charCountEl.classList.toggle('error', len > 0 && len < 20);
  validateForm();
});

function validateForm() {
  const desc = descEl.value.trim();
  const riderAge = document.getElementById('rider-age');
  const rideType = document.getElementById('ride-type');
  const bikeType = document.getElementById('bike-type');
  const valid = reportCoords && selectedType && selectedScariness && desc.length >= 20 &&
    selectedReporter &&
    (riderAge && riderAge.value) &&
    (rideType && rideType.value) &&
    (bikeType && bikeType.value);
  document.getElementById('incident-submit').disabled = !valid;
}

function resetForm() {
  selectedType = null;
  selectedScariness = null;
  selectedParty = null;
  contactMade = null;
  injuryOccurred = null;
  currentInfrastructure = null;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
  const typeDesc = document.getElementById('type-description');
  if (typeDesc) { typeDesc.classList.add('hidden'); typeDesc.textContent = ''; }
  document.querySelectorAll('.scariness-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.party-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.contact-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.injury-btn').forEach(b => b.classList.remove('selected'));
  const scarinessDesc = document.getElementById('scariness-description');
  if (scarinessDesc) { scarinessDesc.classList.add('hidden'); scarinessDesc.textContent = ''; }
  descEl.value = '';
  charCountEl.textContent = '0 / 1000';
  charCountEl.classList.remove('error');
  document.getElementById('incident-lighting').value = '';
  document.getElementById('incident-weather').value = '';
  document.getElementById('incident-surface').value = '';
  // Reset rider fields
  selectedReporter = null;
  document.querySelectorAll('.reporter-btn').forEach(b => b.classList.remove('selected'));
  const riderAge = document.getElementById('rider-age');
  const rideType = document.getElementById('ride-type');
  const bikeType = document.getElementById('bike-type');
  const riderFields = document.getElementById('rider-fields');
  const riderChevron = document.getElementById('rider-chevron');
  if (riderAge) riderAge.value = '';
  if (rideType) rideType.value = '';
  if (bikeType) bikeType.value = '';
  const riderGender = document.getElementById('rider-gender');
  if (riderGender) riderGender.value = '';
  // Reset contact fields
  const cName = document.getElementById('contact-name');
  const cEmail = document.getElementById('contact-email');
  const cConsent = document.getElementById('contact-consent');
  if (cName) cName.value = '';
  if (cEmail) cEmail.value = '';
  if (cConsent) cConsent.checked = false;
  // Reset photo
  removePhoto('incident');
  // Reset anon toggle — fields visible by default, button unselected
  const contactFields = document.getElementById('contact-fields');
  if (contactFields) contactFields.classList.remove('hidden');
  const incidentAnonBtn = document.getElementById('incident-anon-btn');
  if (incidentAnonBtn) {
    incidentAnonBtn.classList.remove('selected', 'border-blue-500', 'bg-blue-50', 'text-blue-700');
    incidentAnonBtn.classList.add('text-gray-500', 'border-gray-200');
  }
  document.getElementById('incident-submit').disabled = true;
}

function setDefaultDateTime() {
  const now = new Date();
  document.getElementById('incident-date').value = now.toISOString().split('T')[0];
  document.getElementById('incident-time').value = now.toTimeString().slice(0, 5);
}

function setDefaultAnnoyanceDateTime() {
  const now = new Date();
  document.getElementById('annoyance-date').value = now.toISOString().split('T')[0];
  document.getElementById('annoyance-time').value = now.toTimeString().slice(0, 5);
}

// Close incident panel
document.getElementById('panel-close').addEventListener('click', () => {
  incidentPanel.classList.remove('visible');
  if (placeholderMarker) {
    placeholderMarker.remove();
    placeholderMarker = null;
  }
  reportCoords = null;
  stopPlacingMarker();
});

// Close annoyance panel
document.getElementById('annoyance-panel-close').addEventListener('click', () => {
  annoyancePanel.classList.remove('visible');
  if (placeholderMarker) {
    placeholderMarker.remove();
    placeholderMarker = null;
  }
  reportCoords = null;
  stopPlacingMarker();
});

// ============================================
// ANNOYANCE FORM HANDLERS
// ============================================

// Annoyance type buttons
document.querySelectorAll('.annoyance-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedAnnoyanceType = btn.dataset.type;
    document.querySelectorAll('.annoyance-type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const descEl = document.getElementById('annoyance-type-description');
    descEl.textContent = ANNOYANCE_TYPE_DESCRIPTIONS[selectedAnnoyanceType] || '';
    descEl.classList.remove('hidden');
    validateAnnoyanceForm();
  });
});

// Ongoing buttons
document.querySelectorAll('.ongoing-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedOngoing = btn.dataset.ongoing === 'yes';
    document.querySelectorAll('.ongoing-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// Annoyance description char count
const annoyanceDescEl = document.getElementById('annoyance-description');
const annoyanceCharCountEl = document.getElementById('annoyance-char-count');
annoyanceDescEl.addEventListener('input', () => {
  const len = annoyanceDescEl.value.length;
  annoyanceCharCountEl.textContent = len + ' / 1000';
  annoyanceCharCountEl.classList.toggle('error', len > 0 && len < 20);
  validateAnnoyanceForm();
});

function validateAnnoyanceForm() {
  const desc = annoyanceDescEl.value.trim();
  const valid = reportCoords && selectedAnnoyanceType && desc.length >= 20;
  document.getElementById('annoyance-submit').disabled = !valid;
}

function resetAnnoyanceForm() {
  selectedAnnoyanceType = null;
  selectedOngoing = null;
  currentInfrastructure = null;
  document.querySelectorAll('.annoyance-type-btn').forEach(b => b.classList.remove('selected'));
  const typeDesc = document.getElementById('annoyance-type-description');
  if (typeDesc) { typeDesc.classList.add('hidden'); typeDesc.textContent = ''; }
  document.querySelectorAll('.ongoing-btn').forEach(b => b.classList.remove('selected'));
  annoyanceDescEl.value = '';
  annoyanceCharCountEl.textContent = '0 / 1000';
  annoyanceCharCountEl.classList.remove('error');
  // Reset contact fields
  const aCName = document.getElementById('annoyance-contact-name');
  const aCEmail = document.getElementById('annoyance-contact-email');
  const aCConsent = document.getElementById('annoyance-contact-consent');
  if (aCName) aCName.value = '';
  if (aCEmail) aCEmail.value = '';
  if (aCConsent) aCConsent.checked = false;
  const aCFields = document.getElementById('annoyance-contact-fields');
  if (aCFields) aCFields.classList.add('hidden');
  // Reset photo
  removePhoto('annoyance');
  // Reset anon toggle — fields visible by default, button unselected
  const annContactFields = document.getElementById('annoyance-contact-fields');
  if (annContactFields) annContactFields.classList.remove('hidden');
  const annAnonBtn = document.getElementById('annoyance-anon-btn');
  if (annAnonBtn) {
    annAnonBtn.classList.remove('selected', 'border-blue-500', 'bg-blue-50', 'text-blue-700');
    annAnonBtn.classList.add('text-gray-500', 'border-gray-200');
  }
  document.getElementById('annoyance-submit').disabled = true;
}

// ============================================
// SUBMIT ANNOYANCE
// ============================================

document.getElementById('annoyance-submit').addEventListener('click', async () => {
  if (!reportCoords || !selectedAnnoyanceType) return;

  const description = annoyanceDescEl.value.trim();
  if (description.length < 20) {
    showToast('Description must be at least 20 characters');
    return;
  }

  const submitBtn = document.getElementById('annoyance-submit');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;animation:spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4"/></svg> Submitting...';

  try {
    let roadName = '';
    try { roadName = await reverseGeocode(reportCoords); } catch (e) {}

    const dateVal = document.getElementById('annoyance-date').value;
    const timeVal = document.getElementById('annoyance-time').value;
    const dateTime = new Date(`${dateVal}T${timeVal}`);

    // Collect optional fields
    const annGender = document.getElementById('annoyance-gender').value || null;
    const annAge = document.getElementById('annoyance-age').value || null;
    const annContactName = (document.getElementById('annoyance-contact-name').value || '').trim() || null;
    const annContactEmail = (document.getElementById('annoyance-contact-email').value || '').trim() || null;
    const annContactConsent = document.getElementById('annoyance-contact-consent').checked;

    const annoyanceData = {
      geometry: {
        type: 'Point',
        coordinates: [reportCoords[0], reportCoords[1]]
      },
      location: new firebase.firestore.GeoPoint(reportCoords[1], reportCoords[0]),
      annoyanceType: selectedAnnoyanceType,
      isOngoing: selectedOngoing || false,
      description: description,
      dateTime: firebase.firestore.Timestamp.fromDate(dateTime),
      roadName: roadName,
      reportedBy: currentUser ? currentUser.uid : 'anonymous',
      reporterName: currentUser ? (currentUser.displayName || currentUser.email || 'Anonymous') : 'Anonymous',
      reportedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'approved',
      reportCount: 0
    };

    if (annGender) annoyanceData.riderGender = annGender;
    if (annAge) annoyanceData.riderAge = annAge;
    if (annContactName) annoyanceData.contactName = annContactName;
    if (annContactEmail) annoyanceData.contactEmail = annContactEmail;
    if (annContactConsent) annoyanceData.contactConsent = true;
    if (currentInfrastructure) annoyanceData.infrastructure = currentInfrastructure;

    const annDocRef = await db.collection('annoyances').add(annoyanceData);

    // Upload photos if provided
    if (selectedPhotos.annoyance.length > 0) {
      try {
        const photoURLs = await uploadPhotos(selectedPhotos.annoyance, 'annoyances', annDocRef.id);
        if (photoURLs.length > 0) await annDocRef.update({ photoURLs, photoURL: photoURLs[0] });
      } catch (e) { console.warn('Photo upload failed:', e); }
    }

    annoyancePanel.classList.remove('visible');
    if (placeholderMarker) {
      placeholderMarker.remove();
      placeholderMarker = null;
    }
    reportCoords = null;
    showToast('Annoyance reported. Thank you!');

  } catch (error) {
    console.error('Error submitting annoyance:', error);
    showToast('Error submitting report. Please try again.');
  }

  submitBtn.disabled = false;
  submitBtn.innerHTML = '<i class="fa-solid fa-face-rolling-eyes"></i> Submit Report';
});

// ============================================
// SUBMIT INCIDENT
// ============================================

document.getElementById('incident-submit').addEventListener('click', async () => {
  if (!reportCoords || !selectedType || !selectedScariness) return;

  const description = descEl.value.trim();
  if (description.length < 20) {
    showToast('Description must be at least 20 characters');
    return;
  }

  const submitBtn = document.getElementById('incident-submit');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;animation:spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4"/></svg> Submitting...';

  try {
    // Build dateTime
    const dateVal = document.getElementById('incident-date').value;
    const timeVal = document.getElementById('incident-time').value;
    const dateTime = new Date(`${dateVal}T${timeVal}`);

    // Get road name via reverse geocode
    let roadName = '';
    try {
      roadName = await reverseGeocode(reportCoords);
    } catch (e) {}

    // Collect optional rider fields
    const riderAge = document.getElementById('rider-age').value || null;
    const riderGender = document.getElementById('rider-gender').value || null;
    const rideType = document.getElementById('ride-type').value || null;
    const bikeType = document.getElementById('bike-type').value || null;

    // Contact fields
    const contactName = (document.getElementById('contact-name').value || '').trim() || null;
    const contactEmail = (document.getElementById('contact-email').value || '').trim() || null;
    const contactConsent = document.getElementById('contact-consent').checked;

    const incidentData = {
      geometry: {
        type: 'Point',
        coordinates: [reportCoords[0], reportCoords[1]]
      },
      location: new firebase.firestore.GeoPoint(reportCoords[1], reportCoords[0]),
      incidentType: selectedType,
      scariness: selectedScariness,
      contactMade: contactMade || false,
      injuryOccurred: injuryOccurred || false,
      otherParty: selectedParty || 'none',
      description: description,
      dateTime: firebase.firestore.Timestamp.fromDate(dateTime),
      roadName: roadName,
      conditions: {
        lighting: document.getElementById('incident-lighting').value || null,
        weather: document.getElementById('incident-weather').value || null,
        surface: document.getElementById('incident-surface').value || null
      },
      reportedBy: currentUser ? currentUser.uid : 'anonymous',
      reporterName: currentUser ? (currentUser.displayName || currentUser.email || 'Anonymous') : 'Anonymous',
      reportedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'approved',
      reportCount: 0
    };

    // Add rider info
    if (selectedReporter) incidentData.reportingFor = selectedReporter;
    if (riderAge) incidentData.riderAge = riderAge;
    if (riderGender) incidentData.riderGender = riderGender;
    if (rideType) incidentData.rideType = rideType;
    if (bikeType) incidentData.bikeType = bikeType;

    // Add contact info
    if (contactName) incidentData.contactName = contactName;
    if (contactEmail) incidentData.contactEmail = contactEmail;
    if (contactConsent) incidentData.contactConsent = true;

    // Add auto-detected infrastructure
    if (currentInfrastructure) incidentData.infrastructure = currentInfrastructure;

    const docRef = await db.collection('incidents').add(incidentData);

    // Upload photos if provided
    if (selectedPhotos.incident.length > 0) {
      try {
        const photoURLs = await uploadPhotos(selectedPhotos.incident, 'incidents', docRef.id);
        if (photoURLs.length > 0) await docRef.update({ photoURLs, photoURL: photoURLs[0] });
      } catch (e) { console.warn('Photo upload failed:', e); }
    }

    // Success
    incidentPanel.classList.remove('visible');
    if (placeholderMarker) {
      placeholderMarker.remove();
      placeholderMarker = null;
    }
    reportCoords = null;
    showToast('Incident reported. Thank you!');

  } catch (error) {
    console.error('Error submitting incident:', error);
    showToast('Error submitting report. Please try again.');
  }

  submitBtn.disabled = false;
  submitBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg> Submit Report';
});

// ============================================
// COMMUNITY FLAGGING
// ============================================

window.deleteIncident = async function(incidentId) {
  if (!currentUser || !isAdmin) return;
  if (!confirm('Delete this incident?')) return;
  try {
    await db.collection('incidents').doc(incidentId).delete();
    showToast('Incident deleted');
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Could not delete incident');
  }
};

window.deleteAnnoyance = async function(annoyanceId) {
  if (!currentUser || !isAdmin) return;
  if (!confirm('Delete this annoyance report?')) return;
  try {
    await db.collection('annoyances').doc(annoyanceId).delete();
    showToast('Annoyance deleted');
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Could not delete annoyance');
  }
};

window.flagReport = async function(collection, docId) {
  try {
    const ref = db.collection(collection).doc(docId);
    await ref.update({
      flagged: true,
      reportCount: firebase.firestore.FieldValue.increment(1)
    });
    showToast('Flagged for review. Thank you!');
  } catch (err) {
    console.error('Flag error:', err);
    showToast('Could not flag report');
  }
};

// ============================================
// AUTH
// ============================================

if (auth) {
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    isAdmin = false;

    const loginBtn = document.getElementById('nav-login-btn');
    const userInfo = document.getElementById('nav-user-info');
    const userName = document.getElementById('nav-user-name');

    if (user) {
      try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
          const role = userDoc.data().role || '';
          isAdmin = (role === 'admin' || role === 'moderator');
        }
      } catch (e) {
        console.error('Error fetching user role:', e);
      }
      // Show user info in navbar
      if (loginBtn) loginBtn.classList.add('hidden');
      if (userInfo) userInfo.classList.remove('hidden');
      if (userName) userName.textContent = user.displayName || user.email || 'User';
    } else {
      // Show login button
      if (loginBtn) loginBtn.classList.remove('hidden');
      if (userInfo) userInfo.classList.add('hidden');
    }
  });
}

window.showLoginModal = function() {
  document.getElementById('login-options').classList.remove('hidden');
  document.getElementById('email-form').classList.add('hidden');
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-modal').classList.remove('hidden');
  // Add backdrop
  let backdrop = document.getElementById('login-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'login-backdrop';
    backdrop.className = 'fixed inset-0 z-[1999] bg-black/50';
    backdrop.addEventListener('click', window.hideLoginModal);
    document.body.appendChild(backdrop);
  }
  backdrop.classList.remove('hidden');
};

window.hideLoginModal = function() {
  document.getElementById('login-modal').classList.add('hidden');
  const backdrop = document.getElementById('login-backdrop');
  if (backdrop) backdrop.classList.add('hidden');
};

window.showEmailForm = function() {
  document.getElementById('login-options').classList.add('hidden');
  document.getElementById('email-form').classList.remove('hidden');
};

window.showLoginOptions = function() {
  document.getElementById('login-options').classList.remove('hidden');
  document.getElementById('email-form').classList.add('hidden');
};

window.signInWithApple = async function() {
  try {
    const provider = new firebase.auth.OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    await auth.signInWithPopup(provider);
    hideLoginModal();
  } catch (error) {
    console.error('Apple sign-in error:', error);
    document.getElementById('login-error').textContent = error.message;
  }
};

window.signInWithGoogle = async function() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
    hideLoginModal();
  } catch (error) {
    console.error('Google sign-in error:', error);
    document.getElementById('login-error').textContent = error.message;
  }
};

window.signInWithEmail = async function() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    document.getElementById('login-error').textContent = 'Please enter email and password';
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    hideLoginModal();
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      try {
        await auth.createUserWithEmailAndPassword(email, password);
        hideLoginModal();
      } catch (createError) {
        document.getElementById('login-error').textContent = createError.message;
      }
    } else {
      document.getElementById('login-error').textContent = error.message;
    }
  }
};

// ============================================
// IMAGE LIGHTBOX
// ============================================

let lightboxUrls = [];
let lightboxIndex = 0;

window.openLightbox = function(urls, index) {
  lightboxUrls = Array.isArray(urls) ? urls : [urls];
  lightboxIndex = index || 0;
  const overlay = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  img.src = lightboxUrls[lightboxIndex];
  document.getElementById('lightbox-prev').style.display = lightboxUrls.length > 1 ? 'flex' : 'none';
  document.getElementById('lightbox-next').style.display = lightboxUrls.length > 1 ? 'flex' : 'none';
  const counter = document.getElementById('lightbox-counter');
  counter.textContent = lightboxUrls.length > 1 ? `${lightboxIndex + 1} / ${lightboxUrls.length}` : '';
  overlay.classList.add('active');
};

window.closeLightbox = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.closest('.lightbox-close')) return;
  document.getElementById('lightbox').classList.remove('active');
};

window.lightboxNav = function(e, dir) {
  e.stopPropagation();
  lightboxIndex = (lightboxIndex + dir + lightboxUrls.length) % lightboxUrls.length;
  document.getElementById('lightbox-img').src = lightboxUrls[lightboxIndex];
  const counter = document.getElementById('lightbox-counter');
  counter.textContent = lightboxUrls.length > 1 ? `${lightboxIndex + 1} / ${lightboxUrls.length}` : '';
};

// Keyboard nav
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('lightbox').classList.contains('active')) return;
  if (e.key === 'Escape') closeLightbox({ target: document.getElementById('lightbox'), currentTarget: document.getElementById('lightbox') });
  if (e.key === 'ArrowLeft') lightboxNav(e, -1);
  if (e.key === 'ArrowRight') lightboxNav(e, 1);
});

// ============================================
// PHOTO UPLOAD (multi-photo)
// ============================================

// Store selected files per panel (since input.files resets)
const selectedPhotos = { incident: [], annoyance: [] };

window.previewPhotos = function(input, panel) {
  const preview = document.getElementById(panel + '-photo-preview');
  const newFiles = Array.from(input.files);
  selectedPhotos[panel] = selectedPhotos[panel].concat(newFiles);
  renderPhotoPreviews(panel);
};

function renderPhotoPreviews(panel) {
  const preview = document.getElementById(panel + '-photo-preview');
  preview.innerHTML = '';
  if (selectedPhotos[panel].length === 0) {
    preview.classList.add('hidden');
    return;
  }
  preview.classList.remove('hidden');
  selectedPhotos[panel].forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wrap = document.createElement('div');
      wrap.className = 'relative inline-block';
      wrap.innerHTML = `
        <img src="${e.target.result}" class="h-20 w-20 object-cover rounded-lg border border-gray-200" />
        <button type="button" onclick="removeOnePhoto('${panel}',${i})" class="absolute -top-1.5 -right-1.5 size-5 inline-flex items-center justify-center bg-red-500 text-white rounded-full text-[10px] hover:bg-red-600">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;
      preview.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
}

window.removeOnePhoto = function(panel, index) {
  selectedPhotos[panel].splice(index, 1);
  renderPhotoPreviews(panel);
};

window.removePhoto = function(panel) {
  selectedPhotos[panel] = [];
  const inputId = panel === 'incident' ? 'incident-photo' : 'annoyance-photo';
  document.getElementById(inputId).value = '';
  renderPhotoPreviews(panel);
};

async function uploadPhotos(files, collection, docId) {
  if (!storage || !files || files.length === 0) return [];
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split('.').pop();
    const path = `${collection}/${docId}_${i}.${ext}`;
    const ref = storage.ref(path);
    await ref.put(file);
    urls.push(await ref.getDownloadURL());
  }
  return urls;
}

// ============================================
// SIGN OUT
// ============================================

window.signOut = async function() {
  if (auth) {
    await auth.signOut();
    showToast('Signed out');
  }
};

// ============================================
// ANONYMOUS TOGGLE
// ============================================

window.toggleAnon = function(btn, panel) {
  const fieldsId = panel === 'incident' ? 'contact-fields' : 'annoyance-contact-fields';
  const fields = document.getElementById(fieldsId);
  const isCurrentlySelected = btn.classList.contains('selected');

  if (isCurrentlySelected) {
    // Deselect — show fields again
    btn.classList.remove('selected', 'border-blue-500', 'bg-blue-50', 'text-blue-700');
    btn.classList.add('text-gray-500', 'border-gray-200');
    fields.classList.remove('hidden');
  } else {
    // Select — hide fields (post anonymously)
    btn.classList.add('selected', 'border-blue-500', 'bg-blue-50', 'text-blue-700');
    btn.classList.remove('text-gray-500', 'border-gray-200');
    fields.classList.add('hidden');
    // Clear contact fields
    const nameId = panel === 'incident' ? 'contact-name' : 'annoyance-contact-name';
    const emailId = panel === 'incident' ? 'contact-email' : 'annoyance-contact-email';
    const consentId = panel === 'incident' ? 'contact-consent' : 'annoyance-contact-consent';
    document.getElementById(nameId).value = '';
    document.getElementById(emailId).value = '';
    document.getElementById(consentId).checked = false;
  }
};

// ============================================
// HELPERS
// ============================================

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function formatParty(party) {
  return (party || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
