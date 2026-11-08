param(
  [Parameter(Mandatory = $true)][int]$TargetProcessId,
  [Parameter(Mandatory = $true)][ValidateSet('dump', 'down', 'home', 'escape', 'palette', 'menu', 'quit', 'windows', 'close', 'notification', 'process')][string]$Command,
  [uint32]$MenuCommandId,
  [string]$Title,
  [string]$Label,
  [switch]$Invoke,
  [switch]$OpenCenter,
  [string]$Executable
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Windows.Forms
Add-Type @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public sealed class OrbitWindow {
    public long handle;
    public string className;
    public string title;
    public bool visible;
}
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
    private delegate bool WindowVisitor(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowVisitor visitor, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int GetClassNameW(IntPtr window, StringBuilder text, int capacity);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int GetWindowTextW(IntPtr window, StringBuilder text, int capacity);
    [DllImport("user32.dll")] private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);

    public static OrbitWindow[] Windows(int processId) {
        var windows = new List<OrbitWindow>();
        EnumWindows((window, parameter) => {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            if (owner != (uint)processId) return true;
            var className = new StringBuilder(256);
            var title = new StringBuilder(512);
            GetClassNameW(window, className, className.Capacity);
            GetWindowTextW(window, title, title.Capacity);
            windows.Add(new OrbitWindow { handle = window.ToInt64(), className = className.ToString(), title = title.ToString(), visible = IsWindowVisible(window) });
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }

    public static void Close(int processId) {
        var closed = 0;
        foreach (var window in Windows(processId)) {
            if (!window.visible || window.className != "Tauri Window") continue;
            if (!PostMessageW(new IntPtr(window.handle), 0x10, UIntPtr.Zero, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
            closed++;
        }
        if (closed == 0) throw new InvalidOperationException("Installed app has no visible window to close");
    }

    // Windows + N opens the notification center, where a toast moves after its banner times out.
    public static void OpenNotificationCenter() {
        keybd_event(0x5B, 0, 0, UIntPtr.Zero);
        keybd_event(0x4E, 0, 0, UIntPtr.Zero);
        keybd_event(0x4E, 0, 2, UIntPtr.Zero);
        keybd_event(0x5B, 0, 2, UIntPtr.Zero);
    }

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
function Find-Notification([string]$Title, [string]$Label, [int]$Exclude) {
  $automation = [System.Windows.Automation.AutomationElement]
  $scope = [System.Windows.Automation.TreeScope]
  $buttonCondition = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition($automation::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)),
    (New-Object System.Windows.Automation.PropertyCondition($automation::NameProperty, $Label)))
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $seen = New-Object 'System.Collections.Generic.List[object]'
  foreach ($window in $automation::RootElement.FindAll($scope::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($window.Current.ProcessId -eq $Exclude) { continue }
    $seen.Add(@{ name = $window.Current.Name; className = $window.Current.ClassName; processId = $window.Current.ProcessId })
    # The shell draws toast banners and the notification center in CoreWindow hosts; a full desktop walk is too slow to poll.
    if ($window.Current.ClassName -ne 'Windows.UI.Core.CoreWindow' -and $window.Current.Name -notmatch 'notification') { continue }
    # A toast exposes its title as a text element, or folds title and body into its own accessible name.
    $texts = @($window.FindAll($scope::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -and $_.Current.Name.Contains($Title) })
    foreach ($text in $texts) {
      $ancestor = $text
      while ($null -ne $ancestor) {
        $buttons = $ancestor.FindAll($scope::Descendants, $buttonCondition)
        if ($buttons.Count -eq 1) {
          return @{ button = $buttons[0]; window = @{ name = $window.Current.Name; className = $window.Current.ClassName; processId = $window.Current.ProcessId } }
        }
        if ($buttons.Count -gt 1 -or [System.Windows.Automation.Automation]::Compare($ancestor, $window)) { break }
        $ancestor = $walker.GetParent($ancestor)
      }
    }
  }
  return @{ button = $null; windows = $seen.ToArray() }
}
if ($Command -eq 'windows') {
  @{ windows = @([OrbitForeground]::Windows($TargetProcessId)) } | ConvertTo-Json -Depth 4
  exit 0
}
if ($Command -eq 'close') {
  [OrbitForeground]::Close($TargetProcessId)
  @{ sent = $Command } | ConvertTo-Json
  exit 0
}
if ($Command -eq 'process') {
  if (-not $Executable) { throw 'process requires -Executable' }
  @{ processIds = @(Get-Process | Where-Object { $_.Path -eq $Executable } | ForEach-Object { $_.Id }) } | ConvertTo-Json
  exit 0
}
if ($Command -eq 'notification') {
  if (-not $Title -or -not $Label) { throw 'notification requires -Title and -Label' }
  if ($OpenCenter) { [OrbitForeground]::OpenNotificationCenter(); Start-Sleep -Milliseconds 1000 }
  $match = Find-Notification $Title $Label $TargetProcessId
  if ($null -eq $match.button) {
    @{ found = $false; invoked = $false; windows = $match.windows } | ConvertTo-Json -Depth 4
    exit 0
  }
  if ($Invoke) { $match.button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
  @{ found = $true; invoked = [bool]$Invoke; window = $match.window } | ConvertTo-Json -Depth 4
  exit 0
}
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
