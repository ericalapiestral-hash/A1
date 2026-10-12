param(
    [string]$Port = '',
    [ValidateRange(5, 180)][int]$Seconds = 45,
    [ValidateRange(1200, 2000000)][int]$Baud = 115200
)

$ErrorActionPreference = 'Stop'
$serial = $null
$writer = $null
$characters = 0

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Host 'Available serial ports:'
    Get-CimInstance Win32_SerialPort |
        Sort-Object DeviceID |
        Select-Object DeviceID, Name |
        Format-Table -AutoSize | Out-Host

    if ([string]::IsNullOrWhiteSpace($Port)) {
        $Port = Read-Host 'Enter the B-board port (example: COM5)'
    }
    $Port = $Port.Trim().ToUpperInvariant()
    if ($Port -notmatch '^COM[0-9]+$') {
        throw 'Please enter a COM port such as COM5.'
    }

    $outputDirectory = Join-Path $PSScriptRoot 'diagnostics'
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss_fff'
    $outputPath = Join-Path $outputDirectory "B-board_${Port}_${stamp}.log"

    $serial = New-Object System.IO.Ports.SerialPort
    $serial.PortName = $Port
    $serial.BaudRate = $Baud
    $serial.DataBits = 8
    $serial.Parity = [System.IO.Ports.Parity]::None
    $serial.StopBits = [System.IO.Ports.StopBits]::One
    $serial.Handshake = [System.IO.Ports.Handshake]::None
    $serial.DtrEnable = $false
    $serial.RtsEnable = $false
    $serial.Encoding = [System.Text.Encoding]::UTF8
    $serial.ReadTimeout = 500
    $serial.Open()

    $encoding = [System.Text.UTF8Encoding]::new($true)
    $writer = [System.IO.StreamWriter]::new($outputPath, $false, $encoding)
    $writer.AutoFlush = $true
    $writer.WriteLine("# B-board serial capture: $Port, $Baud baud, $Seconds seconds")
    $writer.WriteLine('# This tool reads serial output only. It sends no commands and does not flash firmware.')
    Write-Host "Reading $Port at $Baud baud for $Seconds seconds..."
    Write-Host 'Close other serial monitors if the port is busy.'
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    while ($watch.Elapsed.TotalSeconds -lt $Seconds) {
        $chunk = $serial.ReadExisting()
        if ($chunk.Length -gt 0) {
            $characters += $chunk.Length
            $writer.Write($chunk)
            Write-Host -NoNewline $chunk
        }
        Start-Sleep -Milliseconds 100
    }
    $writer.WriteLine("`n# Capture complete: $characters characters received")
    Write-Host "`nSaved log: $outputPath"
    if ($characters -eq 0) {
        Write-Host 'No serial output was received. The firmware may not print logs, or the port/baud may differ.'
        Write-Host 'No output alone does not mean the board or sensors are broken.'
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    Write-Host 'Check the COM port and close Arduino Serial Monitor or any other program using it.'
    exit 1
} finally {
    if ($null -ne $writer) { $writer.Dispose() }
    if ($null -ne $serial) {
        if ($serial.IsOpen) { $serial.Close() }
        $serial.Dispose()
    }
}
