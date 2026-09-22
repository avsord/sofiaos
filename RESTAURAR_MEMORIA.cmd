@echo off
setlocal
cd /d "%~dp0"
set "SOFIA_NODE="
if exist "%ProgramFiles%\nodejs\node.exe" set "SOFIA_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined SOFIA_NODE if exist "C:\Program Files\nodejs\node.exe" set "SOFIA_NODE=C:\Program Files\nodejs\node.exe"
if not defined SOFIA_NODE for /f "delims=" %%N in ('where.exe node.exe 2^>nul') do if not defined SOFIA_NODE set "SOFIA_NODE=%%N"
if not defined SOFIA_NODE (
  echo ERRO: Node nao foi localizado. Nenhuma instalacao ou configuracao foi alterada.
  pause
  exit /b 1
)
title Sofia OS - Restaurar memoria
"%SOFIA_NODE%" "%~dp0tools\restore-backup.cjs"
set "SOFIA_RESULT=%ERRORLEVEL%"
if "%SOFIA_RESULT%"=="-1073741510" set "SOFIA_RESULT=0"
if "%SOFIA_RESULT%"=="3221225786" set "SOFIA_RESULT=0"
echo.
echo A execucao terminou. Esta janela permanece aberta para conferir o resultado.
pause
exit /b %SOFIA_RESULT%
