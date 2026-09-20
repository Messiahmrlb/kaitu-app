@echo off
REM Build debug APK for kaitu-app (open-soil-record app).
REM Requires: JDK 17 at C:\Program Files\Java\jdk-17, Android SDK at C:\Android\Sdk.
REM One-time: this script triggers Gradle 8.2.1 + AGP/AndroidX download on first run (needs internet).

set JAVA_HOME=C:\Program Files\Java\jdk-17
set ANDROID_HOME=C:\Android\Sdk

cd /d %~dp0

echo [1/3] Building web bundle (npm run build)...
call npm run build
if errorlevel 1 goto fail

echo [2/3] Syncing Capacitor native project (npx cap sync)...
call npx cap sync
if errorlevel 1 goto fail

echo [3/3] Building debug APK (gradlew assembleDebug)...
cd android
if not exist local.properties (
  echo sdk.dir=%ANDROID_HOME%> local.properties
)
call gradlew.bat assembleDebug
if errorlevel 1 goto fail

echo.
echo ============================================
echo  APK BUILT SUCCESSFULLY
echo  Path: android\app\build\outputs\apk\debug\app-debug.apk
echo  Install: adb install android\app\build\outputs\apk\debug\app-debug.apk
echo ============================================
goto end

:fail
echo.
echo BUILD FAILED - check errors above.
pause
:end
