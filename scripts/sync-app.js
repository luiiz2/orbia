const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

console.log('==================================================')
console.log('🚀 Orbia — Sincronizando e Atualizando Aplicativo')
console.log('==================================================')

// 1. Fechar instâncias ativas do Orbia
try {
  console.log('1. Encerrando processos do Orbia em execução...')
  execSync('taskkill /f /im orbia.exe', { stdio: 'ignore' })
  console.log('   ✓ Processos encerrados.')
} catch (e) {
  console.log('   ✓ Nenhum processo ativo encontrado.')
}

// 2. Build do Electron-Vite
console.log('2. Compilando bundles de produção (electron-vite build)...')
execSync('npm run build', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') })

// 3. Empacotamento Unpacked
console.log('3. Gerando executável e pacotes (electron-builder --dir)...')
execSync('npx electron-builder --dir', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') })

// 4. Copiar para o diretório instalado do usuário
const targetDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'orbia')
const sourceDir = path.resolve(__dirname, '..', 'dist', 'win-unpacked')

if (fs.existsSync(sourceDir)) {
  console.log(`4. Sincronizando arquivos para: ${targetDir}`)
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  // Copia recursiva
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true })
  console.log('   ✓ Arquivos sincronizados com sucesso.')

  // Copia do ícone
  const srcIcon = path.resolve(__dirname, '..', 'build', 'icon.ico')
  const destIcon = path.join(targetDir, 'app_icon.ico')
  if (fs.existsSync(srcIcon)) {
    fs.copyFileSync(srcIcon, destIcon)
    console.log('   ✓ Ícone atualizado.')
  }
} else {
  console.error(`❌ Diretório de origem não encontrado: ${sourceDir}`)
}

// 5. Atualizar atalhos do Windows
try {
  console.log('5. Atualizando atalhos do Desktop e Menu Iniciar...')
  const psScript = path.resolve(__dirname, 'fix-all-shortcuts.ps1')
  if (fs.existsSync(psScript)) {
    execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}"`, { stdio: 'inherit' })
  }
} catch (err) {
  console.warn('   Aviso ao atualizar atalhos:', err.message)
}

const pkg = require('../package.json')
console.log('==================================================')
console.log(`✨ Orbia atualizado com sucesso para a versão v${pkg.version}!`)
console.log('==================================================')
