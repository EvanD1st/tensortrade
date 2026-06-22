# Exit immediately if a command fails
$ErrorActionPreference = "Stop"

Write-Host "🚀 Bootstrapping TensorTrade Architecture..." -ForegroundColor Cyan

# 1. Create Backend Structure
Write-Host "📂 Creating Backend directories..." -ForegroundColor Yellow
$backendDirs = @(
    "backend/app/api",
    "backend/app/websocket",
    "backend/app/services",
    "backend/app/ml/lstm",
    "backend/app/ml/arima",
    "backend/app/trading",
    "backend/app/database",
    "backend/app/schemas",
    "backend/app/core",
    "backend/models",
    "backend/tests"
)
foreach ($dir in $backendDirs) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

Write-Host "📄 Creating Backend initial files..." -ForegroundColor Yellow
New-Item -ItemType File -Force -Path "backend/main.py" | Out-Null
New-Item -ItemType File -Force -Path "backend/requirements.txt" | Out-Null
New-Item -ItemType File -Force -Path "backend/.env" | Out-Null

# Add __init__.py files to make them proper Python packages
Get-ChildItem -Path "backend/app" -Recurse -Directory | ForEach-Object {
    New-Item -ItemType File -Force -Path "$($_.FullName)\__init__.py" | Out-Null
}
New-Item -ItemType File -Force -Path "backend/app\__init__.py" | Out-Null

# 2. Create Frontend Structure
Write-Host "📂 Creating Frontend directories..." -ForegroundColor Yellow
$frontendDirs = @(
    "frontend/app",
    "frontend/components",
    "frontend/hooks",
    "frontend/lib",
    "frontend/services",
    "frontend/store"
)
foreach ($dir in $frontendDirs) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

Write-Host "📄 Creating Frontend initial files..." -ForegroundColor Yellow
New-Item -ItemType File -Force -Path "frontend/package.json" | Out-Null
New-Item -ItemType File -Force -Path "frontend/.env.local" | Out-Null

# 3. Create Supabase Structure
Write-Host "📂 Creating Supabase directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "supabase/migrations" | Out-Null
New-Item -ItemType Directory -Force -Path "supabase/policies" | Out-Null

Write-Host "✅ TensorTrade architecture setup complete!" -ForegroundColor Green