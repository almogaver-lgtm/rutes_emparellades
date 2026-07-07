param(
  [int]$Port = 8443
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$devCertDir = Join-Path $projectRoot '.devcert'
$serverPath = Join-Path $devCertDir 'https-server.mjs'
$pfxPath = Join-Path $devCertDir 'rutes-emparellades-dev.pfx'
$passphrase = 'rutes-emparellades-dev'

if (-not (Test-Path $devCertDir)) {
  New-Item -ItemType Directory -Path $devCertDir | Out-Null
}

function Get-PrimaryIPv4 {
  $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.PrefixOrigin -ne 'WellKnown'
    } |
    Select-Object -ExpandProperty IPAddress

  foreach ($ip in $candidates) {
    if ($ip -like '192.168.*' -or $ip -like '10.*' -or $ip -like '172.1[6-9].*' -or $ip -like '172.2[0-9].*' -or $ip -like '172.3[0-1].*') {
      return $ip
    }
  }

  return ($candidates | Select-Object -First 1)
}

$localIp = Get-PrimaryIPv4

if (-not (Test-Path $pfxPath)) {
  Write-Host 'Generating local HTTPS certificate...'

  $dnsNames = @('localhost')
  if ($localIp) {
    $dnsNames += $localIp
  }

  $cert = New-SelfSignedCertificate `
    -DnsName $dnsNames `
    -CertStoreLocation 'cert:\CurrentUser\My' `
    -FriendlyName 'Rutes Emparellades Local Dev'

  $securePassword = ConvertTo-SecureString -String $passphrase -Force -AsPlainText
  Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword | Out-Null
}

Write-Host ''
Write-Host "Project root: $projectRoot"
Write-Host "Local URL: https://localhost:$Port"
if ($localIp) {
  Write-Host "Mobile URL: https://$localIp`:$Port"
}
Write-Host ''
Write-Host 'If the phone warns about the certificate, accept the advanced/proceed option once.'
Write-Host 'Press Ctrl+C to stop the server.'
Write-Host ''

node $serverPath $projectRoot $pfxPath $passphrase $Port
