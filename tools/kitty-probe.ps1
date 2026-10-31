# Prints one PNG twice with the kitty graphics protocol, outside Claude Code:
#   [1] direct placement   (a=T)        the image is placed at the cursor
#   [2] unicode placeholder (a=T,U=1)    cells of U+10EEEE carry the image
# Run it in the terminal that shows blank images. If a picture stays blank
# until the window is resized, the terminal is at fault, not Claude Code.
# Usage: pwsh -File kitty-probe.ps1 C:\path\to\image.png
param([Parameter(Mandatory)][string]$Path)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$esc = [char]27
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $Path)))
$cols = 20
$rows = 6

function Send-Image([string]$head) {
  $chunk = 4096
  for ($i = 0; $i -lt $b64.Length; $i += $chunk) {
    $part = $b64.Substring($i, [Math]::Min($chunk, $b64.Length - $i))
    $more = if ($i + $chunk -lt $b64.Length) { 1 } else { 0 }
    $ctl = if ($i -eq 0) { "$head,m=$more" } else { "m=$more" }
    [Console]::Out.Write("${esc}_G$ctl;$part${esc}\")
  }
  [Console]::Out.Flush()
}

# Row/column diacritics from the kitty spec (first entries of its table).
$marks = 0x0305, 0x030D, 0x030E, 0x0310, 0x0312, 0x033D, 0x033E, 0x033F,
         0x0346, 0x034A, 0x034B, 0x034C, 0x0350, 0x0351, 0x0352, 0x0357,
         0x035B, 0x0363, 0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369

Write-Host '[1] direct placement:'
Send-Image "a=T,f=100,i=7101,c=$cols,r=$rows,q=2"
[Console]::Out.Write("`n" * $rows)

Write-Host '[2] unicode placeholder:'
$id = 7102
Send-Image "a=T,f=100,i=$id,U=1,c=$cols,r=$rows,q=2"
$cell = [char]::ConvertFromUtf32(0x10EEEE)
# Image id 7102 = 0x001BBE: low 24 bits as the truecolor foreground.
$fg = "${esc}[38;2;$(($id -shr 16) -band 255);$(($id -shr 8) -band 255);$($id -band 255)m"
for ($r = 0; $r -lt $rows; $r++) {
  $line = $fg
  for ($c = 0; $c -lt $cols; $c++) {
    $line += $cell + [char]$marks[$r] + [char]$marks[$c]
  }
  [Console]::Out.Write("$line${esc}[39m`n")
}
[Console]::Out.Flush()
Write-Host 'done. Which of [1] and [2] show without resizing?'
