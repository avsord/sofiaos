@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" (
    "C:\Program Files\nodejs\node.exe" "%~dp0tools\simplify-project.cjs"
  ) else (
    echo ERRO: Node.js nao encontrado.
    pause
    exit /b 1
  )
) else (
  node "%~dp0tools\simplify-project.cjs"
)
if errorlevel 1 pause
endlocal
