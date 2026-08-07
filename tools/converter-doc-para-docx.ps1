<#
.SINOPSE
    Converte em lote arquivos .doc antigos para .docx, em silencio.

.DESCRICAO
    A aba de documentos timbrados do sistema le apenas .docx (o .doc antigo
    e um formato binario que o navegador nao consegue abrir). Este script
    resolve o acervo de uma vez: aponta para uma pasta e ele converte todo
    .doc encontrado, deixando o .docx ao lado do original.

    Silencioso por contrato:
      - nao faz nenhuma pergunta e nao pede confirmacao;
      - nao abre janela do Word (roda invisivel);
      - macros sao desabilitadas e alertas do Word suprimidos, entao um
        documento com macro ou com prompt de "salvar alteracoes" nao trava
        o lote no meio da madrugada;
      - arquivos que ja sao .docx sao ignorados sem reclamacao.

    Nao destrutivo: o .doc original NUNCA e apagado. Se ja existir um .docx
    com o mesmo nome, o arquivo e pulado (o script pode rodar de novo na
    mesma pasta sem refazer trabalho nem sobrescrever nada).

.EXEMPLO
    pwsh -File tools\converter-doc-para-docx.ps1 -Pasta "C:\Laudos"

.EXEMPLO
    # so a pasta indicada, sem entrar nas subpastas
    pwsh -File tools\converter-doc-para-docx.ps1 -Pasta "C:\Laudos" -SemSubpastas

.EXEMPLO
    # mostra o que faria, sem converter nada
    pwsh -File tools\converter-doc-para-docx.ps1 -Pasta "C:\Laudos" -Simular

.NOTAS
    Requer Microsoft Word instalado (detectado: Word 16.0).
    Log de cada execucao em <Pasta>\_conversao-docx.log
#>

[CmdletBinding()]
param(
    # Pasta a varrer. Sem isso, usa a pasta atual.
    [string]$Pasta = (Get-Location).Path,

    # Por padrao entra nas subpastas; use isto para ficar so no primeiro nivel.
    [switch]$SemSubpastas,

    # Lista o que seria convertido sem tocar em nada.
    [switch]$Simular,

    # Nem o resumo final aparece no console (o log em arquivo continua).
    [switch]$Mudo
)

$ErrorActionPreference = 'Stop'

# Constantes COM do Word (nao ha enum disponivel via COM tardio)
$WD_FORMATO_DOCX      = 16  # wdFormatDocumentDefault
$WD_NAO_SALVAR        = 0   # wdDoNotSaveChanges
$WD_SEM_ALERTAS       = 0   # wdAlertsNone
$MSO_MACROS_DESLIGADAS = 3  # msoAutomationSecurityForceDisable
# Senha proposital invalida: documento protegido FALHA em vez de abrir um
# dialogo pedindo senha e travar o lote esperando alguem digitar.
$SENHA_IMPOSSIVEL = '*sem-senha-nao-perguntar*'

if (-not (Test-Path -LiteralPath $Pasta)) {
    Write-Error "Pasta nao encontrada: $Pasta"
    exit 1
}
$Pasta = (Resolve-Path -LiteralPath $Pasta).Path
$log = Join-Path $Pasta '_conversao-docx.log'

function Escrever-Log {
    param([string]$Texto)
    $linha = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Texto
    Add-Content -LiteralPath $log -Value $linha -Encoding UTF8
}

Escrever-Log "=== inicio | pasta=$Pasta | subpastas=$(-not $SemSubpastas) | simular=$Simular ==="

# ~$arquivo.doc sao lock files temporarios do Word, nao documentos.
$arquivos = @(
    Get-ChildItem -LiteralPath $Pasta -Filter '*.doc' -File -Recurse:(-not $SemSubpastas) |
        Where-Object { $_.Name -notlike '~$*' -and $_.Extension -ieq '.doc' }
)

$convertidos = 0
$pulados     = 0
$falhas      = 0

if ($arquivos.Count -eq 0) {
    Escrever-Log 'nenhum .doc encontrado'
    if (-not $Mudo) { Write-Host "Nada a converter: nenhum .doc em $Pasta" }
    exit 0
}

$word = $null
try {
    if (-not $Simular) {
        try {
            $word = New-Object -ComObject Word.Application
        } catch {
            Escrever-Log "ERRO: Word nao pode ser iniciado - $($_.Exception.Message)"
            if (-not $Mudo) { Write-Host 'Microsoft Word nao esta disponivel nesta maquina.' }
            exit 1
        }
        $word.Visible            = $false
        $word.DisplayAlerts      = $WD_SEM_ALERTAS
        $word.AutomationSecurity = $MSO_MACROS_DESLIGADAS
    }

    foreach ($arquivo in $arquivos) {
        $destino = [System.IO.Path]::ChangeExtension($arquivo.FullName, '.docx')

        if (Test-Path -LiteralPath $destino) {
            $pulados++
            Escrever-Log "pulado (docx ja existe): $($arquivo.FullName)"
            continue
        }

        if ($Simular) {
            $convertidos++
            Escrever-Log "SIMULACAO converteria: $($arquivo.FullName)"
            if (-not $Mudo) { Write-Host "[simular] $($arquivo.FullName)" }
            continue
        }

        $doc = $null
        try {
            # Posicional: FileName, ConfirmConversions, ReadOnly, AddToRecentFiles,
            # PasswordDocument, PasswordTemplate, Revert, WritePasswordDocument,
            # WritePasswordTemplate, Format, Encoding, Visible
            $doc = $word.Documents.Open(
                $arquivo.FullName, $false, $true, $false,
                $SENHA_IMPOSSIVEL, '', $false, '', '', 0, 0, $false
            )
            $doc.SaveAs2($destino, $WD_FORMATO_DOCX)
            $doc.Close($WD_NAO_SALVAR)
            $doc = $null

            # Confia, mas confere: SaveAs2 pode retornar sem erro e deixar
            # um arquivo vazio se o .doc de origem estiver corrompido.
            $saida = Get-Item -LiteralPath $destino -ErrorAction SilentlyContinue
            if ($null -eq $saida -or $saida.Length -eq 0) {
                throw 'saida vazia ou ausente apos SaveAs2'
            }

            $convertidos++
            Escrever-Log "convertido: $($arquivo.FullName) -> $destino"
        } catch {
            $falhas++
            Escrever-Log "FALHA: $($arquivo.FullName) - $($_.Exception.Message)"
            if ($doc) {
                try { $doc.Close($WD_NAO_SALVAR) } catch { }
            }
            # Nao deixa meio-arquivo para tras: ele bloquearia a proxima rodada.
            if (Test-Path -LiteralPath $destino) {
                try { Remove-Item -LiteralPath $destino -Force } catch { }
            }
        }
    }
} finally {
    if ($word) {
        try { $word.Quit($WD_NAO_SALVAR) } catch { }
        try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) } catch { }
        $word = $null
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
}

Escrever-Log "=== fim | convertidos=$convertidos pulados=$pulados falhas=$falhas ==="

if (-not $Mudo) {
    Write-Host "Convertidos: $convertidos | Ja existiam: $pulados | Falhas: $falhas"
    if ($falhas -gt 0) { Write-Host "Detalhes das falhas em: $log" }
}

if ($falhas -gt 0) { exit 2 }
exit 0
