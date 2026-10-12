# EDGE candles on VPS: every day at 00:05 yesterday's FTMO M1 candles -> R2.
# ASCII only on purpose: RDP copy drops the UTF-8 BOM and PowerShell 5
# then garbles non-latin text.
#
#   cd C:\mt\candles
#   powershell -ExecutionPolicy Bypass -File .\setup-candles.ps1
#
# Auto-import and bot are not touched.
# Uses the FTMO terminal already logged in for auto-import (MT5_PATH_FTMO).

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = "C:\mt\.env"
$mt5Dir = Join-Path $here "mt5"
$terminal = Join-Path $mt5Dir "terminal64.exe"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Step($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }
function EnvText { if (Test-Path $envFile) { [IO.File]::ReadAllText($envFile, $utf8) } else { "" } }
function EnvGet($k) { $m = [regex]::Match((EnvText), "(?m)^\s*$k\s*=\s*(.*?)\s*$"); if ($m.Success) { $m.Groups[1].Value.Trim('"', "'") } else { $null } }
function EnvAdd($k, $v) {
  if ($null -ne (EnvGet $k)) { return }
  $t = EnvText
  $pre = if ($t -and -not $t.EndsWith("`n")) { "`r`n" } else { "" }
  [IO.File]::AppendAllText($envFile, "$pre$k=$v`r`n", $utf8)
  Write-Host "  added $k"
}

# ---------- 1. Python
Step "1/6 Python"
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { Write-Host "python not found in PATH - send this screen to Claude." -ForegroundColor Red; exit 1 }
& $py --version
& $py -m pip install --quiet --upgrade MetaTrader5 boto3 numpy
Write-Host "packages OK"

# ---------- 2. FTMO terminal: the SAME one as auto-import (MT5_PATH_FTMO),
# already logged in. If an old MT5_PATH_CANDLES line points to a copy, drop it.
Step "2/6 FTMO terminal (same as auto-import)"
$t = EnvText
if ($t -match "(?m)^\s*MT5_PATH_CANDLES\s*=") {
  $t = [regex]::Replace($t, "(?m)^\s*MT5_PATH_CANDLES\s*=.*\r?\n?", "")
  [IO.File]::WriteAllText($envFile, $t, $utf8)
  Write-Host "  removed old MT5_PATH_CANDLES"
}
Write-Host "terminal: $(EnvGet 'MT5_PATH_FTMO')"

# ---------- 3. .env
Step "3/6 C:\mt\.env (only adding lines)"
foreach ($k in "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY") {
  if ($null -eq (EnvGet $k)) { $v = Read-Host "Paste $k (Cloudflare R2)"; EnvAdd $k $v.Trim() }
}
EnvAdd "R2_BUCKET" "edge-candles"

# ---------- 4. Check
Step "4/6 Check: terminal, R2, symbols"
& $py -X utf8 -u "$here\edge_candles.py" check
if ($LASTEXITCODE -ne 0) { Write-Host "Check failed - send this screen to Claude." -ForegroundColor Red; exit 1 }

# ---------- 5. Test run
Step "5/6 Test run (a few minutes)"
& $py -X utf8 -u "$here\edge_candles.py" daily

# ---------- 6. Schedule
Step "6/6 Daily task at 00:05"
$log = Join-Path $here "daily.log"
$arg = "/c `"`"$py`" -X utf8 -u `"$here\edge_candles.py`" daily >> `"$log`" 2>&1`""
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $arg -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -Daily -At "00:05"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName "EDGE candles daily" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "`nDONE. Every day at 00:05 yesterday's FTMO candles go to the server. Log: $log" -ForegroundColor Green
