@echo off
echo Starting NutriLife Local Server...
python -m http.server 8080 --bind 0.0.0.0
pause
