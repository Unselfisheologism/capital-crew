# Capital Crew — Android WebView App

Minimal Android wrapper that loads `https://capital-crew.pages.dev` in a full-screen WebView.

## Build

1. Open the `capital-crew-android` folder in Android Studio.
2. Let Gradle sync and download dependencies.
3. Build → Build APK / Build Bundle.

## Requirements

- Android Studio Hedgehog or newer
- JDK 17
- Android SDK 34

## Structure

```
capital-crew-android/
├── app/
│   ├── build.gradle.kts
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/capitalcrew/MainActivity.kt
│       └── res/
│           ├── drawable/          (launcher icon vectors)
│           ├── mipmap-anydpi-v26/ (adaptive icon)
│           └── values/            (colors, themes)
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
└── gradle/wrapper/
```
