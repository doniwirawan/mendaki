class MendakiViewer {
    constructor() {
        this.map = null;
        this.trackLayer = null;
        this.currentLocationMarker = null;
        this.watchId = null;
        this.currentPosition = null;
        this.trackData = [];

        this.initializeMap();
        this.bindEvents();
        this.requestLocation();
        this.registerServiceWorker();
    }

    initializeMap() {
        this.map = L.map('map').setView([40.7128, -74.0060], 10);

        // OpenStreetMap layer
        this.osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        });

        this.osmLayer.addTo(this.map);
    }

    bindEvents() {
        document.getElementById('gpxFile').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('locationBtn').addEventListener('click', () => this.goToCurrentLocation());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());
        document.getElementById('helpBtn').addEventListener('click', () => this.toggleFileGuide());
        document.getElementById('guideClose').addEventListener('click', () => this.hideFileGuide());
    }

    async requestLocation() {
        if (!navigator.geolocation) {
            return;
        }

        try {
            const position = await this.getCurrentPosition();
            this.handleLocationUpdate(position);

            this.watchId = navigator.geolocation.watchPosition(
                (position) => this.handleLocationUpdate(position),
                (error) => console.log('Location error:', error),
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 5000
                }
            );
        } catch (error) {
            console.log('Location error:', error);
        }
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 60000
            });
        });
    }

    handleLocationUpdate(position) {
        const { latitude, longitude, accuracy, altitude } = position.coords;

        this.currentPosition = {
            lat: latitude,
            lng: longitude,
            accuracy: accuracy,
            elevation: altitude || 0
        };

        this.updateLocationDisplay();
        this.updateCurrentLocationMarker();

        // Center map on first location
        if (!this.hasInitialLocation) {
            this.map.setView([latitude, longitude], 14);
            this.hasInitialLocation = true;
        }
    }

    updateLocationDisplay() {
        if (!this.currentPosition) return;

        const locationOverlay = document.getElementById('locationOverlay');
        const locationCoords = document.getElementById('locationCoords');
        const accuracyBadge = document.getElementById('accuracyBadge');

        locationOverlay.classList.add('active');

        const { lat, lng, accuracy, elevation } = this.currentPosition;
        locationCoords.textContent = `${lat.toFixed(5)}°, ${lng.toFixed(5)}° • ${Math.round(elevation)}m`;

        // Update accuracy
        let accuracyClass = 'accuracy-low';
        let accuracyText = 'Low';

        if (accuracy < 10) {
            accuracyClass = 'accuracy-high';
            accuracyText = 'High';
        } else if (accuracy < 30) {
            accuracyClass = 'accuracy-medium';
            accuracyText = 'Medium';
        }

        accuracyBadge.className = `accuracy-badge ${accuracyClass}`;
        accuracyBadge.textContent = `${accuracyText} (±${Math.round(accuracy)}m)`;
    }

    updateCurrentLocationMarker() {
        if (!this.currentPosition) return;

        if (this.currentLocationMarker) {
            this.map.removeLayer(this.currentLocationMarker);
        }

        const { lat, lng } = this.currentPosition;

        this.currentLocationMarker = L.circleMarker([lat, lng], {
            color: '#00D4AA',
            fillColor: '#00D4AA',
            fillOpacity: 0.8,
            radius: 8,
            weight: 3
        }).bindPopup('Your Location');

        this.currentLocationMarker.addTo(this.map);
    }

    goToCurrentLocation() {
        if (this.currentPosition) {
            this.map.setView([this.currentPosition.lat, this.currentPosition.lng], 16);
        } else {
            console.log('Current location not available');
        }
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const fileName = file.name.toLowerCase();
        const supportedFormats = ['.gpx', '.kml', '.tcx', '.fit', '.kmz'];

        if (!supportedFormats.some(format => fileName.endsWith(format))) {
            console.log('Unsupported file format. Please select a GPX, KML, TCX, or FIT file.');
            return;
        }

        this.showLoading();

        try {
            const fileContent = await this.readFile(file);

            if (fileName.endsWith('.gpx')) {
                this.parseAndDisplayGPX(fileContent);
            } else if (fileName.endsWith('.kml') || fileName.endsWith('.kmz')) {
                this.parseAndDisplayKML(fileContent);
            } else if (fileName.endsWith('.tcx')) {
                this.parseAndDisplayTCX(fileContent);
            } else if (fileName.endsWith('.fit')) {
                console.log('FIT file support coming soon');
            }
        } catch (error) {
            console.log('Error reading file:', error.message);
        } finally {
            this.hideLoading();
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    parseAndDisplayGPX(gpxContent) {
        try {
            const parser = new DOMParser();
            const gpxDoc = parser.parseFromString(gpxContent, 'text/xml');

            if (gpxDoc.querySelector('parsererror')) {
                throw new Error('Invalid GPX format');
            }

            const trackSegments = [];

            // Parse tracks with multiple segments
            const tracks = gpxDoc.querySelectorAll('trk');
            tracks.forEach(track => {
                const segments = track.querySelectorAll('trkseg');
                segments.forEach(segment => {
                    const segmentPoints = [];
                    const trkpts = segment.querySelectorAll('trkpt');

                    trkpts.forEach(trkpt => {
                        const lat = parseFloat(trkpt.getAttribute('lat'));
                        const lon = parseFloat(trkpt.getAttribute('lon'));
                        const ele = trkpt.querySelector('ele')?.textContent;
                        const time = trkpt.querySelector('time')?.textContent;

                        if (!isNaN(lat) && !isNaN(lon)) {
                            segmentPoints.push({
                                lat,
                                lng: lon,
                                elevation: ele ? parseFloat(ele) : 0,
                                timestamp: time ? new Date(time) : new Date()
                            });
                        }
                    });

                    if (segmentPoints.length > 0) {
                        trackSegments.push(segmentPoints);
                    }
                });
            });

            // If no tracks, try routes
            if (trackSegments.length === 0) {
                const routes = gpxDoc.querySelectorAll('rte');
                routes.forEach(route => {
                    const routePoints = [];
                    const rtepts = route.querySelectorAll('rtept');

                    rtepts.forEach(rtept => {
                        const lat = parseFloat(rtept.getAttribute('lat'));
                        const lon = parseFloat(rtept.getAttribute('lon'));
                        const ele = rtept.querySelector('ele')?.textContent;
                        const time = rtept.querySelector('time')?.textContent;

                        if (!isNaN(lat) && !isNaN(lon)) {
                            routePoints.push({
                                lat,
                                lng: lon,
                                elevation: ele ? parseFloat(ele) : 0,
                                timestamp: time ? new Date(time) : new Date()
                            });
                        }
                    });

                    if (routePoints.length > 0) {
                        trackSegments.push(routePoints);
                    }
                });
            }

            // If no tracks or routes, try waypoints
            if (trackSegments.length === 0) {
                const waypointGroup = [];
                const waypoints = gpxDoc.querySelectorAll('wpt');
                waypoints.forEach(wpt => {
                    const lat = parseFloat(wpt.getAttribute('lat'));
                    const lon = parseFloat(wpt.getAttribute('lon'));
                    const ele = wpt.querySelector('ele')?.textContent;

                    if (!isNaN(lat) && !isNaN(lon)) {
                        waypointGroup.push({
                            lat,
                            lng: lon,
                            elevation: ele ? parseFloat(ele) : 0
                        });
                    }
                });

                if (waypointGroup.length > 0) {
                    trackSegments.push(waypointGroup);
                }
            }

            if (trackSegments.length === 0) {
                throw new Error('No valid GPS points found in GPX file');
            }

            this.displayTrackSegments(trackSegments);
            this.updateTrackStats(trackSegments);

        } catch (error) {
            console.log('Error parsing GPX file:', error.message);
        }
    }

    parseAndDisplayKML(kmlContent) {
        try {
            const parser = new DOMParser();
            const kmlDoc = parser.parseFromString(kmlContent, 'text/xml');

            if (kmlDoc.querySelector('parsererror')) {
                throw new Error('Invalid KML format');
            }

            const trackSegments = [];

            // Parse LineString coordinates (tracks)
            const lineStrings = kmlDoc.querySelectorAll('LineString coordinates');
            lineStrings.forEach(lineString => {
                const coordsText = lineString.textContent.trim();
                const segmentPoints = [];

                coordsText.split(/\s+/).forEach(coordPair => {
                    const coords = coordPair.split(',');
                    if (coords.length >= 2) {
                        const lng = parseFloat(coords[0]);
                        const lat = parseFloat(coords[1]);
                        const elevation = coords[2] ? parseFloat(coords[2]) : 0;

                        if (!isNaN(lat) && !isNaN(lng)) {
                            segmentPoints.push({
                                lat,
                                lng,
                                elevation
                            });
                        }
                    }
                });

                if (segmentPoints.length > 0) {
                    trackSegments.push(segmentPoints);
                }
            });

            // Parse Point coordinates (waypoints)
            const points = kmlDoc.querySelectorAll('Point coordinates');
            if (points.length > 0 && trackSegments.length === 0) {
                const waypointGroup = [];
                points.forEach(point => {
                    const coordsText = point.textContent.trim();
                    const coords = coordsText.split(',');
                    if (coords.length >= 2) {
                        const lng = parseFloat(coords[0]);
                        const lat = parseFloat(coords[1]);
                        const elevation = coords[2] ? parseFloat(coords[2]) : 0;

                        if (!isNaN(lat) && !isNaN(lng)) {
                            waypointGroup.push({
                                lat,
                                lng,
                                elevation
                            });
                        }
                    }
                });

                if (waypointGroup.length > 0) {
                    trackSegments.push(waypointGroup);
                }
            }

            if (trackSegments.length === 0) {
                throw new Error('No valid GPS points found in KML file');
            }

            this.displayTrackSegments(trackSegments);
            this.updateTrackStats(trackSegments);

        } catch (error) {
            console.log('Error parsing KML file:', error.message);
        }
    }

    parseAndDisplayTCX(tcxContent) {
        try {
            const parser = new DOMParser();
            const tcxDoc = parser.parseFromString(tcxContent, 'text/xml');

            if (tcxDoc.querySelector('parsererror')) {
                throw new Error('Invalid TCX format');
            }

            const trackSegments = [];

            // Parse TCX trackpoints
            const trackpoints = tcxDoc.querySelectorAll('Trackpoint');
            const segmentPoints = [];

            trackpoints.forEach(trackpoint => {
                const position = trackpoint.querySelector('Position');
                if (position) {
                    const lat = parseFloat(position.querySelector('LatitudeDegrees')?.textContent);
                    const lng = parseFloat(position.querySelector('LongitudeDegrees')?.textContent);
                    const elevation = parseFloat(trackpoint.querySelector('AltitudeMeters')?.textContent || 0);
                    const time = trackpoint.querySelector('Time')?.textContent;

                    if (!isNaN(lat) && !isNaN(lng)) {
                        segmentPoints.push({
                            lat,
                            lng,
                            elevation,
                            timestamp: time ? new Date(time) : new Date()
                        });
                    }
                }
            });

            if (segmentPoints.length > 0) {
                trackSegments.push(segmentPoints);
            }

            if (trackSegments.length === 0) {
                throw new Error('No valid GPS points found in TCX file');
            }

            this.displayTrackSegments(trackSegments);
            this.updateTrackStats(trackSegments);

        } catch (error) {
            console.log('Error parsing TCX file:', error.message);
        }
    }

    displayTrackSegments(trackSegments) {
        // Clear existing tracks
        if (this.trackLayer) {
            this.map.removeLayer(this.trackLayer);
        }

        this.trackLayer = L.layerGroup();
        const allBounds = [];

        // Color variations for different segments
        const colors = ['#00D4AA', '#FFC107', '#DC3545', '#2196F3', '#9C27B0'];

        trackSegments.forEach((segment, segmentIndex) => {
            if (segment.length === 0) return;

            const latLngs = segment.map(point => [point.lat, point.lng]);
            allBounds.push(...latLngs);

            // Create polyline for this segment
            const trackLine = L.polyline(latLngs, {
                color: colors[segmentIndex % colors.length],
                weight: 4,
                opacity: 0.8
            });
            this.trackLayer.addLayer(trackLine);

            // Enhanced start marker
            const startIcon = L.divIcon({
                html: `<div style="
                    width: 24px; 
                    height: 24px; 
                    background: ${colors[segmentIndex % colors.length]}; 
                    border: 3px solid #fff; 
                    border-radius: 50%; 
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                    color: #000;
                ">●</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15],
                className: 'custom-marker'
            });

            const startMarker = L.marker([segment[0].lat, segment[0].lng], {
                icon: startIcon
            }).bindPopup(`<strong>Track ${segmentIndex + 1} Start</strong><br>
                Lat: ${segment[0].lat.toFixed(5)}°<br>
                Lng: ${segment[0].lng.toFixed(5)}°<br>
                Elevation: ${Math.round(segment[0].elevation || 0)}m`);
            this.trackLayer.addLayer(startMarker);

            // Enhanced end marker
            const endPoint = segment[segment.length - 1];
            const endIcon = L.divIcon({
                html: `<div style="
                    width: 24px; 
                    height: 24px; 
                    background: #fff; 
                    border: 3px solid ${colors[segmentIndex % colors.length]}; 
                    border-radius: 4px; 
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                    color: ${colors[segmentIndex % colors.length]};
                ">■</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15],
                className: 'custom-marker'
            });

            const endMarker = L.marker([endPoint.lat, endPoint.lng], {
                icon: endIcon
            }).bindPopup(`<strong>Track ${segmentIndex + 1} End</strong><br>
                Lat: ${endPoint.lat.toFixed(5)}°<br>
                Lng: ${endPoint.lng.toFixed(5)}°<br>
                Elevation: ${Math.round(endPoint.elevation || 0)}m`);
            this.trackLayer.addLayer(endMarker);
        });

        this.trackLayer.addTo(this.map);

        // Fit bounds to all segments
        if (allBounds.length > 0) {
            const bounds = L.latLngBounds(allBounds);
            this.map.fitBounds(bounds, { padding: [20, 20] });
        }

        // Store track data
        this.trackData = trackSegments;
    }

    updateTrackStats(trackSegments) {
        let totalDistance = 0;
        let maxElevation = 0;
        let totalPoints = 0;

        // Flatten all segments for stats
        const allPoints = [];
        trackSegments.forEach(segment => {
            allPoints.push(...segment);
            totalPoints += segment.length;
        });

        if (allPoints.length === 0) return;

        // Calculate distance and elevation
        for (let i = 1; i < allPoints.length; i++) {
            const prev = allPoints[i - 1];
            const curr = allPoints[i];
            totalDistance += this.calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
            maxElevation = Math.max(maxElevation, curr.elevation || 0);
        }

        // Update track info display
        document.getElementById('trackDistance').textContent = (totalDistance / 1000).toFixed(2);
        document.getElementById('trackPoints').textContent = totalPoints.toLocaleString();
        document.getElementById('trackElevation').textContent = Math.round(maxElevation);

        // Show track info overlay
        document.getElementById('trackInfo').classList.add('active');
    }

    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Earth's radius in meters
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    clearAll() {
        // Clear track layer
        if (this.trackLayer) {
            this.map.removeLayer(this.trackLayer);
            this.trackLayer = null;
        }

        // Reset track data
        this.trackData = [];

        // Hide track info
        document.getElementById('trackInfo').classList.remove('active');

        // Reset file input
        document.getElementById('gpxFile').value = '';

        // Reset track stats
        document.getElementById('trackDistance').textContent = '0.00';
        document.getElementById('trackPoints').textContent = '0';
        document.getElementById('trackElevation').textContent = '0';

        // Return to default view if no current location
        if (!this.currentPosition) {
            this.map.setView([40.7128, -74.0060], 10);
        }
    }

    showLoading() {
        document.getElementById('loading').classList.add('show');
    }

    hideLoading() {
        document.getElementById('loading').classList.remove('show');
    }

    toggleFileGuide() {
        const fileGuide = document.getElementById('fileGuide');
        fileGuide.classList.toggle('show');
    }

    hideFileGuide() {
        document.getElementById('fileGuide').classList.remove('show');
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                const swCode = `
                    const CACHE_NAME = 'mendaki-v1';
                    const urlsToCache = [
                        './',
                        './index.html',
                        './style.css',
                        './script.js',
                        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
                        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
                    ];

                    self.addEventListener('install', event => {
                        event.waitUntil(
                            caches.open(CACHE_NAME)
                                .then(cache => cache.addAll(urlsToCache))
                        );
                    });

                    self.addEventListener('fetch', event => {
                        event.respondWith(
                            caches.match(event.request)
                                .then(response => {
                                    if (response) {
                                        return response;
                                    }
                                    return fetch(event.request);
                                })
                        );
                    });
                `;

                const blob = new Blob([swCode], { type: 'application/javascript' });
                const swUrl = URL.createObjectURL(blob);

                navigator.serviceWorker.register(swUrl)
                    .then(() => console.log('Service Worker registered'))
                    .catch(() => console.log('Service Worker registration failed'));
            });
        }
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new MendakiViewer();
});