# ==================================================================
#  FundingPips на MT5-воркері (Windows-VPS).
#
#  Власної збірки терміналу у FundingPips немає — їхні сервери бачить
#  звичайний MetaTrader 5. Тому ставимо окрему portable-копію
#  звичайного MT5 і даємо воркеру шлях до неї через MT5_PATH_FUNDINGPIPS.
#  Код воркера не міняється: він і так бере MT5_PATH_<BROKER> за
#  значенням mt5_accounts.broker, а фронт пише туди 'fundingpips'.
#
#  Окрема копія, а не спільна з іншими фірмами: у кожної свій
#  servers.dat, і термінал, який знає сервери двох фірм, одного дня
#  залогінить рахунок не туди.
#
#  Запуск (PowerShell від адміністратора):
#    powershell -ExecutionPolicy Bypass -File .\setup-fundingpips.ps1
# ==================================================================

param(
  [string]$Root = "C:\mt",
  [string]$Name = "fundingpips"
)

$ErrorActionPreference = "Stop"

$dir     = Join-Path $Root "terminals\$Name"
$exe     = Join-Path $dir "terminal64.exe"
$envFile = Join-Path $Root ".env"
$key     = "MT5_PATH_" + $Name.ToUpper()

# ---------- 1. Термінал ----------
if (-not (Test-Path $exe)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null

  $setup = Join-Path $env:TEMP "mt5setup.exe"
  Write-Host "Завантажую офіційний інсталятор MetaQuotes..."
  Invoke-WebRequest "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe" -OutFile $setup

  # Тихої установки в довільну теку інсталятор не обіцяє, тому тека
  # вибирається руками — один раз.
  Write-Host ""
  Write-Host "У вікні інсталятора натисни 'Settings' і постав теку:" -ForegroundColor Yellow
  Write-Host "   $dir" -ForegroundColor Yellow
  Write-Host "Після установки термінал сам відкриється — закрий його."
  Start-Process $setup -Wait

  if (-not (Test-Path $exe)) {
    throw "terminal64.exe не зʼявився в $dir. Схоже, інсталятор поставив у Program Files — запусти скрипт ще раз і вибери теку в Settings."
  }
}
Write-Host "Термінал: $exe" -ForegroundColor Green

# ---------- 2. Разовий вхід руками ----------
# Звичайний термінал знає лише сервери, які вже бачив. Один ручний вхід
# записує сервери FundingPips у servers.dat цієї копії — після цього
# воркер логіниться сам.
Write-Host ""
Write-Host "Зараз відкриється термінал у portable-режимі:" -ForegroundColor Yellow
Write-Host "  File -> Open an Account -> у пошуку 'FundingPips' -> вибери сервер"
Write-Host "  -> 'Connect with an existing trade account' -> логін + ІНВЕСТОРСЬКИЙ пароль."
Write-Host "  Коли внизу зʼявиться баланс — закрий термінал."
Start-Process $exe -ArgumentList "/portable" -Wait

if (-not (Test-Path (Join-Path $dir "config\servers.dat"))) {
  Write-Warning "config\servers.dat не знайдено — схоже, термінал не запускався в portable-режимі. Повтори крок 2."
}

# ---------- 3. Шлях у .env воркера ----------
# Пишемо без BOM: Set-Content -Encoding UTF8 у Windows PowerShell додає
# BOM, і перший ключ .env перетворюється на "\ufeffSUPABASE_URL" —
# воркер падає з «немає SUPABASE_URL» при цілком правильному файлі.
$lines = @()
if (Test-Path $envFile) {
  $lines = @(Get-Content $envFile | Where-Object { $_ -notmatch "^\s*$key\s*=" })
}
$lines += "$key=$exe"
[System.IO.File]::WriteAllLines($envFile, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "Додано в $envFile :" -ForegroundColor Green
Write-Host "   $key=$exe"
Write-Host ""
Write-Host "Далі: перевір вхід (python check_fundingpips.py), потім перезапусти воркер." -ForegroundColor Cyan
