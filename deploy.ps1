# SentinaAI, GCP Cloud Run Deployment Script
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File .\deploy.ps1

$ErrorActionPreference = "Stop"

# =========================
# CONFIG
# =========================
$PROJECT   = "sentina-ai-486321"
$REGION    = "me-central1"
$REPO_NAME = "sentina-ai"
$REPO      = "me-central1-docker.pkg.dev/$PROJECT/$REPO_NAME"

# Exact source folders
$NAV_PATH       = "apps/navigation_web"
$AI_PATH        = "services/ai-detection"
$EXHIBITOR_PATH = "services/exhibitor-ai-pipeline"
$REPORT_PATH    = "services/Report_export"
$BACKEND_PATH   = "apps/main dashboard/backend"
$FRONTEND_PATH  = "apps/main dashboard/frontend"
$TWIN_PATH      = "apps/digital_twin_web"

# =========================
# HELPERS
# =========================
function Write-Section($text) {
    Write-Host ""
    Write-Host $text -ForegroundColor Cyan
}

function Write-Step($text) {
    Write-Host $text -ForegroundColor Yellow
}

function Ensure-Gcloud {
    Write-Step "--- [Check] Verifying gcloud CLI..."
    $null = Get-Command gcloud -ErrorAction Stop
    gcloud --version | Out-Null
}

function Ensure-PathExists($path) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required path not found: $path"
    }
}

function Enable-Api($apiName) {
    Write-Step "--- [Setup] Enabling API: $apiName"
    gcloud services enable $apiName --project $PROJECT --quiet | Out-Null
}

