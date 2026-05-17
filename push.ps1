# UTF-8 Encoding
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "🚀 Git 一鍵快速 Push 工具" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 檢查 Git 狀態
Write-Host "🔍 正在檢查檔案變更狀態..." -ForegroundColor Yellow

$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "✨ 沒有檢測到任何需要上傳的變更！" -ForegroundColor Green
    Write-Host ""
    Read-Host "請按 Enter 鍵結束..."
    exit
}

Write-Host ""
Write-Host "📂 檢測到以下變更檔案：" -ForegroundColor Cyan
$status -split "`r?`n" | ForEach-Object {
    if ($_.Length -gt 3) {
        $code = $_.Substring(0, 2).Trim()
        $file = $_.Substring(3)
        switch ($code) {
            "M" { Write-Host "   [修改] $file" -ForegroundColor Yellow }
            "A" { Write-Host "   [新增] $file" -ForegroundColor Green }
            "D" { Write-Host "   [刪除] $file" -ForegroundColor Red }
            "??" { Write-Host "   [新建] $file" -ForegroundColor Cyan }
            "R" { Write-Host "   [更名] $file" -ForegroundColor Magenta }
            "UU" { Write-Host "   [衝突] $file" -ForegroundColor DarkRed }
            default { Write-Host "   [變更] $file" -ForegroundColor Gray }
        }
    }
}
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
$commitResult = git commit -m $commit_msg 2>&1 | ForEach-Object { $_.ToString() }
$commitResult | ForEach-Object {
    if (![string]::IsNullOrWhiteSpace($_)) {
        Write-Host "   $_" -ForegroundColor Gray
    }
}

Write-Host ""

# 3. 使用背景工作執行 git push，並顯示動畫 spinner
$pwdPath = $PWD.Path
$pushJob = Start-Job -ScriptBlock {
    param($pwd)
    Set-Location -Path $pwd
    # 使用 cmd /c 執行以避免 PowerShell 將 stderr 的進度訊息轉換成 ErrorRecord 紅字
    $output = cmd /c "git push 2>&1" | Out-String
    return [PSCustomObject]@{
        Output = $output
        ExitCode = $LASTEXITCODE
    }
} -ArgumentList $pwdPath

$spinner = @('⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏')
$index = 0

while ($pushJob.State -eq "Running") {
    $char = $spinner[$index]
    Write-Host "`r$char 正在上傳至 GitHub (git push)..." -NoNewline -ForegroundColor Cyan
    Start-Sleep -Milliseconds 100
    $index = ($index + 1) % $spinner.Length
}

# 清除 Spinner 這一行
Write-Host "`r                                                                `r" -NoNewline

# 接收結果並判斷是否成功
$result = Receive-Job -Job $pushJob
Remove-Job -Job $pushJob

$pushOutput = $result.Output
$exitCode = $result.ExitCode

# 列印 Git Push 的輸出
if (![string]::IsNullOrWhiteSpace($pushOutput)) {
    $pushOutput -split "`r?`n" | ForEach-Object {
        if (![string]::IsNullOrWhiteSpace($_)) {
            Write-Host "   $_" -ForegroundColor Gray
        }
    }
}

Write-Host ""
if ($exitCode -eq 0) {
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
