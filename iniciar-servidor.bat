@echo off
REM Inicia el servidor de Turnos y Presencialidad (Windows).
REM Requiere Python 3.9 o superior: https://www.python.org/downloads/
cd /d "%~dp0"
python servidor\servidor.py %*
pause