function Ensure-ArtifactRepo {
    Write-Step "--- [Setup] Ensuring Artifact Registry repo exists: $REPO_NAME"
    $exists = $false
    try {
        gcloud artifacts repositories describe $REPO_NAME `
            --location $REGION `
            --project $PROJECT `
            --format="value(name)" `
            --quiet | Out-Null
        $exists = $true
    }
    catch {
        $exists = $false
    }

    if (-not $exists) {
        gcloud artifacts repositories create $REPO_NAME `
            --repository-format=docker `
            --location=$REGION `
            --description="SentinaAI Docker images" `
            --project $PROJECT `
            --quiet | Out-Null
        Write-Host "    Created Artifact Registry repo: $REPO_NAME" -ForegroundColor Green
    }
    else {
        Write-Host "    Artifact Registry repo already exists: $REPO_NAME" -ForegroundColor Green
    }
}

function Build-Image($serviceName, $sourcePath, $imageTag) {
    Write-Step "--- [Build] $serviceName"
    Ensure-PathExists $sourcePath
    gcloud builds submit $sourcePath --tag $imageTag --project $PROJECT
}

function Deploy-Service {
    param(
        [Parameter(Mandatory = $true)][string]$ServiceName,
        [Parameter(Mandatory = $true)][string]$ImageTag,
        [string[]]$ExtraArgs = @()
    )

    Write-Step "--- [Deploy] $ServiceName"

    $args = @(
        "run", "deploy", $ServiceName,
        "--image", $ImageTag,
        "--region", $REGION,
        "--allow-unauthenticated",
        "--port", "8080",
        "--project", $PROJECT,
        "--format=value(status.url)",
        "--quiet"
    ) + $ExtraArgs

    $url = (& gcloud @args).Trim()

    if (-not $url) {
        throw "Deploy succeeded or partially succeeded, but no URL was returned for service: $ServiceName"
    }

    Write-Host "    $ServiceName URL: $url" -ForegroundColor Green
    return $url
}

# =========================
# START
# =========================
Write-Host ""
Write-Host "=== SentinaAI GCP Deployment ===" -ForegroundColor Cyan
Write-Host "Project : $PROJECT"
Write-Host "Region  : $REGION"
Write-Host "Repo    : $REPO"
Write-Host ""

Ensure-Gcloud

Write-Step "--- [Setup] Configuring project..."
gcloud config set project $PROJECT | Out-Null

# Enable required APIs up front so Google stops interrupting your life one API at a time
Enable-Api "artifactregistry.googleapis.com"
Enable-Api "cloudbuild.googleapis.com"
Enable-Api "run.googleapis.com"

Ensure-ArtifactRepo

# Validate required source folders before doing anything expensive
Write-Step "--- [Check] Validating source paths..."
$requiredPaths = @(
    $NAV_PATH,
    $AI_PATH,
    $EXHIBITOR_PATH,
    $REPORT_PATH,
    $BACKEND_PATH,
    $FRONTEND_PATH,
    $TWIN_PATH
)
foreach ($p in $requiredPaths) {
    Ensure-PathExists $p
}
Write-Host "    All required paths found." -ForegroundColor Green

# =========================
# WAVE 1
# =========================
Write-Section "=== Wave 1: Independent Services ==="

$navImage = "$REPO/navigation-web"
Build-Image "navigation-web" $NAV_PATH $navImage
$navUrl = Deploy-Service "navigation-web" $navImage

$aiImage = "$REPO/ai-detection"
Build-Image "ai-detection" $AI_PATH $aiImage
$aiUrl = Deploy-Service "ai-detection" $aiImage

$exhibitorImage = "$REPO/exhibitor-ai"
Build-Image "exhibitor-ai" $EXHIBITOR_PATH $exhibitorImage
$exhibitorUrl = Deploy-Service "exhibitor-ai" $exhibitorImage

$reportImage = "$REPO/report-export"
Build-Image "report-export" $REPORT_PATH $reportImage
$reportUrl = Deploy-Service "report-export" $reportImage

$twinImage = "$REPO/digital-twin"
Build-Image "digital-twin" $TWIN_PATH $twinImage
$twinUrl = Deploy-Service "digital-twin" $twinImage

# =========================
# WAVE 2
# =========================
Write-Section "=== Wave 2: Dashboard Backend ==="

$jwtSecret = $env:JWT_SECRET
if (-not $jwtSecret) {
    $jwtSecret = Read-Host "Enter JWT_SECRET value"
}
if (-not $jwtSecret) {
    throw "JWT_SECRET cannot be empty."
}

$backendImage = "$REPO/dashboard-backend"
Build-Image "dashboard-backend" $BACKEND_PATH $backendImage

$backendEnv = @(
    "--set-env-vars",
    "NAVMESH_BASE_URL=$navUrl,AI_SERVICE_URL=$aiUrl,EXHIBITOR_AI_SERVICE_URL=$exhibitorUrl,REPORT_EXPORT_SERVICE_URL=$reportUrl,ASSISTANT_SERVICE_URL=https://assistant-service-larswr6g3q-ww.a.run.app,JWT_SECRET=$jwtSecret"
)

$backendUrl = Deploy-Service "dashboard-backend" $backendImage $backendEnv

# =========================
# WAVE 3
# =========================
Write-Section "=== Wave 3: Frontends ==="

$frontendImage = "$REPO/dashboard-frontend"
# Write VITE env vars so they are baked into the production build
@(
    "VITE_API_BASE_URL=$backendUrl",
    "VITE_DIGITAL_TWIN_URL=$twinUrl",
    "VITE_ASSISTANT_BASE_URL=https://assistant-service-larswr6g3q-ww.a.run.app"
) | Set-Content -Path "$FRONTEND_PATH/.env.production"
Build-Image "dashboard-frontend" $FRONTEND_PATH $frontendImage
$frontendUrl = Deploy-Service "dashboard-frontend" $frontendImage

# =========================
# SUMMARY
# =========================
Write-Section "=== Deployment Complete ==="
Write-Host "navigation-web    : $navUrl"
Write-Host "ai-detection      : $aiUrl"
Write-Host "exhibitor-ai      : $exhibitorUrl"
Write-Host "report-export     : $reportUrl"
Write-Host "dashboard-backend : $backendUrl"
Write-Host "dashboard-frontend: $frontendUrl"
Write-Host "digital-twin      : $twinUrl"
Write-Host ""
Write-Host "HTTPS deployment complete." -ForegroundColor Green