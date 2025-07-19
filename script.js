// script.js
class GPXViewer {
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
        document.getElementById('gpxFile').addEventListener('change', (e) => this.handleGPXUpload(e));
        document.getElementById('locationBtn').addEventListener('click', () => this.goToCurrentLocation());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());
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
            this.showError('Current location not available.');
        }
    }

    async handleGPXUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.gpx')) {
            this.showError('Please select a valid GPX file.');
            return;
        }

        this.showLoading();

        try {
            const gpxContent = await this.readFile(file);
            this.parseAndDisplayGPX(gpxContent);
        } catch (error) {
            this.showError('Error reading GPX file: ' + error.message);
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

                        if (!isNaN(lat) && !isNaN(lon)) {
                            routePoints.push({
                                lat,
                                lng: lon,
                                elevation: ele ? parseFloat(ele) : 0
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
            this.showError('Error parsing GPX file: ' + error.message);
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

            // Add start marker for each segment
            const startMarker = L.marker([segment[0].lat, segment[0].lng], {
                icon: L.divIcon({
                    html: segmentIndex === 0 ? '🟢' : '🔵',
                    iconSize: [20, 20],
                    className: 'emoji-marker'
                })
            }).bindPopup(`Segment ${segmentIndex + 1} Start`);
            this.trackLayer.addLayer(startMarker);

            // Add end marker for each segment
            const endPoint = segment[segment.length - 1];
            const endMarker = L.marker([endPoint.lat, endPoint.lng], {
                icon: L.divIcon({
                    html: segmentIndex === trackSegments.length - 1 ? '🏁' : '🔴',
                    iconSize: [20, 20],
                    className: 'emoji-marker'
                })
            }).bindPopup(`Segment ${segmentIndex + 1} End`);
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

    showError(message) {
        const errorToast = document.getElementById('errorToast');
        errorToast.textContent = message;
        errorToast.classList.add('show');

        setTimeout(() => {
            errorToast.classList.remove('show');
        }, 4000);
    }

    showSuccess(message) {
        const successToast = document.createElement('div');
        successToast.className = 'error-toast';
        successToast.style.background = '#00D4AA';
        successToast.style.color = '#000';
        successToast.textContent = message;
        document.body.appendChild(successToast);

        setTimeout(() => successToast.classList.add('show'), 100);
        setTimeout(() => {
            successToast.classList.remove('show');
            setTimeout(() => document.body.removeChild(successToast), 300);
        }, 3000);
    }
}

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swCode = `
                    const CACHE_NAME = 'gpx-viewer-v1';
                    const urlsToCache = [
                        './',
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
            .then(() => console.log('SW registered'))
            .catch(() => console.log('SW registration failed'));
    });
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new GPXViewer();
});
