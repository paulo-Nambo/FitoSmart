$raiz = Split-Path -Parent $PSScriptRoot
$destino = Join-Path $raiz 'client\public\referencias'

$meta = @{
  'milho-lagarta-cartucho' = @{ cultura='Milho'; rotulo='Lagarta-do-cartucho'; cientifico='Spodoptera frugiperda' }
  'milho-ferrugem' = @{ cultura='Milho'; rotulo='Ferrugem do milho'; cientifico='Puccinia sorghi' }
  'milho-queima-foliar' = @{ cultura='Milho'; rotulo='Queima foliar do milho'; cientifico='Exserohilum turcicum' }
  'milho-riscado' = @{ cultura='Milho'; rotulo='Vírus do riscado do milho'; cientifico='Maize streak virus' }
  'mandioca-mosaico' = @{ cultura='Mandioca'; rotulo='Mosaico da mandioca'; cientifico='Cassava mosaic virus' }
  'mandioca-estria' = @{ cultura='Mandioca'; rotulo='Estría castanha da mandioca'; cientifico='Cassava brown streak virus' }
  'feijao-ferrugem' = @{ cultura='Feijão'; rotulo='Ferrugem do feijão'; cientifico='Uromyces appendiculatus' }
  'feijao-mancha-angular' = @{ cultura='Feijão'; rotulo='Mancha angular do feijão'; cientifico='Pseudocercospora griseola' }
  'feijao-antracnose' = @{ cultura='Feijão'; rotulo='Antracnose do feijão'; cientifico='Colletotrichum lindemuthianum' }
  'tomate-tuta' = @{ cultura='Tomate'; rotulo='Traça-do-tomateiro'; cientifico='Tuta absoluta' }
  'tomate-alternaria' = @{ cultura='Tomate'; rotulo='Alternária / pinta-preta'; cientifico='Alternaria solani' }
  'tomate-mildio' = @{ cultura='Tomate'; rotulo='Míldio do tomateiro'; cientifico='Phytophthora infestans' }
  'tomate-acaro' = @{ cultura='Tomate'; rotulo='Ácaro-rajado'; cientifico='Tetranychus urticae' }
  'tomate-enrolamento' = @{ cultura='Tomate'; rotulo='Vírus do enrolamento amarelo'; cientifico='Tomato yellow leaf curl virus' }
}

$entradas = @()
Get-ChildItem -Directory $destino | Sort-Object Name | ForEach-Object {
  $id = $_.Name
  if (-not $meta.ContainsKey($id)) { return }
  $imagens = Get-ChildItem $_.FullName -File | Where-Object { $_.Extension -match '\.(jpg|jpeg|png|webp)$' } | Sort-Object Name | ForEach-Object { "/referencias/$id/$($_.Name)" }
  if ($imagens.Count -eq 0) { return }
  $m = $meta[$id]
  $entradas += [pscustomobject]@{
    id = $id
    cultura = $m.cultura
    rotulo = $m.rotulo
    cientifico = $m.cientifico
    imagens = @($imagens)
  }
}

$obj = [pscustomobject]@{ geradoEm = (Get-Date).ToString('o'); entradas = $entradas }
$json = $obj | ConvertTo-Json -Depth 6
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $destino 'catalogo.json'), $json, $utf8)
[System.IO.File]::WriteAllText((Join-Path $raiz 'src\biblioteca-referencias.dados.json'), $json, $utf8)
Write-Host "Entradas: $($entradas.Count)"
$entradas | ForEach-Object { Write-Host "$($_.id): $($_.imagens.Count)" }
