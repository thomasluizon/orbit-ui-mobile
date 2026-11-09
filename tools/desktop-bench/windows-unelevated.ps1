param(
    [Parameter(Mandatory = $true)][ValidateSet('start', 'run', 'activate', 'notify')][string]$Mode,
    [string]$Executable,
    [string]$Log,
    [string]$Output,
    [string]$Status,
    [string]$Assembly,
    [string]$Title,
    [string]$Label,
    [string]$Request
)
$ErrorActionPreference = 'Stop'

# The Windows App SDK refuses app notifications when the token integrity level is High or above
# (AppNotificationManager::IsSupported and Security.IntegrityLevel.h in microsoft/WindowsAppSDK), so the installed
# shell starts with the token a person's app gets under UAC: a standard-user token at Medium integrity. A copy of the
# elevated token with only its integrity lowered keeps the Administrators group and the admin privileges, and WebView2
# fails to start under it (hosted windows-latest probe: "failed to create webview" with HRESULT 0x80010108 in every
# variant). The Safer normal-user level removes them, as `runas /trustlevel:0x20000` does, and the same probe started
# the shell with its WebView2 processes under it:
# https://learn.microsoft.com/en-us/windows/win32/api/winsafer/nf-winsafer-safercomputetokenfromlevel
# The token then takes an explicit Medium label, Microsoft's documented way to start a child at a lower level:
# https://learn.microsoft.com/en-us/previous-versions/dotnet/articles/bb625960(v=msdn.10)
# Add-Type compiles through CodeDom, which fails at Medium integrity with "A required privilege is not held by the
# client" (a hosted windows-latest probe reproduced it). Thus the High modes, start and activate, compile these types
# into a library, and the Medium modes, run and notify, only load that library.
# Activate mode drives the Done click that a hosted runner cannot deliver: its shell hosts run at High integrity, and COM
# never gives the activation of a High host to the running Medium shell. A Medium client with the shell's standard-user token
# makes the same INotificationActivationCallback::Activate call through the shell's registered activator instead.
$integritySource = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

public static class OrbitIntegrity {
    const uint TokenQuery = 0x0008;
    const int TokenUserClass = 1, TokenGroupsClass = 2, TokenSessionIdClass = 12, TokenElevationClass = 20, TokenIntegrityLevelClass = 25;
    const uint SeGroupEnabled = 0x04, SeGroupUseForDenyOnly = 0x10, SeGroupIntegrity = 0x20, CreateNoWindow = 0x08000000;
    const uint SaferScopeUser = 2, SaferLevelNormalUser = 0x20000, SaferLevelOpen = 1;
    public const string MediumSid = "S-1-16-8192", AdministratorsSid = "S-1-5-32-544";

    [StructLayout(LayoutKind.Sequential)]
    struct SidAndAttributes { public IntPtr Sid; public uint Attributes; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct StartupInfo {
        public uint cb;
        public string lpReserved, lpDesktop, lpTitle;
        public uint dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public ushort wShowWindow, cbReserved2;
        public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInformation { public IntPtr hProcess, hThread; public uint dwProcessId, dwThreadId; }

    public sealed class TokenContext {
        public string Sid { get; set; }
        public uint Rid { get; set; }
        public uint IntegrityRid { get; set; }
        public string Integrity { get; set; }
        public bool TokenIsElevated { get; set; }
        public string Administrators { get; set; }
        public uint Session { get; set; }
    }

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr buffer, int length, out int returned);
    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool SetTokenInformation(IntPtr token, int kind, IntPtr buffer, int length);
    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool SaferCreateLevel(uint scope, uint level, uint flags, out IntPtr handle, IntPtr reserved);
    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool SaferComputeTokenFromLevel(IntPtr level, IntPtr inputToken, out IntPtr outputToken, uint flags, IntPtr reserved);
    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool SaferCloseLevel(IntPtr handle);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool ConvertStringSidToSidW(string text, out IntPtr sid);
    [DllImport("advapi32.dll")]
    static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
    [DllImport("advapi32.dll")]
    static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
    [DllImport("advapi32.dll")]
    static extern int GetLengthSid(IntPtr sid);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcessAsUserW(IntPtr token, string application, StringBuilder commandLine, IntPtr processAttributes,
        IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string directory, ref StartupInfo startup,
        out ProcessInformation information);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")]
    static extern IntPtr LocalFree(IntPtr memory);
    [DllImport("kernel32.dll")]
    static extern IntPtr GetCurrentProcess();

