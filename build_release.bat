@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   SOUNDWAVE PRODUCTION RELEASE BUILD ENGINE
echo   R8 Obfuscation - Minification - Keystore Signed
echo ===================================================
echo.

set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo [1/4] Building production Web bundle with Vite (Tree-shaking ^& Console Strip)...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Web build failed!
    exit /b 1
)

echo [2/4] Syncing Capacitor Android assets...
call npx cap sync android
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Capacitor sync failed!
    exit /b 1
)

echo [3/4] Compiling Signed Production Release APK with R8 Optimization...
cd android
call gradlew.bat assembleRelease
if %ERRORLEVEL% neq 0 (
    echo [ERROR] assembleRelease failed!
    cd ..
    exit /b 1
)

echo [4/4] Compiling Signed Production Android App Bundle (.aab) for Google Play...
call gradlew.bat bundleRelease
if %ERRORLEVEL% neq 0 (
    echo [ERROR] bundleRelease failed!
    cd ..
    exit /b 1
)
cd ..

echo.
echo ===================================================
echo   PRODUCTION BUILD COMPLETE!
echo.
echo   [APK] android\app\build\outputs\apk\release\app-release.apk
echo   [AAB] android\app\build\outputs\bundle\release\app-release.aab
echo ===================================================
