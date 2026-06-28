@echo off
setlocal
echo ==============================================
echo        Aether SSH Automated Builder
echo ==============================================

if "%~1"=="" (
    set /p VERSION="Enter release version (e.g. V1.0.1): "
) else (
    set "VERSION=%~1"
)

if "%VERSION%"=="" (
    echo [ERROR] Version cannot be empty!
    pause
    exit /b 1
)

echo [1/3] Configuring Go and NSIS environment...
for %%I in ("%~dp0..\..") do set "ROOT_DIR=%%~fI"
set "GO_BIN=%ROOT_DIR%\GO\go\bin"
set "NSIS_DIR=%ROOT_DIR%\GO\Packaging_Tools\nsis\nsis-3.08"
set "PATH=%GO_BIN%;%NSIS_DIR%;%USERPROFILE%\go\bin;%PATH%"

echo [2/3] Building setup installer using Wails...
cd /d "%~dp0"
call wails build -clean -upx -nsis

set "EXE_PATH="
for %%f in (build\bin\*installer.exe) do (
    set "EXE_PATH=%%f"
    goto :found_exe
)

:found_exe
if "%EXE_PATH%"=="" (
    echo [ERROR] Build failed, setup installer not found.
    if "%~1"=="" pause
    exit /b 1
)

echo [3/3] Archiving setup installer...
set "OUTPUT_DIR=%ROOT_DIR%\GO\exe"
set "PORTABLE_DIR=%ROOT_DIR%\GO\Portable"
if not exist "%OUTPUT_DIR%" (
    mkdir "%OUTPUT_DIR%"
)
if not exist "%PORTABLE_DIR%" (
    mkdir "%PORTABLE_DIR%"
)

copy /y "%EXE_PATH%" "%OUTPUT_DIR%\Aether_Setup_%VERSION%.exe" >nul
copy /y "build\bin\Aether.exe" "%PORTABLE_DIR%\Aether_Portable_%VERSION%.exe" >nul

echo.
echo ==============================================
echo   SUCCESS! 
echo   File saved to: %OUTPUT_DIR%\Aether_Setup_%VERSION%.exe
echo ==============================================
if "%~1"=="" pause