    static Win32Exception Failure(string operation) {
        var error = new Win32Exception(Marshal.GetLastWin32Error());
        return new Win32Exception(error.NativeErrorCode, operation + " failed: " + error.Message);
    }

    static uint LastSubAuthority(IntPtr sid) {
        byte count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
        return unchecked((uint)Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)(count - 1))));
    }

    // Names follow Security::IntegrityLevel::ToString in the Windows App SDK.
    public static string IntegrityName(uint rid) {
        switch (rid) {
            case 0x0000: return "Untrusted";
            case 0x1000: return "Low";
            case 0x2000: return "Medium";
            case 0x2100: return "MediumPlus";
            case 0x3000: return "High";
            case 0x4000: return "System";
            case 0x5000: return "ProtectedProcess";
        }
        return "0x" + rid.ToString("X4");
    }

    static T Read<T>(IntPtr token, int kind, Func<IntPtr, T> read) {
        int length;
        GetTokenInformation(token, kind, IntPtr.Zero, 0, out length);
        IntPtr buffer = Marshal.AllocHGlobal(length);
        try {
            if (!GetTokenInformation(token, kind, buffer, length, out length)) throw Failure("GetTokenInformation(" + kind + ")");
            return read(buffer);
        } finally { Marshal.FreeHGlobal(buffer); }
    }

    // TokenElevation stays true for the Safer token of the built-in Administrator (hosted windows-latest producer run), so the
    // Administrators group decides. A deny-only group grants nothing and only denies:
    // https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-token_groups
    static string AdministratorsState(IntPtr buffer) {
        int count = Marshal.ReadInt32(buffer);
        int size = Marshal.SizeOf(typeof(SidAndAttributes));
        for (int index = 0; index < count; index++) {
            var group = (SidAndAttributes)Marshal.PtrToStructure(buffer + IntPtr.Size + index * size, typeof(SidAndAttributes));
            if (new SecurityIdentifier(group.Sid).Value != AdministratorsSid) continue;
            if ((group.Attributes & SeGroupUseForDenyOnly) != 0) return "denyOnly";
            return (group.Attributes & SeGroupEnabled) != 0 ? "enabled" : "disabled";
        }
        return "absent";
    }

    public static TokenContext Describe(IntPtr process) {
        IntPtr token;
        if (!OpenProcessToken(process, TokenQuery, out token)) throw Failure("OpenProcessToken");
        try {
            var context = new TokenContext();
            Read(token, TokenUserClass, buffer => {
                IntPtr sid = Marshal.ReadIntPtr(buffer);
                context.Sid = new SecurityIdentifier(sid).Value;
                context.Rid = LastSubAuthority(sid);
                return true;
            });
            context.IntegrityRid = Read(token, TokenIntegrityLevelClass, buffer => LastSubAuthority(Marshal.ReadIntPtr(buffer)));
            context.Integrity = IntegrityName(context.IntegrityRid);
            context.TokenIsElevated = Read(token, TokenElevationClass, buffer => Marshal.ReadInt32(buffer) != 0);
            context.Administrators = Read<string>(token, TokenGroupsClass, AdministratorsState);
            context.Session = Read(token, TokenSessionIdClass, buffer => unchecked((uint)Marshal.ReadInt32(buffer)));
            return context;
        } finally { CloseHandle(token); }
    }

    public static TokenContext DescribeCurrent() { return Describe(GetCurrentProcess()); }

    public static uint StartAsStandardUser(string application, string commandLine, string directory) {
        IntPtr level = IntPtr.Zero, token = IntPtr.Zero, sid = IntPtr.Zero, label = IntPtr.Zero;
        try {
            if (!SaferCreateLevel(SaferScopeUser, SaferLevelNormalUser, SaferLevelOpen, out level, IntPtr.Zero)) throw Failure("SaferCreateLevel");
            // A null input token computes the restricted token from this process's own token.
            if (!SaferComputeTokenFromLevel(level, IntPtr.Zero, out token, 0, IntPtr.Zero)) throw Failure("SaferComputeTokenFromLevel");
            if (!ConvertStringSidToSidW(MediumSid, out sid)) throw Failure("ConvertStringSidToSid");
            int size = Marshal.SizeOf(typeof(SidAndAttributes)) + GetLengthSid(sid);
            label = Marshal.AllocHGlobal(size);
            Marshal.StructureToPtr(new SidAndAttributes { Sid = sid, Attributes = SeGroupIntegrity }, label, false);
            if (!SetTokenInformation(token, TokenIntegrityLevelClass, label, size)) throw Failure("SetTokenInformation(TokenIntegrityLevel)");
            // A null desktop inherits the caller's window station and desktop, so the shell stays in the runner's interactive session.
            var startup = new StartupInfo { cb = (uint)Marshal.SizeOf(typeof(StartupInfo)) };
            ProcessInformation information;
            if (!CreateProcessAsUserW(token, application, new StringBuilder(commandLine), IntPtr.Zero, IntPtr.Zero, false, CreateNoWindow,
                IntPtr.Zero, directory, ref startup, out information)) throw Failure("CreateProcessAsUser");
            CloseHandle(information.hThread);
            CloseHandle(information.hProcess);
            return information.dwProcessId;
        } finally {
            if (label != IntPtr.Zero) Marshal.FreeHGlobal(label);
            if (sid != IntPtr.Zero) LocalFree(sid);
            if (token != IntPtr.Zero) CloseHandle(token);
            if (level != IntPtr.Zero) SaferCloseLevel(level);
        }
    }
}

