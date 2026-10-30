param(
  [Parameter(Mandatory = $true)][int]$TargetProcessId,
  [Parameter(Mandatory = $true)][ValidateSet('dump', 'down', 'home', 'escape', 'palette', 'quit')][string]$Command
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OrbitForeground {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
}
'@
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $TargetProcessId)
$window = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
if ($null -eq $window) { throw "No UI Automation window for process $TargetProcessId" }
if ($Command -ne 'dump') {
  if (-not [OrbitForeground]::SetForegroundWindow($window.Current.NativeWindowHandle)) { throw 'Cannot foreground installed app' }
  Start-Sleep -Milliseconds 250
  $keys = @{ down = '{DOWN}'; home = '{HOME}'; escape = '{ESC}'; palette = '^k'; quit = '^q' }
  [System.Windows.Forms.SendKeys]::SendWait($keys[$Command])
  @{ sent = $Command } | ConvertTo-Json
  exit 0
}
$nodes = New-Object 'System.Collections.Generic.List[object]'
$interactiveRoles = @('Button', 'CheckBox', 'RadioButton', 'Edit', 'ComboBox', 'Hyperlink', 'Slider', 'MenuItem', 'TabItem', 'ListItem', 'Spinner')
function Read-Element($element, [string]$path) {
  if ($nodes.Count -ge 20000) { throw 'UI Automation tree exceeded node limit' }
  $current = $element.Current
  $role = $current.ControlType.ProgrammaticName.Replace('ControlType.', '')
  $selection = $element.GetCurrentPropertyValue([System.Windows.Automation.SelectionItemPattern]::IsSelectedProperty)
  $nodes.Add(@{
    id = $path; role = $role; name = $current.Name
    interactive = ($current.IsKeyboardFocusable -or ($interactiveRoles -contains $role))
    focused = $current.HasKeyboardFocus; selected = ($selection -eq $true)
  })
  $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
  $child = $walker.GetFirstChild($element)
  $index = 0
  while ($null -ne $child) {
    Read-Element $child "$path/$index"
    $child = $walker.GetNextSibling($child)
    $index++
  }
}
Read-Element $window '0'
@{ denied = $false; error = $null; nodes = @($nodes.ToArray()) } | ConvertTo-Json -Depth 8
