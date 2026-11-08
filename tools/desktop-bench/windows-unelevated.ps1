param(
    [Parameter(Mandatory = $true)][ValidateSet('start', 'run')][string]$Mode,
    [string]$Executable,
    [string]$Log,
    [string]$Output,
    [string]$Status,
    [string]$Assembly
)
$ErrorActionPreference = 'Stop'

# The Windows App SDK refuses app notifications when the token integrity level is High or above
# (AppNotificationManager::IsSupported and Security.IntegrityLevel.h in microsoft/WindowsAppSDK), so the installed
# shell starts at Medium integrity, the level of a person's app. Microsoft's documented way to start a child at a
# lower level duplicates the caller's token, sets TokenIntegrityLevel and calls CreateProcessAsUser:
# https://learn.microsoft.com/en-us/previous-versions/dotnet/articles/bb625960(v=msdn.10)
# Add-Type compiles through CodeDom, which fails at Medium integrity with "A required privilege is not held by the
# client" (a hosted windows-latest probe reproduced it). Thus start mode, which runs at High, compiles this type into
# a library once, and the Medium launcher only loads that library.
$integritySource = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

public static class OrbitIntegrity {
    const uint TokenAssignPrimary = 0x0001, TokenDuplicate = 0x0002, TokenQuery = 0x0008, TokenAdjustDefault = 0x0080;
    const int TokenUserClass = 1, TokenSessionIdClass = 12, TokenElevationClass = 20, TokenIntegrityLevelClass = 25;
    const uint SeGroupIntegrity = 0x20, CreateNoWindow = 0x08000000;
    const int SecurityImpersonation = 2, TokenPrimary = 1;
    public const string MediumSid = "S-1-16-8192";

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
        public uint Session { get; set; }
    }

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr buffer, int length, out int returned);
    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool SetTokenInformation(IntPtr token, int kind, IntPtr buffer, int length);
    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool DuplicateTokenEx(IntPtr token, uint access, IntPtr attributes, int impersonation, int type, out IntPtr duplicate);
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
            context.Session = Read(token, TokenSessionIdClass, buffer => unchecked((uint)Marshal.ReadInt32(buffer)));
            return context;
        } finally { CloseHandle(token); }
    }

    public static TokenContext DescribeCurrent() { return Describe(GetCurrentProcess()); }

    public static uint StartAtMedium(string application, string commandLine, string directory) {
        IntPtr token = IntPtr.Zero, duplicate = IntPtr.Zero, sid = IntPtr.Zero, label = IntPtr.Zero;
        try {
            if (!OpenProcessToken(GetCurrentProcess(), TokenDuplicate | TokenAdjustDefault | TokenQuery | TokenAssignPrimary, out token)) {
                throw Failure("OpenProcessToken");
            }
            if (!DuplicateTokenEx(token, 0, IntPtr.Zero, SecurityImpersonation, TokenPrimary, out duplicate)) throw Failure("DuplicateTokenEx");
            if (!ConvertStringSidToSidW(MediumSid, out sid)) throw Failure("ConvertStringSidToSid");
            int size = Marshal.SizeOf(typeof(SidAndAttributes)) + GetLengthSid(sid);
            label = Marshal.AllocHGlobal(size);
            Marshal.StructureToPtr(new SidAndAttributes { Sid = sid, Attributes = SeGroupIntegrity }, label, false);
            if (!SetTokenInformation(duplicate, TokenIntegrityLevelClass, label, size)) throw Failure("SetTokenInformation(TokenIntegrityLevel)");
            // A null desktop inherits the caller's window station and desktop, so the shell stays in the runner's interactive session.
            var startup = new StartupInfo { cb = (uint)Marshal.SizeOf(typeof(StartupInfo)) };
            ProcessInformation information;
            if (!CreateProcessAsUserW(duplicate, application, new StringBuilder(commandLine), IntPtr.Zero, IntPtr.Zero, false, CreateNoWindow,
                IntPtr.Zero, directory, ref startup, out information)) throw Failure("CreateProcessAsUser");
            CloseHandle(information.hThread);
            CloseHandle(information.hProcess);
            return information.dwProcessId;
        } finally {
            if (label != IntPtr.Zero) Marshal.FreeHGlobal(label);
            if (sid != IntPtr.Zero) LocalFree(sid);
            if (duplicate != IntPtr.Zero) CloseHandle(duplicate);
            if (token != IntPtr.Zero) CloseHandle(token);
        }
    }
}
'@

function ConvertTo-LaunchContext($Token) {
    $user = try { ([Security.Principal.SecurityIdentifier]$Token.Sid).Translate([Security.Principal.NTAccount]).Value } catch { $Token.Sid }
    [ordered]@{ user = $user; sid = $Token.Sid; rid = $Token.Rid; integrity = $Token.Integrity; integrityRid = $Token.IntegrityRid
        tokenIsElevated = $Token.TokenIsElevated; session = $Token.Session }
}

function Write-Status($Entry) {
    [IO.File]::AppendAllText($Status, (($Entry | ConvertTo-Json -Compress) + "`n"), [Text.UTF8Encoding]::new($false))
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
    'start' {
        $directory = Split-Path -Parent $Status
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        # The Medium token keeps the user SID, so an inherited grant to that SID passes the DACL check on every file the shell writes.
        & icacls.exe $directory /grant "*$($identity.User.Value):(OI)(CI)M" /Q | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "icacls could not grant the acceptance output to $($identity.Name)" }
        # Mandatory Integrity Control refuses a write up from Medium to a High object, and new objects take the creator's level
        # (https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control). Thus the output and every file
        # in it, the installed shell included, carry an explicit Medium label, which new files inherit.
        & icacls.exe $directory /setintegritylevel '(OI)(CI)M' /T /Q | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "icacls could not label $directory at Medium integrity" }
        $label = (& icacls.exe $directory | Select-String 'Mandatory Label' | ForEach-Object { $_.Line.Trim() }) -join '; '
        # Each launch compiles its own library, because an earlier launcher can still hold its library open.
        $assembly = Join-Path $directory ('OrbitIntegrity-{0}.dll' -f [guid]::NewGuid().ToString('N'))
        Add-Type -TypeDefinition $integritySource -OutputAssembly $assembly -OutputType Library
        Add-Type -Path $assembly
        $powershell = Join-Path $PSHOME 'powershell.exe'
        $commandLine = ('"{0}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{1}" -Mode run -Executable "{2}" -Log "{3}" -Output "{4}"' +
            ' -Status "{5}" -Assembly "{6}"') -f $powershell, $PSCommandPath, $Executable, $Log, $Output, $Status, $assembly
        $launcher = [OrbitIntegrity]::StartAtMedium($powershell, $commandLine, $directory)
        [ordered]@{ harness = (ConvertTo-LaunchContext ([OrbitIntegrity]::DescribeCurrent())); launcher = $launcher; outputLabel = $label } |
            ConvertTo-Json -Compress
    }
}