// NotificationActivationCallback.h in the Windows SDK; activate mode confirms this IID against the installed header.
[ComImport, Guid(OrbitActivation.CallbackInterface), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface INotificationActivationCallback {
    [PreserveSig]
    int Activate([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [MarshalAs(UnmanagedType.LPWStr)] string invokedArgs, IntPtr data, uint count);
}

// The call Windows makes on a toast click: CoCreateInstance of the app's activator CLSID out of process, then
// INotificationActivationCallback::Activate with the AUMID, the clicked action's arguments and its user input. COM routes the
// call to the running shell's class object only for a client whose token matches the shell's token, and else starts the
// LocalServer32 command, as it does for a click while the shell is not running.
public static class OrbitActivation {
    public const string CallbackInterface = "53e31837-6600-4a81-9395-75cffe746f94";
    const uint LocalServer = 0x4;

    [DllImport("ole32.dll")]
    static extern int CoCreateInstance([In] ref Guid clsid, IntPtr outer, uint context, [In] ref Guid iid,
        [MarshalAs(UnmanagedType.IUnknown)] out object instance);

    public static int Activate(string clsid, string appUserModelId, string invokedArgs) {
        var classId = new Guid(clsid);
        var interfaceId = new Guid(CallbackInterface);
        object instance;
        int created = CoCreateInstance(ref classId, IntPtr.Zero, LocalServer, ref interfaceId, out instance);
        if (created < 0) throw new COMException("CoCreateInstance(" + clsid + ", CLSCTX_LOCAL_SERVER) failed with 0x" + created.ToString("X8"), created);
        // The Done toast has no input field, so the click carries no user input: count 0, with a non-null zeroed entry.
        IntPtr data = Marshal.AllocCoTaskMem(2 * IntPtr.Size);
        try {
            Marshal.WriteIntPtr(data, IntPtr.Zero);
            Marshal.WriteIntPtr(data, IntPtr.Size, IntPtr.Zero);
            return ((INotificationActivationCallback)instance).Activate(appUserModelId, invokedArgs, data, 0);
        } finally {
            Marshal.FreeCoTaskMem(data);
            Marshal.ReleaseComObject(instance);
        }
    }
}
'@

function ConvertTo-LaunchContext($Token) {
    $user = try { ([Security.Principal.SecurityIdentifier]$Token.Sid).Translate([Security.Principal.NTAccount]).Value } catch { $Token.Sid }
    [ordered]@{ user = $user; sid = $Token.Sid; rid = $Token.Rid; integrity = $Token.Integrity; integrityRid = $Token.IntegrityRid
        tokenIsElevated = $Token.TokenIsElevated; administrators = $Token.Administrators; session = $Token.Session }
}

function Write-Status($Entry) {
    [IO.File]::AppendAllText($Status, (($Entry | ConvertTo-Json -Compress) + "`n"), [Text.UTF8Encoding]::new($false))
}

# Only the High modes call this: it opens the output to the Medium processes and compiles the native types there.
function Initialize-MediumOutput([string]$Directory) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    # The Medium token keeps the user SID, so an inherited grant to that SID passes the DACL check on every file the shell writes.
    & icacls.exe $Directory /grant "*$($identity.User.Value):(OI)(CI)M" /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls could not grant the acceptance output to $($identity.Name)" }
    # Mandatory Integrity Control refuses a write up from Medium to a High object, and new objects take the creator's level
    # (https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control). Thus the output and every file
    # in it, the installed shell included, carry an explicit Medium label, which new files inherit.
    & icacls.exe $Directory /setintegritylevel '(OI)(CI)M' /T /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls could not label $Directory at Medium integrity" }
    $label = (& icacls.exe $Directory | Select-String 'Mandatory Label' | ForEach-Object { $_.Line.Trim() }) -join '; '
    # Each launch compiles its own library, because an earlier launcher can still hold its library open.
    $assembly = Join-Path $Directory ('OrbitIntegrity-{0}.dll' -f [guid]::NewGuid().ToString('N'))
    Add-Type -TypeDefinition $integritySource -OutputAssembly $assembly -OutputType Library
    Add-Type -Path $assembly
    @{ assembly = $assembly; label = $label }
}

function Start-MediumMode([string]$Directory, [string]$Arguments) {
    $powershell = Join-Path $PSHOME 'powershell.exe'
    $commandLine = '"{0}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{1}" {2}' -f $powershell, $PSCommandPath, $Arguments
    [OrbitIntegrity]::StartAsStandardUser($powershell, $commandLine, $Directory)
}

# The Windows App SDK names an unpackaged app by the NotificationGUID value under HKCU Software\Classes\AppUserModelId\<the
# executable path with every backslash replaced by a dot>. It keeps the activator CLSID in the CustomActivator value under
# AppUserModelId\<that AUMID>, and registers `"<executable>" ----AppNotificationActivated:` as the LocalServer32 of that CLSID
# (AppNotificationUtility.cpp RetrieveUnpackagedNotificationAppId, GetActivatorGuid and RegisterComServer, microsoft/WindowsAppSDK v1.7.9).
function Get-ActivatorRegistration([string]$Path) {
    $classes = 'HKCU:\Software\Classes'
    $appId = (Get-ItemProperty -LiteralPath "$classes\AppUserModelId\$($Path.Replace('\', '.'))" -Name NotificationGUID -ErrorAction SilentlyContinue).NotificationGUID
    if (-not $appId) { throw "No NotificationGUID for $Path under $classes\AppUserModelId" }
    $clsid = (Get-ItemProperty -LiteralPath "$classes\AppUserModelId\$appId" -Name CustomActivator -ErrorAction SilentlyContinue).CustomActivator
    if (-not $clsid) { throw "No CustomActivator value for the AUMID $appId" }
    $server = (Get-ItemProperty -LiteralPath "$classes\CLSID\$clsid\LocalServer32" -ErrorAction SilentlyContinue).'(default)'
    $expected = '"{0}" ----AppNotificationActivated:' -f $Path
    if ($server -ne $expected) { throw "The activator $clsid starts $(if ($server) { $server } else { 'nothing' }), not $expected" }
    [ordered]@{ appId = $appId; clsid = $clsid; server = $server }
}

# A click passes the clicked action's arguments attribute as the posted toast XML holds it (AppNotificationButton
# GetActivationArguments builds it), so the Done arguments come from the toast in the shell AUMID's history.
function Get-ToastAction([string[]]$Payloads, [string]$Title, [string]$Label) {
    $toasts = New-Object 'System.Collections.Generic.List[object]'
    foreach ($payload in $Payloads) {
        $document = New-Object System.Xml.XmlDocument
        $document.LoadXml($payload)
        if (@($document.SelectNodes('//text') | ForEach-Object { $_.InnerText }) -notcontains $Title) { continue }
        $toasts.Add(@($document.SelectNodes('//action') | Where-Object { $_.GetAttribute('content') -eq $Label }))
    }
    if ($toasts.Count -ne 1) { throw "Expected one posted toast titled $Title, found $($toasts.Count) among $($Payloads.Count)" }
    $actions = $toasts[0]
    if ($actions.Count -ne 1) { throw "Expected one $Label action on the toast titled $Title, found $($actions.Count)" }
    $actions[0].GetAttribute('arguments')
}

# The activation type declares the INotificationActivationCallback IID by hand, so the IID must match every installed SDK header.
function Confirm-CallbackInterface {
    $headers = @(Get-ChildItem -Path (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Include\*\um\NotificationActivationCallback.h') -ErrorAction SilentlyContinue)
    if (-not $headers.Count) { throw 'No installed Windows SDK has NotificationActivationCallback.h, so the INotificationActivationCallback IID is unconfirmed' }
    foreach ($header in $headers) {
        $declared = [regex]::Match((Get-Content -LiteralPath $header.FullName -Raw), 'MIDL_INTERFACE\("([0-9a-fA-F-]{36})"\)\s*INotificationActivationCallback\b')
        if (-not $declared.Success) { throw "$($header.FullName) declares no INotificationActivationCallback interface" }
        if ($declared.Groups[1].Value -ne [OrbitActivation]::CallbackInterface) {
            throw "$($header.FullName) declares INotificationActivationCallback as $($declared.Groups[1].Value), not $([OrbitActivation]::CallbackInterface)"
        }
    }
    $headers[-1].FullName
}

switch ($Mode) {
    'run' {
        try {
            [void][Reflection.Assembly]::LoadFrom($Assembly)
            Write-Status ([ordered]@{ kind = 'context'; context = (ConvertTo-LaunchContext ([OrbitIntegrity]::DescribeCurrent())) })
            # The shell reaches the hermetic origin directly, as it did before the Medium launch.
            foreach ($name in 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY') { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
            $process = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable) -PassThru `
                -RedirectStandardError $Log -RedirectStandardOutput $Output
            # WHY: Process.ExitCode stays empty after Start-Process -PassThru unless the process handle is opened first.
            $handle = $process.Handle
            $launch = [ordered]@{ kind = 'launch'; pid = $process.Id }
            try { $launch.shell = ConvertTo-LaunchContext ([OrbitIntegrity]::Describe($handle)) } catch { $launch.shellError = $_.Exception.Message }
            Write-Status $launch
            $process.WaitForExit()
            Write-Status ([ordered]@{ kind = 'exit'; code = $process.ExitCode })
        } catch {
            Write-Status ([ordered]@{ kind = 'error'; message = $_.Exception.Message })
            throw
        }
    }
    'notify' {
        try {
            [void][Reflection.Assembly]::LoadFrom($Assembly)
            Write-Status ([ordered]@{ kind = 'context'; context = (ConvertTo-LaunchContext ([OrbitIntegrity]::DescribeCurrent())) })
            $call = Get-Content -LiteralPath $Request -Raw | ConvertFrom-Json
            Write-Status ([ordered]@{ kind = 'activated'; hresult = [OrbitActivation]::Activate($call.clsid, $call.appId, $call.arguments) })
        } catch {
            # PowerShell wraps an exception from a .NET method in "Exception calling ...", so the status keeps the COM message.
            Write-Status ([ordered]@{ kind = 'error'; message = $_.Exception.GetBaseException().Message })
            throw
        }
    }
    'start' {
        $directory = Split-Path -Parent $Status
        $prepared = Initialize-MediumOutput $directory
        $launcher = Start-MediumMode $directory ('-Mode run -Executable "{0}" -Log "{1}" -Output "{2}" -Status "{3}" -Assembly "{4}"' -f
            $Executable, $Log, $Output, $Status, $prepared.assembly)
        [ordered]@{ harness = (ConvertTo-LaunchContext ([OrbitIntegrity]::DescribeCurrent())); launcher = $launcher; outputLabel = $prepared.label } |
            ConvertTo-Json -Compress
    }
    'activate' {
        $directory = Split-Path -Parent $Status
        $prepared = Initialize-MediumOutput $directory
        $header = Confirm-CallbackInterface
        $registration = Get-ActivatorRegistration $Executable
        $manager = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
        $arguments = Get-ToastAction @($manager::History.GetHistory($registration.appId) | ForEach-Object { $_.Content.GetXml() }) $Title $Label
        # The arguments carry the one-use Done token, so they reach the client through a file the artifacts never upload.
        $call = [ordered]@{ clsid = $registration.clsid; appId = $registration.appId; arguments = $arguments }
        [IO.File]::WriteAllText($Request, ($call | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
        $client = Start-MediumMode $directory ('-Mode notify -Status "{0}" -Assembly "{1}" -Request "{2}"' -f $Status, $prepared.assembly, $Request)
        [ordered]@{ harness = (ConvertTo-LaunchContext ([OrbitIntegrity]::DescribeCurrent())); client = $client; header = $header
            registration = $registration; argumentKeys = @($arguments.Split(';') | ForEach-Object { $_.Split('=')[0] }) } | ConvertTo-Json -Compress
    }
}
