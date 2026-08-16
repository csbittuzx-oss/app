@echo off
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ADB=C:\Users\BITTU\AppData\Local\Android\Sdk\platform-tools\adb.exe"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo [1/4] Building web app...
cd /d "c:\atprojects\mui"
call npm run build
if %errorlevel% neq 0 ( echo BUILD FAILED & exit /b 1 )

echo [2/4] Syncing Capacitor...
call npx cap sync android
if %errorlevel% neq 0 ( echo SYNC FAILED & exit /b 1 )

echo [3/4] Building APK...
cd /d "c:\atprojects\mui\android"
call gradlew.bat assembleDebug
if %errorlevel% neq 0 ( echo GRADLE BUILD FAILED & exit /b 1 )

echo [4/4] Installing on device...
"%ADB%" wait-for-device
"%ADB%" install -r "app\build\outputs\apk\debug\app-debug.apk"
echo INSTALL DONE
