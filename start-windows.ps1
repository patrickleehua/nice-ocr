param(
  [switch]$SkipInstall,
  [switch]$SkipOcr,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info {
  param([string]$Message)
  Write-Host "    $Message" -ForegroundColor DarkGray
}

function Assert-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing dependency: $Name. $InstallHint"
  }
}

function Get-NodeMajor {
  $version = (& node --version).Trim().TrimStart("v")
  return [int]($version.Split(".")[0])
}

function Find-Python {
  $candidates = @(
    @{ Command = "py"; Args = @("-3") },
    @{ Command = "python"; Args = @() },
    @{ Command = "python3"; Args = @() }
  )

  foreach ($candidate in $candidates) {
    if (-not (Get-Command $candidate.Command -ErrorAction SilentlyContinue)) {
      continue
    }
    try {
      $versionText = & $candidate.Command @($candidate.Args + @("-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"))
      $parts = $versionText.Trim().Split(".")
      $major = [int]$parts[0]
      $minor = [int]$parts[1]
      if ($major -eq 3 -and $minor -ge 10 -and $minor -le 12) {
        return $candidate
      }
    } catch {
      continue
    }
  }

  return $null
}

function Start-Terminal {
  param(
    [string]$Title,
    [string]$Command
  )
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "`$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
  ) | Out-Null
}

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $RootDir "nice-ocr"
$OcrDir = Join-Path $AppDir "tools\ocr-layout"

if (-not (Test-Path (Join-Path $AppDir "package.json"))) {
  throw "Cannot find nice-ocr/package.json. Please run this script from the repository root."
}

Set-Location $AppDir

Write-Step "Checking required dependencies"
Assert-Command "node" "Install Node.js 22 or newer from https://nodejs.org/."
$nodeMajor = Get-NodeMajor
if ($nodeMajor -lt 22) {
  throw "Node.js >= 22 is required. Current version: $(& node --version)"
}
Write-Info "Node $(& node --version)"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  if (Get-Command corepack -ErrorAction SilentlyContinue) {
    Write-Info "pnpm not found; enabling Corepack."
    corepack enable
    corepack prepare pnpm@latest --activate
  } else {
    throw "Missing dependency: pnpm. Install it with: npm install -g pnpm"
  }
}
Write-Info "pnpm $(& pnpm --version)"

if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Info "Created nice-ocr/.env from .env.example."
  } else {
    Write-Info "No .env.example found; using built-in defaults."
  }
}

Write-Step "Preparing Node dependencies and database client"
if (-not $SkipInstall) {
  pnpm install
} else {
  Write-Info "Skipped pnpm install."
}
pnpm db:generate
pnpm db:push

$ocrEnabled = $false
if (-not $SkipOcr -and (Test-Path (Join-Path $OcrDir "server.py"))) {
  Write-Step "Checking optional OCR layout service"
  $python = Find-Python
  if ($null -eq $python) {
    Write-Host "    Python 3.10-3.12 was not found. OCR layout service will be skipped." -ForegroundColor Yellow
    Write-Host "    Install Python 3.10-3.12 if you want precise row positioning." -ForegroundColor Yellow
  } else {
    $pythonCmd = $python["Command"]
    $pythonArgs = $python["Args"]
    $venvDir = Join-Path $OcrDir ".venv"
    if (-not (Test-Path $venvDir)) {
      Write-Info "Creating OCR Python virtual environment."
      & $pythonCmd @($pythonArgs + @("-m", "venv", $venvDir))
    }

    $venvPython = Join-Path $venvDir "Scripts\python.exe"
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r (Join-Path $OcrDir "requirements.txt")
    $ocrEnabled = $true
  }
}

Write-Step "Starting services"
if ($ocrEnabled) {
  Start-Terminal "nice-ocr layout service" "cd '$OcrDir'; `$env:OCR_LAYOUT_URL='http://127.0.0.1:8077'; .\.venv\Scripts\python.exe server.py"
  $env:OCR_LAYOUT_URL = "http://127.0.0.1:8077"
  Write-Info "OCR layout service: http://127.0.0.1:8077"
}

Start-Terminal "nice-ocr worker" "cd '$AppDir'; `$env:OCR_LAYOUT_URL='$env:OCR_LAYOUT_URL'; pnpm worker"
Start-Terminal "nice-ocr web" "cd '$AppDir'; pnpm dev"

Write-Host ""
Write-Host "nice-ocr is starting. Open http://localhost:3000" -ForegroundColor Green
$startedServices = "web, worker"
if ($ocrEnabled) {
  $startedServices = "$startedServices, OCR layout service"
}
Write-Host "Started windows: $startedServices"
Write-Host ""
Write-Host "Useful switches:"
Write-Host "  .\start-windows.ps1 -SkipInstall    Skip pnpm install"
Write-Host "  .\start-windows.ps1 -SkipOcr        Do not prepare/start PaddleOCR layout service"

if (-not $NoPause) {
  Write-Host ""
  Read-Host "Press Enter to close this launcher window"
}
