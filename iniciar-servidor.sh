#!/bin/sh
# Inicia el servidor de Turnos y Presencialidad (Linux / macOS).
cd "$(dirname "$0")"
exec python3 servidor/servidor.py "$@"
