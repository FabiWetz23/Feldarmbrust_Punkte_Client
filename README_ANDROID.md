# Feldarmbrust Tablet App – Android (Capacitor)

Diese ZIP enthält die React/Vite Tablet-App **vorbereitet für Capacitor**, damit du daraus eine **echte Android-App (APK/AAB)** bauen kannst.

## Voraussetzungen
- Node.js (LTS)
- Android Studio inkl. Android SDKs

## Schritte (im Projektordner)

1) Abhängigkeiten installieren
```bash
npm install
```

2) Capacitor initialisieren (einmalig)
```bash
npm run cap:init
```

3) Android-Projekt erzeugen (einmalig)
```bash
npm run cap:add:android
```

4) (Wichtig) HTTP Zugriff auf den Laptop-Server erlauben (Cleartext)
Öffne:
`android/app/src/main/AndroidManifest.xml`

Im `<application ...>` Tag ergänzen:
```xml
android:usesCleartextTraffic="true"
```

5) Synchronisieren (immer nach Änderungen am Web-Code)
```bash
npm run cap:sync
```

6) Android Studio öffnen
```bash
npm run cap:open
```

Dann in Android Studio:
- **Build → Build Bundle(s)/APK(s) → Build APK(s)**

## Hinweis zur Server-URL
In der App unter „Setup“ die Server-URL eintragen, z.B.:
`http://192.168.0.10:8000`

Laptop & Android-Gerät müssen im selben WLAN sein (oder Laptop-Hotspot).
