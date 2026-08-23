@echo off
title Orbia - Atualizar e Sincronizar
cd /d "%~dp0"
echo ==============================================
echo  Orbia - Atualizando atalho e versao instalada
echo ==============================================
npm run sync
pause
