$ErrorActionPreference = "Stop"

Write-Host "1. Creating Wallet for Player 456..."
$walletBody = @{
    playerId = "P-456"
    initialBalanceAmount = "100.00"
    currency = "BRL"
} | ConvertTo-Json

$wallet = Invoke-RestMethod -Uri "http://localhost:3000/wallets" -Method Post -Body $walletBody -ContentType "application/json"
Write-Host "Wallet created!"
$wallet | Format-List

$walletId = $wallet.walletId

Write-Host "2. Submitting Wager Transaction (BET) of 20.00 BRL..."
$tx1Body = @{
    providerId = "PROV-A"
    externalTransactionId = "EXT-003"
    playerId = "P-456"
    currency = "BRL"
    roundId = "R-1"
    gameId = "G-1"
    kind = "BET"
    moneyAmount = "20.00"
} | ConvertTo-Json

$tx1 = Invoke-RestMethod -Uri "http://localhost:3000/transactions" -Method Post -Body $tx1Body -ContentType "application/json" -Headers @{ "idempotency-key" = "PROV-A:EXT-003" }
Write-Host "Transaction 1 (BET) processed!"
$tx1 | Format-List

Write-Host "3. Submitting Wager Transaction (WIN) of 50.00 BRL (requires reference to EXT-003)..."
$tx2Body = @{
    providerId = "PROV-A"
    externalTransactionId = "EXT-004"
    playerId = "P-456"
    currency = "BRL"
    roundId = "R-1"
    gameId = "G-1"
    kind = "WIN"
    moneyAmount = "50.00"
    referenceExternalTransactionId = "EXT-003"
} | ConvertTo-Json

$tx2 = Invoke-RestMethod -Uri "http://localhost:3000/transactions" -Method Post -Body $tx2Body -ContentType "application/json" -Headers @{ "idempotency-key" = "PROV-A:EXT-004" }
Write-Host "Transaction 2 (WIN) processed!"
$tx2 | Format-List

Write-Host "Done!"
