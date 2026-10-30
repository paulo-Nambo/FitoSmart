$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent $PSScriptRoot
$destino = Join-Path $raiz 'client\public\referencias'
New-Item -ItemType Directory -Force -Path $destino | Out-Null
$headers = @{ 'User-Agent' = 'FitoSmart/1.0 (UEM fitossanidade; educational)' }

$entradas = @(
  @{ id='milho-lagarta-cartucho'; cultura='Milho'; rotulo='Lagarta-do-cartucho'; cientifico='Spodoptera frugiperda'; commons=@('Spodoptera frugiperda.jpg','Spodoptera frugiperda caterpillar01.jpg','Spodoptera frugiperda in stalk of Zea mays.jpg'); inat='Spodoptera frugiperda' },
  @{ id='milho-ferrugem'; cultura='Milho'; rotulo='Ferrugem do milho'; cientifico='Puccinia sorghi'; commons=@('Puccinia sorghi (15).jpg','Puccinia sorghi (01).jpg','Puccinia sorghi (07).jpg'); inat='Puccinia sorghi' },
  @{ id='milho-queima-foliar'; cultura='Milho'; rotulo='Queima foliar do milho'; cientifico='Exserohilum turcicum'; commons=@('Northern corn leaf blight.JPG'); inat='Setosphaeria turcica' },
  @{ id='milho-riscado'; cultura='Milho'; rotulo='Virus do riscado do milho'; cientifico='Maize streak virus'; commons=@('Good msv 3.jpg'); inat='Maize streak virus' },
  @{ id='mandioca-mosaico'; cultura='Mandioca'; rotulo='Mosaico da mandioca'; cientifico='Cassava mosaic virus'; commons=@(); inat='African cassava mosaic virus' },
  @{ id='mandioca-estria'; cultura='Mandioca'; rotulo='Estria castanha da mandioca'; cientifico='Cassava brown streak virus'; commons=@('Distribution of cassava brown streak disease (CBSD) symptoms on cassava.JPG'); inat='Cassava brown streak virus' },
  @{ id='feijao-ferrugem'; cultura='Feijao'; rotulo='Ferrugem do feijao'; cientifico='Uromyces appendiculatus'; commons=@('Roest op stoksperzieboon (Uromyces appendiculatus var. appendiculatus).jpg','Uromyces appendiculatus, telia, 5363950.jpg'); inat='Uromyces appendiculatus' },
  @{ id='feijao-mancha-angular'; cultura='Feijao'; rotulo='Mancha angular do feijao'; cientifico='Pseudocercospora griseola'; commons=@(); inat='Pseudocercospora griseola' },
  @{ id='feijao-antracnose'; cultura='Feijao'; rotulo='Antracnose do feijao'; cientifico='Colletotrichum lindemuthianum'; commons=@('Colletotrichum lindemuthianum.jpg','Bean anthracnose - Colletotrichum lindemuthianum (Sacc. & Magnus) Lams.-Scrib. - 5358881.png'); inat='Colletotrichum lindemuthianum' },
  @{ id='tomate-tuta'; cultura='Tomate'; rotulo='Traca-do-tomateiro'; cientifico='Tuta absoluta'; commons=@('Tuta absoluta 5432149.jpg','Tuta absoluta (52465714396).jpg'); inat='Tuta absoluta' },
  @{ id='tomate-alternaria'; cultura='Tomate'; rotulo='Alternaria / pinta-preta'; cientifico='Alternaria solani'; commons=@('Alternaria solani - leaf lesions.jpg','Alternaria solani IMG 1661.jpg'); inat='Alternaria solani' },
  @{ id='tomate-mildio'; cultura='Tomate'; rotulo='Mildio do tomateiro'; cientifico='Phytophthora infestans'; commons=@('Phytophthora infestans on potato leaf.jpg','Phytophthora infestans on potato leaf 2.jpg'); inat='Phytophthora infestans' },
  @{ id='tomate-acaro'; cultura='Tomate'; rotulo='Acaro-rajado'; cientifico='Tetranychus urticae'; commons=@(); inat='Tetranychus urticae' },
  @{ id='tomate-enrolamento'; cultura='Tomate'; rotulo='Virus do enrolamento amarelo'; cientifico='Tomato yellow leaf curl virus'; commons=@(); inat='Tomato yellow leaf curl virus' }
)

$mapaCultura = @{ Feijao = 'Feijão' }
$mapaRotulo = @{
  'Virus do riscado do milho' = 'Vírus do riscado do milho'
  'Estria castanha da mandioca' = 'Estría castanha da mandioca'
  'Ferrugem do feijao' = 'Ferrugem do feijão'
  'Mancha angular do feijao' = 'Mancha angular do feijão'
  'Antracnose do feijao' = 'Antracnose do feijão'
  'Traca-do-tomateiro' = 'Traça-do-tomateiro'
  'Alternaria / pinta-preta' = 'Alternária / pinta-preta'
  'Mildio do tomateiro' = 'Míldio do tomateiro'
  'Acaro-rajado' = 'Ácaro-rajado'
  'Virus do enrolamento amarelo' = 'Vírus do enrolamento amarelo'
}

