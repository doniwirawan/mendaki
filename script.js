class MendakiViewer {
    constructor() {
        this.map = null;
        this.trackLayer = null;
        this.currentLocationMarker = null;
        this.watchId = null;
        this.currentPosition = null;
        this.trackData = [];

        // Overlay management
        this.locationTimeout = null;
        this.guideTimeout = null;

        // Local storage keys
        this.storageKey = 'mendaki_saved_tracks';
        this.activeTrackKey = 'mendaki_active_track';

        this.initializeMap();
        this.bindEvents();
        this.requestLocation();
        this.loadSavedTracks();
        this.loadActiveTrack(); // Load active track on start
        this.registerServiceWorker();
    }

    initializeMap() {
        this.map = L.map('map').setView([40.7128, -74.0060], 10);

        // Dark themed OpenStreetMap layer
        this.osmLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        });

        this.osmLayer.addTo(this.map);
    }

    bindEvents() {
        document.getElementById('gpxFile').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('locationBtn').addEventListener('click', () => this.goToCurrentLocation());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());
        document.getElementById('helpBtn').addEventListener('click', () => this.toggleFileGuide());
        document.getElementById('guideClose').addEventListener('click', () => this.hideFileGuide());
        document.getElementById('clearSavedBtn').addEventListener('click', () => this.clearAllSaved());

        // Trail selection events
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('trail-btn')) {
                this.loadSampleTrail(e.target.dataset.trail);
            }
            if (e.target.classList.contains('saved-item')) {
                this.loadSavedTrack(e.target.dataset.id);
            }
            if (e.target.classList.contains('delete-saved')) {
                e.stopPropagation();
                this.deleteSavedTrack(e.target.dataset.id);
            }
            // Handle outside clicks
            this.handleOutsideClick(e);
        });
    }

    handleOutsideClick(event) {
        const fileGuide = document.getElementById('fileGuide');
        const helpBtn = document.getElementById('helpBtn');

        // If the guide is not shown, do nothing
        if (!fileGuide.classList.contains('show')) {
            return;
        }

        // If the click is on the help button, do nothing
        if (helpBtn.contains(event.target)) {
            return;
        }

        // If the click is outside the file guide, hide it
        if (!fileGuide.contains(event.target)) {
            this.hideFileGuide();
        }
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

        // Hide file guide if showing
        this.hideFileGuide();

        locationOverlay.classList.add('active');

        const { lat, lng, accuracy, elevation } = this.currentPosition;
        locationCoords.textContent = `${lat.toFixed(4)}°, ${lng.toFixed(4)}° • ${Math.round(elevation)}m`;

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

        // Auto-hide after 5 seconds
        if (this.locationTimeout) {
            clearTimeout(this.locationTimeout);
        }
        this.locationTimeout = setTimeout(() => {
            locationOverlay.classList.remove('active');
        }, 5000);
    }

    updateCurrentLocationMarker() {
        if (!this.currentPosition) return;

        if (this.currentLocationMarker) {
            this.map.removeLayer(this.currentLocationMarker);
        }

        const { lat, lng } = this.currentPosition;

        // Enhanced human icon for current location
        const humanIcon = L.divIcon({
            html: `<div style="
                width: 32px; 
                height: 32px; 
                background: linear-gradient(135deg, #00D4AA 0%, #00F5CC 100%); 
                border: 3px solid #fff; 
                border-radius: 50%; 
                box-shadow: 0 4px 15px rgba(0, 212, 170, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                animation: pulse-location 2s infinite;
            ">🚶</div>
            <style>
                @keyframes pulse-location {
                    0%, 100% { transform: scale(1); box-shadow: 0 4px 15px rgba(0, 212, 170, 0.6); }
                    50% { transform: scale(1.1); box-shadow: 0 6px 20px rgba(0, 212, 170, 0.8); }
                }
            </style>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
            className: 'human-location-marker'
        });

        this.currentLocationMarker = L.marker([lat, lng], {
            icon: humanIcon
        }).bindPopup(`
            <div style="text-align: center; padding: 5px;">
                <strong style="color: #00D4AA;">📍 Your Location</strong><br>
                <span style="font-size: 0.85em;">Lat: ${lat.toFixed(6)}°</span><br>
                <span style="font-size: 0.85em;">Lng: ${lng.toFixed(6)}°</span><br>
                <span style="font-size: 0.85em;">Alt: ${Math.round(this.currentPosition.elevation)}m</span>
            </div>
        `);

        this.currentLocationMarker.addTo(this.map);
    }

    goToCurrentLocation() {
        if (this.currentPosition) {
            this.map.setView([this.currentPosition.lat, this.currentPosition.lng], 16);
            // Trigger location display when manually centering
            this.updateLocationDisplay();
        } else {
            console.log('Current location not available');
        }
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Hide all overlays when loading file
        this.hideAllOverlays();

        const fileName = file.name.toLowerCase();
        const supportedFormats = ['.gpx', '.kml', '.tcx', '.fit', '.kmz'];

        if (!supportedFormats.some(format => fileName.endsWith(format))) {
            console.log('Unsupported file format. Please select a GPX, KML, TCX, or FIT file.');
            return;
        }

        this.showLoading();

        try {
            const fileContent = await this.readFile(file);
            let fileType = '';

            if (fileName.endsWith('.gpx')) {
                fileType = 'gpx';
                this.parseAndDisplayGPX(fileContent);
            } else if (fileName.endsWith('.kml') || fileName.endsWith('.kmz')) {
                fileType = 'kml';
                this.parseAndDisplayKML(fileContent);
            } else if (fileName.endsWith('.tcx')) {
                fileType = 'tcx';
                this.parseAndDisplayTCX(fileContent);
            } else if (fileName.endsWith('.fit')) {
                console.log('FIT file support coming soon');
            }

            if (fileType) {
                this.saveTrackToStorage(file.name, fileContent, fileType);
                this.setActiveTrack(fileContent, fileType);
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

            // Enhanced start marker with flag icon
            const startIcon = L.divIcon({
                html: `<div style="
                    width: 32px; 
                    height: 32px; 
                    background: linear-gradient(135deg, ${colors[segmentIndex % colors.length]} 0%, #fff 100%); 
                    border: 3px solid #fff; 
                    border-radius: 8px; 
                    box-shadow: 0 4px 15px rgba(0,0,0,0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    font-weight: bold;
                    color: #000;
                    transform: rotate(-10deg);
                ">🚩</div>`,
                iconSize: [38, 38],
                iconAnchor: [19, 32],
                className: 'start-flag-marker'
            });

            const startMarker = L.marker([segment[0].lat, segment[0].lng], {
                icon: startIcon
            }).bindPopup(`
                <div style="text-align: center; padding: 5px;">
                    <strong style="color: #00D4AA;">🚩 Track ${segmentIndex + 1} Start</strong><br>
                    <span style="font-size: 0.85em;">Lat: ${segment[0].lat.toFixed(5)}°</span><br>
                    <span style="font-size: 0.85em;">Lng: ${segment[0].lng.toFixed(5)}°</span><br>
                    <span style="font-size: 0.85em;">Elevation: ${Math.round(segment[0].elevation || 0)}m</span>
                </div>
            `);
            this.trackLayer.addLayer(startMarker);

            // Enhanced finish marker with checkered flag
            const endPoint = segment[segment.length - 1];
            const endIcon = L.divIcon({
                html: `<div style="
                    width: 32px; 
                    height: 32px; 
                    background: linear-gradient(135deg, #000 0%, #fff 50%, #000 100%); 
                    border: 3px solid ${colors[segmentIndex % colors.length]}; 
                    border-radius: 8px; 
                    box-shadow: 0 4px 15px rgba(0,0,0,0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    font-weight: bold;
                    color: #fff;
                    transform: rotate(10deg);
                ">🏁</div>`,
                iconSize: [38, 38],
                iconAnchor: [19, 32],
                className: 'finish-flag-marker'
            });

            const endMarker = L.marker([endPoint.lat, endPoint.lng], {
                icon: endIcon
            }).bindPopup(`
                <div style="text-align: center; padding: 5px;">
                    <strong style="color: #00D4AA;">🏁 Track ${segmentIndex + 1} Finish</strong><br>
                    <span style="font-size: 0.85em;">Lat: ${endPoint.lat.toFixed(5)}°</span><br>
                    <span style="font-size: 0.85em;">Lng: ${endPoint.lng.toFixed(5)}°</span><br>
                    <span style="font-size: 0.85em;">Elevation: ${Math.round(endPoint.elevation || 0)}m</span>
                </div>
            `);
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
        // Hide all overlays
        this.hideAllOverlays();

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

        // Clear active track from local storage
        localStorage.removeItem(this.activeTrackKey);

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
        const locationOverlay = document.getElementById('locationOverlay');

        if (fileGuide.classList.contains('show')) {
            this.hideFileGuide();
        } else {
            // Hide location overlay if showing
            locationOverlay.classList.remove('active');
            if (this.locationTimeout) {
                clearTimeout(this.locationTimeout);
            }

            fileGuide.classList.add('show');
        }
    }

    hideFileGuide() {
        const fileGuide = document.getElementById('fileGuide');
        fileGuide.classList.remove('show');
        if (this.guideTimeout) {
            clearTimeout(this.guideTimeout);
        }
    }

    hideAllOverlays() {
        document.getElementById('locationOverlay').classList.remove('active');
        document.getElementById('fileGuide').classList.remove('show');
        if (this.locationTimeout) clearTimeout(this.locationTimeout);
        if (this.guideTimeout) clearTimeout(this.guideTimeout);
    }

    // Local Storage Management
    saveTrackToStorage(filename, content, type) {
        try {
            const savedTracks = this.getSavedTracks();
            const trackId = Date.now().toString();
            const track = {
                id: trackId,
                name: filename.replace(/\.(gpx|kml|tcx)$/i, ''),
                content: content,
                type: type,
                date: new Date().toISOString(),
                size: content.length
            };

            savedTracks[trackId] = track;
            localStorage.setItem(this.storageKey, JSON.stringify(savedTracks));
            this.updateSavedTracksList();
            console.log(`Track "${filename}" saved to local storage`);
        } catch (error) {
            console.log('Failed to save track to local storage:', error);
        }
    }

    getSavedTracks() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            return {};
        }
    }

    loadSavedTracks() {
        this.updateSavedTracksList();
    }

    updateSavedTracksList() {
        const savedList = document.getElementById('savedList');
        const clearBtn = document.getElementById('clearSavedBtn');
        const savedTracks = this.getSavedTracks();
        const trackIds = Object.keys(savedTracks);

        if (trackIds.length === 0) {
            savedList.innerHTML = '<div class="no-saved">No saved tracks yet</div>';
            clearBtn.disabled = true;
            return;
        }

        clearBtn.disabled = false;
        savedList.innerHTML = '';

        trackIds.slice(-5).reverse().forEach(id => { // Show last 5, newest first
            const track = savedTracks[id];
            const date = new Date(track.date).toLocaleDateString();
            const size = (track.size / 1024).toFixed(1) + 'KB';

            const item = document.createElement('div');
            item.className = 'saved-item';
            item.dataset.id = id;
            item.innerHTML = `
                <div>
                    <div class="saved-name">${track.name}</div>
                    <div class="saved-date">${date} • ${size}</div>
                </div>
                <button class="delete-saved" data-id="${id}">×</button>
            `;
            savedList.appendChild(item);
        });
    }

    loadSavedTrack(trackId) {
        const savedTracks = this.getSavedTracks();
        const track = savedTracks[trackId];

        if (!track) {
            console.log('Track not found');
            return;
        }

        this.hideFileGuide();
        this.showLoading();

        try {
            if (track.type === 'gpx') {
                this.parseAndDisplayGPX(track.content);
            } else if (track.type === 'kml') {
                this.parseAndDisplayKML(track.content);
            } else if (track.type === 'tcx') {
                this.parseAndDisplayTCX(track.content);
            }
            this.setActiveTrack(track.content, track.type);
            console.log(`Loaded saved track: ${track.name}`);
        } catch (error) {
            console.log('Error loading saved track:', error);
        } finally {
            this.hideLoading();
        }
    }

    deleteSavedTrack(trackId) {
        const savedTracks = this.getSavedTracks();
        delete savedTracks[trackId];
        localStorage.setItem(this.storageKey, JSON.stringify(savedTracks));
        this.updateSavedTracksList();
    }

    clearAllSaved() {
        if (confirm('Clear all saved tracks? This cannot be undone.')) {
            localStorage.removeItem(this.storageKey);
            this.updateSavedTracksList();
        }
    }

    // Sample Trail Loading
    async loadSampleTrail(trailName) {
        this.hideFileGuide();
        this.showLoading();

        try {
            const gpxContent = await this.loadAndParseGPX(trailName);
            this.parseAndDisplayGPX(gpxContent);
            this.saveTrackToStorage(`${trailName}.gpx`, gpxContent, 'gpx');
            this.setActiveTrack(gpxContent, 'gpx');
            console.log(`Loaded sample trail: ${trailName}`);
        } catch (error) {
            console.log('Error loading sample trail:', error);
        } finally {
            this.hideLoading();
        }
    }

    async loadAndParseGPX(trailName) {
        try {
            const response = await fetch(`gpx/${trailName}.gpx`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const gpxContent = await response.text();
            return gpxContent;
        } catch (error) {
            console.error('Error fetching or parsing GPX file:', error);
            throw error;
        }
    }

    loadActiveTrack() {
        try {
            const activeTrack = localStorage.getItem(this.activeTrackKey);
            if (activeTrack) {
                const track = JSON.parse(activeTrack);
                if (track && track.content && track.type) {
                    this.showLoading();
                    if (track.type === 'gpx') {
                        this.parseAndDisplayGPX(track.content);
                    } else if (track.type === 'kml') {
                        this.parseAndDisplayKML(track.content);
                    } else if (track.type === 'tcx') {
                        this.parseAndDisplayTCX(track.content);
                    }
                    console.log('Loaded active track from last session');
                    this.hideLoading();
                }
            }
        } catch (error) {
            console.log('Could not load active track:', error);
            localStorage.removeItem(this.activeTrackKey);
        }
    }

    setActiveTrack(content, type) {
        try {
            const track = { content, type };
            localStorage.setItem(this.activeTrackKey, JSON.stringify(track));
        } catch (error) {
            console.log('Failed to set active track:', error);
        }
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