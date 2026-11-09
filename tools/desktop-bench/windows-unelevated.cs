// Native types of windows-unelevated.ps1, which compiles them in its High modes. acceptance-uia.ps1 compiles them too, for the
// token levels of the shell hosts, so one token reader names every integrity level the acceptance reports.
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

public static class OrbitIntegrity {
    const uint TokenQuery = 0x0008, ProcessQueryLimitedInformation = 0x1000;
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
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);

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

    // PROCESS_QUERY_LIMITED_INFORMATION is the least access OpenProcessToken accepts, so a High reader opens the most processes.
    public static TokenContext DescribeProcess(uint processId) {
        IntPtr process = OpenProcess(ProcessQueryLimitedInformation, false, processId);
        if (process == IntPtr.Zero) throw Failure("OpenProcess");
        try { return Describe(process); } finally { CloseHandle(process); }
    }

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
