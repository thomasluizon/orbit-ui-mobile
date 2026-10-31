param(
  [Parameter(Mandatory = $true)][int]$TargetProcessId,
  [Parameter(Mandatory = $true)][ValidateSet('dump', 'down', 'home', 'escape', 'palette', 'menu', 'quit')][string]$Command,
  [uint32]$MenuCommandId
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Windows.Forms
Add-Type @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public sealed class OrbitMenuItem {
    public uint id;
    public string text;
    public bool enabled;
    public OrbitMenuItem[] children;
}
public static class OrbitForeground {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetSubMenu(IntPtr menu, int position);
    [DllImport("user32.dll")] private static extern int GetMenuItemCount(IntPtr menu);
    [DllImport("user32.dll")] private static extern uint GetMenuItemID(IntPtr menu, int position);
    [DllImport("user32.dll")] private static extern uint GetMenuState(IntPtr menu, uint position, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int GetMenuStringW(IntPtr menu, uint position, StringBuilder text, int capacity, uint flags);
    [DllImport("user32.dll", SetLastError = true, ExactSpelling = true)]
    private static extern bool PostMessageW(IntPtr window, uint message, UIntPtr command, IntPtr parameter);

    public static OrbitMenuItem[] ReadMenu(IntPtr menu) {
        if (menu == IntPtr.Zero) throw new InvalidOperationException("Installed window has no native menu");
        int count = GetMenuItemCount(menu);
        if (count < 0) throw new InvalidOperationException("Cannot enumerate installed menu");
        var items = new List<OrbitMenuItem>();
        for (int position = 0; position < count; position++) {
            int length = GetMenuStringW(menu, (uint)position, null, 0, 0x400);
            var text = new StringBuilder(length + 1);
            GetMenuStringW(menu, (uint)position, text, text.Capacity, 0x400);
            uint state = GetMenuState(menu, (uint)position, 0x400);
            if (state == uint.MaxValue) throw new InvalidOperationException("Cannot read installed menu state");
            IntPtr submenu = GetSubMenu(menu, position);
            items.Add(new OrbitMenuItem { id = GetMenuItemID(menu, position), text = text.ToString(),
                enabled = (state & 3) == 0, children = submenu == IntPtr.Zero ? new OrbitMenuItem[0] : ReadMenu(submenu) });
        }
        return items.ToArray();
    }

    private static bool HasEnabledCommand(OrbitMenuItem[] items, uint command) {
        foreach (var item in items) {
            if (!item.enabled) continue;
            if (item.children.Length == 0 && item.id == command) return true;
            if (HasEnabledCommand(item.children, command)) return true;
        }
        return false;
    }

    public static void InvokeMenu(IntPtr window, uint command) {
        if (command == 0 || command > 65535 || !HasEnabledCommand(ReadMenu(GetMenu(window)), command))
            throw new InvalidOperationException("Native menu command is unavailable");
        if (!PostMessageW(window, 0x111, (UIntPtr)command, IntPtr.Zero))
            throw new Win32Exception(Marshal.GetLastWin32Error());
    }
}
'@
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $TargetProcessId)
$window = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
if ($null -eq $window) { throw "No UI Automation window for process $TargetProcessId" }
if ($Command -eq 'menu') {
  @{ items = @([OrbitForeground]::ReadMenu([OrbitForeground]::GetMenu($window.Current.NativeWindowHandle))) } | ConvertTo-Json -Depth 20
  exit 0
}
if ($Command -eq 'quit') {
  [OrbitForeground]::InvokeMenu($window.Current.NativeWindowHandle, $MenuCommandId)
  @{ sent = $Command } | ConvertTo-Json
  exit 0
}
if ($Command -ne 'dump') {
  if (-not [OrbitForeground]::SetForegroundWindow($window.Current.NativeWindowHandle)) { throw 'Cannot foreground installed app' }
  Start-Sleep -Milliseconds 250
  $keys = @{ down = '{DOWN}'; home = '{HOME}'; escape = '{ESC}'; palette = '^k' }
  [System.Windows.Forms.SendKeys]::SendWait($keys[$Command])
  @{ sent = $Command } | ConvertTo-Json
  exit 0
}
$nodes = New-Object 'System.Collections.Generic.List[object]'
$interactiveRoles = @('Button', 'CheckBox', 'RadioButton', 'Edit', 'ComboBox', 'Hyperlink', 'Slider', 'MenuItem', 'TabItem', 'ListItem', 'Spinner')
function ConvertTo-FiniteNumber([double]$value) {
  if ([double]::IsInfinity($value) -or [double]::IsNaN($value)) { return $null }
  return $value
}
function Read-Element($element, [string]$path) {
  if ($nodes.Count -ge 20000) { throw 'UI Automation tree exceeded node limit' }
  $current = $element.Current
  $role = $current.ControlType.ProgrammaticName.Replace('ControlType.', '')
  $selection = $element.GetCurrentPropertyValue([System.Windows.Automation.SelectionItemPattern]::IsSelectedProperty)
  $nodes.Add(@{
    id = $path; role = $role; name = $current.Name
    interactive = ($current.IsKeyboardFocusable -or ($interactiveRoles -contains $role))
    focused = $current.HasKeyboardFocus; selected = ($selection -eq $true)
    AutomationId = $current.AutomationId; ClassName = $current.ClassName; FrameworkId = $current.FrameworkId
    IsOffscreen = $current.IsOffscreen; IsEnabled = $current.IsEnabled; IsKeyboardFocusable = $current.IsKeyboardFocusable
    IsControlElement = $current.IsControlElement; IsContentElement = $current.IsContentElement
    LocalizedControlType = $current.LocalizedControlType
    BoundingRectangle = @{
      X = ConvertTo-FiniteNumber $current.BoundingRectangle.X; Y = ConvertTo-FiniteNumber $current.BoundingRectangle.Y
      Width = ConvertTo-FiniteNumber $current.BoundingRectangle.Width; Height = ConvertTo-FiniteNumber $current.BoundingRectangle.Height
    }
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
$failure = $null
try { Read-Element $window '0' } catch { $failure = $_.Exception.Message }
@{ denied = $false; error = $failure; nodes = @($nodes.ToArray()) } | ConvertTo-Json -Depth 8
