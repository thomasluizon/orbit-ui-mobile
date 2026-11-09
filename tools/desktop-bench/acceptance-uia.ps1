param(
  [Parameter(Mandatory = $true)][int]$TargetProcessId,
  [Parameter(Mandatory = $true)][ValidateSet('dump', 'down', 'home', 'escape', 'palette', 'menu', 'quit', 'caption', 'windows', 'close', 'notification', 'process', 'activation')][string]$Command,
  [uint32]$MenuCommandId,
  [string]$Title,
  [string]$Label,
  [switch]$Invoke,
  [switch]$OpenCenter,
  [string]$Executable,
  [string]$Capture
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
public sealed class OrbitHostWindow {
    public long handle;
    public string className;
    public string title;
    public uint processId;
    public string path;
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

    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder path, ref uint size);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);

    private static string ImagePath(uint processId) {
        IntPtr process = OpenProcess(0x1000, false, processId);
        if (process == IntPtr.Zero) return null;
        try {
            var path = new StringBuilder(1024);
            uint size = (uint)path.Capacity;
            return QueryFullProcessImageNameW(process, 0, path, ref size) ? path.ToString() : null;
        } finally { CloseHandle(process); }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern IntPtr FindWindowExW(IntPtr parent, IntPtr childAfter, string className, string windowName);

    // Visible top-level windows of every other process, where the shell draws toasts and the notification center. The
    // EnumWindows reference says it "enumerates only top-level windows of desktop apps" on Windows 8 and later, and a recorded
    // run showed the open notification center missing from both EnumWindows and the UI Automation root children. FindWindowEx
    // with a null parent and a null child "searches all top-level and message-only windows", and a message-only window is
    // never visible. A window whose image path cannot be read keeps a null path.
    public static OrbitHostWindow[] SystemWindows(int exclude) {
        var windows = new List<OrbitHostWindow>();
        var window = IntPtr.Zero;
        for (int count = 0; count < 20000; count++) {
            window = FindWindowExW(IntPtr.Zero, window, null, null);
            if (window == IntPtr.Zero) break;
            if (!IsWindowVisible(window)) continue;
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            if (owner == (uint)exclude) continue;
            var className = new StringBuilder(256);
            var title = new StringBuilder(512);
            GetClassNameW(window, className, className.Capacity);
            GetWindowTextW(window, title, title.Capacity);
            windows.Add(new OrbitHostWindow { handle = window.ToInt64(), className = className.ToString(), title = title.ToString(), processId = owner, path = ImagePath(owner) });
        }
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
# The match rule reads the tree only through $Tree, so a test drives it with recorded layouts on any PowerShell host.
function Find-ToastButton($HostElement, [string]$Title, [string]$Label, $Tree) {
  # A toast exposes its title as a text element, or folds title and body into its own accessible name.
  foreach ($text in @(& $Tree.Texts $HostElement $Title)) {
    $ancestor = $text
    while ($null -ne $ancestor) {
      $atHost = & $Tree.Same $ancestor $HostElement
      $buttons = @(& $Tree.Buttons $ancestor $Label)
      $expanded = $false
      # The notification center lists a toast collapsed, and its actions show only once it expands. The host itself never
      # expands, because that would open every other entry in the center.
      if ($buttons.Count -eq 0 -and -not $atHost) {
        $collapsed = @(& $Tree.Collapsed $ancestor)
        foreach ($entry in $collapsed) { & $Tree.Expand $entry }
        if ($collapsed.Count -gt 0) { $expanded = $true; $buttons = @(& $Tree.Buttons $ancestor $Label) }
      }
      if ($buttons.Count -eq 1) { return @{ button = $buttons[0]; toast = $ancestor; expanded = $expanded } }
      if ($buttons.Count -gt 1 -or $atHost) { break }
      $ancestor = & $Tree.Parent $ancestor
    }
  }
  return $null
}
function New-AutomationTree([string]$Label) {
  $automation = [System.Windows.Automation.AutomationElement]
  $scope = [System.Windows.Automation.TreeScope]
  $buttonCondition = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition($automation::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)),
    (New-Object System.Windows.Automation.PropertyCondition($automation::NameProperty, $Label)))
  $expandable = New-Object System.Windows.Automation.PropertyCondition($automation::IsExpandCollapsePatternAvailableProperty, $true)
  $expandPattern = [System.Windows.Automation.ExpandCollapsePattern]::Pattern
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  return @{
    Texts = { param($element, $title) @($element.FindAll($scope::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -and $_.Current.Name.Contains($title) }) }.GetNewClosure()
    Buttons = { param($element, $label) @($element.FindAll($scope::Descendants, $buttonCondition)) }.GetNewClosure()
    Parent = { param($element) $walker.GetParent($element) }.GetNewClosure()
    Same = { param($first, $second) [System.Windows.Automation.Automation]::Compare($first, $second) }
    Collapsed = { param($element) @($element.FindAll($scope::Subtree, $expandable) | Where-Object {
      $_.GetCurrentPattern($expandPattern).Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Collapsed }) }.GetNewClosure()
    Expand = { param($element) $element.GetCurrentPattern($expandPattern).Expand(); Start-Sleep -Milliseconds 300 }.GetNewClosure()
  }
}
function Get-NotificationHosts([int]$Exclude, $Seen) {
  $automation = [System.Windows.Automation.AutomationElement]
  $hosts = New-Object 'System.Collections.Generic.List[object]'
  $handles = New-Object 'System.Collections.Generic.HashSet[long]'
  foreach ($window in $automation::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($window.Current.ProcessId -eq $Exclude) { continue }
    $Seen.Add(@{ name = $window.Current.Name; className = $window.Current.ClassName; processId = $window.Current.ProcessId; source = 'automation' })
    # The shell draws toast banners and the notification center in CoreWindow hosts; a full desktop walk is too slow to poll.
    if ($window.Current.ClassName -ne 'Windows.UI.Core.CoreWindow' -and $window.Current.Name -notmatch 'notification') { continue }
    if ($handles.Add([long]$window.Current.NativeWindowHandle)) { $hosts.Add($window) }
  }
  $system = [Environment]::GetFolderPath([Environment+SpecialFolder]::Windows).TrimEnd('\') + '\'
  foreach ($window in [OrbitForeground]::SystemWindows($Exclude)) {
    $Seen.Add(@{ name = $window.title; className = $window.className; processId = $window.processId; path = $window.path; source = 'system' })
    # The shell draws toasts and the notification center from the Windows directory, in CoreWindow hosts.
    $shell = if ($null -eq $window.path) { $window.className -eq 'Windows.UI.Core.CoreWindow' } else { $window.path.StartsWith($system, [StringComparison]::OrdinalIgnoreCase) }
    if (-not $shell -or -not $handles.Add($window.handle)) { continue }
    try { $hosts.Add($automation::FromHandle([IntPtr]$window.handle)) } catch { $Seen[$Seen.Count - 1].error = $_.Exception.Message }
  }
  # Windows + N moves keyboard focus into the notification center, so the top-level ancestor of the focused element is the
  # open center even when no window enumeration lists it.
  $focused = Get-FocusedHost
  if ($null -ne $focused.element -and $focused.element.Current.ProcessId -ne $Exclude) {
    $Seen.Add(@{ name = $focused.element.Current.Name; className = $focused.element.Current.ClassName; processId = $focused.element.Current.ProcessId; source = 'focus' })
    $handle = [long]$focused.element.Current.NativeWindowHandle
    if ($handle -eq 0 -or $handles.Add($handle)) { $hosts.Add($focused.element) }
  } elseif ($null -ne $focused.error) { $Seen.Add(@{ source = 'focus'; error = $focused.error }) }
  return $hosts
}
function Get-FocusedHost {
  $automation = [System.Windows.Automation.AutomationElement]
  try {
    $element = $automation::FocusedElement
    if ($null -eq $element) { return @{ element = $null } }
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    for ($depth = 0; $depth -lt 64; $depth++) {
      $parent = $walker.GetParent($element)
      if ($null -eq $parent -or [System.Windows.Automation.Automation]::Compare($parent, $automation::RootElement)) { break }
      $element = $parent
    }
    return @{ element = $element }
  } catch { return @{ element = $null; error = $_.Exception.Message } }
}
# The Windows App SDK names an unpackaged app by the NotificationGUID value under HKCU Software\Classes\AppUserModelId\<the
# executable path with every backslash replaced by a dot> (AppNotificationUtility RetrieveUnpackagedNotificationAppId and
# ConvertPathToKey), and its toasts stay in the notification history of that AUMID until they are removed.
function Get-ToastHistory([string]$Path, [string]$Title) {
  $result = @{ appId = $null; posted = $false; count = 0; titles = @() }
  if (-not $Path) { $result.error = 'no executable path'; return $result }
  try {
    $key = "HKCU:\Software\Classes\AppUserModelId\$($Path.Replace('\', '.'))"
    $appId = (Get-ItemProperty -LiteralPath $key -Name NotificationGUID -ErrorAction SilentlyContinue).NotificationGUID
    if (-not $appId) {
      $result.error = 'no NotificationGUID for the executable'
      $result.registrations = @(Get-ChildItem -LiteralPath 'HKCU:\Software\Classes\AppUserModelId' -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -like '*orbit-desktop.exe' } | ForEach-Object { $_.PSChildName })
      return $result
    }
    $result.appId = $appId
    $result.displayName = (Get-ItemProperty -LiteralPath "HKCU:\Software\Classes\AppUserModelId\$appId" -Name DisplayName -ErrorAction SilentlyContinue).DisplayName
    $manager = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $titles = New-Object 'System.Collections.Generic.List[string]'
    foreach ($toast in $manager::History.GetHistory($appId)) {
      $result.count++
      $texts = @([regex]::Matches($toast.Content.GetXml(), '<text[^>]*>([^<]*)</text>') | ForEach-Object { [System.Net.WebUtility]::HtmlDecode($_.Groups[1].Value) })
      if ($texts.Count -gt 0) { $titles.Add($texts[0]) }
      if ($texts -contains $Title) { $result.posted = $true }
    }
    $result.titles = $titles.ToArray()
  } catch { $result.error = $_.Exception.Message }
  return $result
}
function Find-Notification([string]$Title, [string]$Label, [int]$Exclude) {
  $tree = New-AutomationTree $Label
  $seen = New-Object 'System.Collections.Generic.List[object]'
  $titled = $null
  foreach ($window in (Get-NotificationHosts $Exclude $seen)) {
    $match = Find-ToastButton $window $Title $Label $tree
    $where = @{ name = $window.Current.Name; className = $window.Current.ClassName; processId = $window.Current.ProcessId }
    if ($null -ne $match) {
      return @{ button = $match.button; toast = $match.toast; expanded = $match.expanded; windows = $seen.ToArray(); window = $where }
    }
    if ($null -eq $titled -and @(& $tree.Texts $window $Title).Count -gt 0) { $titled = @{ element = $window; window = $where } }
  }
  return @{ button = $null; titled = $titled; windows = $seen.ToArray() }
}
# The documented per-user mode says whether Do not disturb holds banners back (ToastNotificationManagerForUser.NotificationMode).
function Get-NotificationMode {
  try {
    $manager = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    return $manager::GetDefault().NotificationMode.ToString()
  } catch { return "unavailable: $($_.Exception.Message)" }
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
if ($Command -eq 'activation') {
  if (-not $Executable) { throw 'activation requires -Executable' }
  # COM gives a server it launches the activator's token, and a process elevated through UAC "does not load per-user classes
  # during COM activations" (https://learn.microsoft.com/en-us/windows/win32/com/the-com-elevation-moniker). Thus the token
  # levels of the shell hosts say whether a toast activation can reach the shell's per-user activator at all. The launcher's
  # token reader names them, and only this command compiles it, so the other commands keep their start time.
  Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'windows-unelevated.cs') -Raw)
  function Get-ProcessToken([uint32]$ProcessId) {
    try {
      $token = [OrbitIntegrity]::DescribeProcess($ProcessId)
      return @{ integrity = $token.Integrity; elevated = $token.TokenIsElevated; error = $null }
    } catch { return @{ integrity = $null; elevated = $false; error = $_.Exception.GetBaseException().Message } }
  }
  # The toast activation runs through the shell hosts and the per-user Windows Push Notifications service; a second shell
  # instance means Windows launched the activator instead of reaching the running one.
  $hosts = New-Object 'System.Collections.Generic.List[object]'
  foreach ($process in @(Get-Process -Name explorer, ShellExperienceHost, sihost -ErrorAction SilentlyContinue)) {
    $hosts.Add(@{ processId = $process.Id; name = $process.ProcessName } + (Get-ProcessToken $process.Id))
  }
  foreach ($service in @(Get-CimInstance Win32_Service -Filter "Name LIKE 'WpnUserService%'" | Where-Object { $_.ProcessId -gt 0 })) {
    $hosts.Add(@{ processId = $service.ProcessId; name = $service.Name } + (Get-ProcessToken $service.ProcessId))
  }
  $instances = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $Executable } | ForEach-Object {
    @{ processId = $_.ProcessId; parentProcessId = $_.ParentProcessId; commandLine = $_.CommandLine } + (Get-ProcessToken $_.ProcessId)
  })
  @{ hosts = $hosts.ToArray(); instances = $instances } | ConvertTo-Json -Depth 4
  exit 0
}
if ($Command -eq 'notification') {
  if (-not $Title -or -not $Label) { throw 'notification requires -Title and -Label' }
  if ($OpenCenter) { [OrbitForeground]::OpenNotificationCenter(); Start-Sleep -Milliseconds 1000 }
  $match = Find-Notification $Title $Label $TargetProcessId
  $mode = Get-NotificationMode
  $history = Get-ToastHistory $Executable $Title
  if ($null -eq $match.button) {
    $reply = @{ found = $false; invoked = $false; notificationMode = $mode; history = $history; windows = $match.windows }
    # A host that shows the title without a single matching action keeps its tree, so the artifacts hold the layout that missed.
    if ($null -ne $match.titled) {
      $failure = $null
      try { Read-Element $match.titled.element '0' } catch { $failure = $_.Exception.Message }
      $reply.titled = @{ window = $match.titled.window; error = $failure; nodes = @($nodes.ToArray()) }
    }
    $reply | ConvertTo-Json -Depth 8
    exit 0
  }
  # Invoke dismisses the toast, so its subtree is read first and the artifacts carry the layout that held the button.
  $failure = $null
  try { Read-Element $match.toast '0' } catch { $failure = $_.Exception.Message }
  $toast = @{ error = $failure; nodes = @($nodes.ToArray()) }
  if ($Invoke) { $match.button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
  @{ found = $true; invoked = [bool]$Invoke; expanded = [bool]$match.expanded; notificationMode = $mode; history = $history; window = $match.window
    windows = $match.windows; toast = $toast } | ConvertTo-Json -Depth 8
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
if ($Command -eq 'caption') {
  if (-not $Capture) { throw 'caption requires -Capture' }
  # Only this command compiles the caption reader, so the other commands keep their start time.
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'acceptance-caption.cs') -Raw)
  # A foreground window has nothing above its caption, and its active caption is the one the owner sees.
  if (-not [OrbitForeground]::SetForegroundWindow($window.Current.NativeWindowHandle)) { throw 'Cannot foreground installed app' }
  Start-Sleep -Milliseconds 250
  [OrbitCaptionReader]::Read([IntPtr]$window.Current.NativeWindowHandle, $Capture) | ConvertTo-Json -Depth 5
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
$failure = $null
try { Read-Element $window '0' } catch { $failure = $_.Exception.Message }
@{ denied = $false; error = $failure; nodes = @($nodes.ToArray()) } | ConvertTo-Json -Depth 8