function Get-CommonsUrl([string]$nome) {
  $titulo = "File:$nome"
  $u = "https://commons.wikimedia.org/w/api.php?action=query&titles=$([uri]::EscapeDataString($titulo))&prop=imageinfo&iiprop=url|mime&iiurlwidth=720&format=json"
  $json = Invoke-RestMethod -Uri $u -TimeoutSec 40 -Headers $headers
  $page = $json.query.pages.PSObject.Properties.Value | Select-Object -First 1
  if ($null -ne $page.missing) { return $null }
  $info = $page.imageinfo | Select-Object -First 1
  if (-not $info) { return $null }
  if ($info.mime -and ($info.mime -notlike 'image/*')) { return $null }
  if ($info.thumburl) { return @{ url = $info.thumburl; fonte = $titulo } }
  return @{ url = $info.url; fonte = $titulo }
}

function Get-InatUrls([string]$taxon, [int]$limite = 3) {
  $out = @()
  $u = "https://api.inaturalist.org/v1/observations?taxon_name=$([uri]::EscapeDataString($taxon))&photos=true&quality_grade=research&per_page=12&order_by=votes"
  try {
    $json = Invoke-RestMethod -Uri $u -TimeoutSec 40 -Headers $headers
  } catch {
    return @()
  }
  foreach ($obs in $json.results) {
    foreach ($foto in $obs.photos) {
      if ($out.Count -ge $limite) { break }
      $url = $foto.url -replace '/square\.', '/medium.' -replace '/square$', '/medium'
      if ($url) { $out += @{ url = $url; fonte = "iNaturalist:$($obs.id)" } }
    }
    if ($out.Count -ge $limite) { break }
  }
  if ($out.Count -eq 0) {
    try {
      $taxa = Invoke-RestMethod -Uri "https://api.inaturalist.org/v1/taxa?q=$([uri]::EscapeDataString($taxon))&per_page=3" -TimeoutSec 40 -Headers $headers
      foreach ($t in $taxa.results) {
        if ($t.default_photo.medium_url) {
          $out += @{ url = $t.default_photo.medium_url; fonte = "iNaturalist-taxon:$($t.id)" }
        }
      }
    } catch {}
  }
  return $out
}

function Save-Image([string]$url, [string]$ficheiro) {
  if ((Test-Path $ficheiro) -and ((Get-Item $ficheiro).Length -gt 1500)) { return $true }
  try {
    Invoke-WebRequest -Uri $url -OutFile $ficheiro -TimeoutSec 90 -Headers $headers
    return ((Test-Path $ficheiro) -and ((Get-Item $ficheiro).Length -gt 1500))
  } catch {
    return $false
  }
}

$catalogo = @()

foreach ($entrada in $entradas) {
  Start-Sleep -Milliseconds 800
  $pasta = Join-Path $destino $entrada.id
  New-Item -ItemType Directory -Force -Path $pasta | Out-Null
  $fontesUrls = @()

  foreach ($nome in $entrada.commons) {
    if ($fontesUrls.Count -ge 3) { break }
    try {
      $info = Get-CommonsUrl $nome
      Start-Sleep -Milliseconds 400
      if ($info) { $fontesUrls += $info }
    } catch {
      Write-Host "commons falhou: $nome"
    }
  }

  if ($fontesUrls.Count -lt 2 -and $entrada.inat) {
    $inat = Get-InatUrls $entrada.inat (3 - $fontesUrls.Count)
    Start-Sleep -Milliseconds 600
    $fontesUrls += $inat
  }

  $caminhos = @()
  $fontes = @()
  $i = 1
  foreach ($img in $fontesUrls) {
    if ($caminhos.Count -ge 3) { break }
    $ext = if ($img.url -match '\.png') { 'png' } else { 'jpg' }
    $nome = ('{0:d2}.{1}' -f $i, $ext)
    $ficheiro = Join-Path $pasta $nome
    if (Save-Image $img.url $ficheiro) {
      $caminhos += "/referencias/$($entrada.id)/$nome"
      $fontes += $img.fonte
      $i++
    } else {
      Write-Host "download falhou: $($img.fonte)"
    }
  }

  $cultura = if ($mapaCultura.ContainsKey($entrada.cultura)) { $mapaCultura[$entrada.cultura] } else { $entrada.cultura }
  $rotulo = if ($mapaRotulo.ContainsKey($entrada.rotulo)) { $mapaRotulo[$entrada.rotulo] } else { $entrada.rotulo }

  $catalogo += [pscustomobject]@{
    id = $entrada.id
    cultura = $cultura
    rotulo = $rotulo
    cientifico = $entrada.cientifico
    imagens = $caminhos
    fontes = $fontes
  }
  Write-Host "$($entrada.id): $($caminhos.Count) imagem(ns)"
}

$obj = [pscustomobject]@{ geradoEm = (Get-Date).ToString('o'); entradas = $catalogo }
$json = $obj | ConvertTo-Json -Depth 6
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $destino 'catalogo.json'), $json, $utf8)
[System.IO.File]::WriteAllText((Join-Path $raiz 'src\biblioteca-referencias.dados.json'), $json, $utf8)
Write-Host 'Catalogo gravado.'
