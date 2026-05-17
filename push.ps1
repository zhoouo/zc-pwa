# UTF-8 Encoding
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "🚀 Git 一鍵快速 Push 工具" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 檢查 Git 狀態
Write-Host "🔍 正在檢查檔案變更狀態..." -ForegroundColor Yellow
git status -s
Write-Host ""

# 2. 輸入提交訊息
$commit_msg = Read-Host "💬 請輸入本次更新說明 (按 Enter 預設為 'update: 快速更新')"
if ([string]::IsNullOrWhiteSpace($commit_msg)) {
    $commit_msg = "update: 快速更新"
}

Write-Host ""
Write-Host "📦 正在加入檔案暫存區 (git add .)..." -ForegroundColor Yellow
git add .

Write-Host "✍️ 正在提交變更 (git commit)..." -ForegroundColor Yellow
git commit -m $commit_msg

Write-Host ""
Write-Host "📤 正在上傳至 GitHub (git push)..." -ForegroundColor Yellow
git push

Write-Host ""
if ($LASTEXITCODE -eq 0) {
    Write-Host "====================================================" -ForegroundColor Green
    Write-Host "🎉 上傳成功！您的變更已同步到 GitHub！" -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Green
} else {
    Write-Host "====================================================" -ForegroundColor Red
    Write-Host "❌ 上傳失敗，請檢查網路連線或 Token 設定。" -ForegroundColor Red
    Write-Host "====================================================" -ForegroundColor Red
}
Write-Host ""
Read-Host "請按 Enter 鍵結束..."
